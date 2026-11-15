"""API usada pelo tablet do tripulante. Tudo o que é medido e decidido fica a bordo;
o que vem da Terra só aparece depois do atraso."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, or_, func
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import (Person, Triage, Decision, Alert, AlertAck, Message, MessageAck, CrewMessage, AccessLog, Packet, utcnow)
from ..security import require_crew
from ..services import link, ops, physiology as phy, triage as tri, hazards as hz

router = APIRouter(prefix="/api/tablet", tags=["tablet"])


class MeasIn(BaseModel):
    indicator: str
    value: float | None = None
    text: str | None = None
    method: str = ""
    device: str = ""
    quality: str = "boa"


class MeasBatch(BaseModel):
    label: str = "Medição"
    items: list[MeasIn]


class TextIn(BaseModel):
    text: str


class CrewMsgIn(BaseModel):
    text: str
    reply_to: str | None = None


def _iso(d):
    return d.isoformat() if d else None


@router.get("/summary")
def summary(p: Person = Depends(require_crew), db: Session = Depends(get_db)):
    link.pump(db)
    now = utcnow()
    vals = phy.latest(db, p.id)
    ev = phy.evaluate(db, p.id, vals)
    hist = {k: [{"t": m.measured_at.isoformat(), "v": m.value} for m in phy.history(db, p.id, k)]
            for k in ("heart_rate", "reaction_ms", "sleep_h")}
    base = {k: phy.baseline(db, p.id, k) for k in ("heart_rate", "reaction_ms", "sleep_h")}

    msgs = db.scalars(select(Message).where(or_(Message.to_person_id.is_(None), Message.to_person_id == p.id),
                                            Message.ship_visible_at.is_not(None), Message.ship_visible_at <= now)
                      .order_by(Message.created_at.desc()).limit(20)).all()
    acks = {a.message_id: a.at for a in db.scalars(select(MessageAck).where(MessageAck.person_id == p.id))}
    in_transit = db.scalars(select(Packet).where(Packet.direction == "down", Packet.kind == "message",
                                                 Packet.status != "delivered")).all()

    tris = db.scalars(select(Triage).where(Triage.person_id == p.id).order_by(Triage.created_at.desc()).limit(10)).all()
    tri_out = []
    for t in tris:
        d = db.scalars(select(Decision).where(Decision.triage_id == t.id, Decision.ship_visible_at.is_not(None),
                                              Decision.ship_visible_at <= now).order_by(Decision.created_at.desc())).first()
        tri_out.append({"id": t.id, "text": t.text, "summary": t.summary, "level": t.level, "conduct": t.conduct,
                        "prevention": t.prevention, "rule": t.rule, "provider": t.provider, "at": t.created_at.isoformat(),
                        "decision": {"type": d.type, "level": d.level, "text": d.text, "at": d.ship_visible_at.isoformat()} if d else None})

    alerts = []
    for a in db.scalars(select(Alert).where(Alert.active.is_(True))):
        who = db.get(Person, a.person_id)
        acked = {x.person_id: x.at.isoformat() for x in db.scalars(select(AlertAck).where(AlertAck.alert_id == a.id))}
        alerts.append({"id": a.id, "person": {"id": who.id, "code": who.code, "name": who.name}, "rule": a.rule,
                       "values": a.values, "at": a.created_at.isoformat(), "acks": acked,
                       "crew": [{"id": c.id, "code": c.code, "first_name": c.first_name}
                                for c in db.scalars(select(Person).where(Person.kind == "crew").order_by(Person.id))]})

    viewed = db.scalars(select(AccessLog).where(AccessLog.target_person_id == p.id).order_by(AccessLog.at.desc()).limit(12)).all()
    return {
        "person": {"id": p.id, "code": p.code, "name": p.name, "first_name": p.first_name, "role": p.role, "color": p.color},
        "mission": link.mission_dict(db), "location": phy.location(p, now),
        "values": vals, "eval": ev, "baseline": base, "history": hist,
        "messages": [{"id": m.id, "text": m.text, "priority": m.priority, "action": m.action, "all": m.to_person_id is None,
                      "arrived": _iso(m.ship_visible_at), "acked": _iso(acks.get(m.id))} for m in msgs],
        "messages_in_transit": len(in_transit),
        "sent": [{"id": c.id, "text": c.text, "at": c.created_at.isoformat(), "reply_to": c.reply_to,
                  "arrives": _iso(c.earth_visible_at), "read": _iso(c.read_at)}
                 for c in db.scalars(select(CrewMessage).where(CrewMessage.person_id == p.id)
                                     .order_by(CrewMessage.created_at.desc()).limit(20))],
        "triages": tri_out, "alerts": alerts, "dose": (dose := ops.dose(db, p)),
        "hazards": (haz := hz.evaluate(db, p, dose=dose, cabin=(cab := ops.cabin_at(db, now)))), "cabin": cab,
        "overall": hz.overall(haz),
        "access_log": [{"who": (db.get(Person, a.actor_id).name if a.actor_id else "?"), "what": a.what,
                        "allowed": a.allowed, "at": a.at.isoformat()} for a in viewed],
        "ai": {"provider": "ollama" if tri.OLLAMA_URL else "regras", "rules_version": tri.RULES["version"]},
    }


@router.post("/measurements")
def measurements(body: MeasBatch, p: Person = Depends(require_crew), db: Session = Depends(get_db)):
    allowed = set(phy.UNITS)
    items = [i.model_dump() for i in body.items if i.indicator in allowed]
    if not items:
        raise HTTPException(400, "Sem medições válidas")
    batch = ops.add_measurements(db, p, items, body.label)
    vals = phy.latest(db, p.id)
    return {"batch": batch, "eval": phy.evaluate(db, p.id, vals), "mission": link.mission_dict(db)}


@router.post("/triage/summary")
def triage_summary(body: TextIn, p: Person = Depends(require_crew)):
    """Passo 2 da triagem: a IA de bordo resume para a pessoa confirmar."""
    if not body.text.strip():
        raise HTTPException(400, "Texto vazio")
    return tri.summarise(body.text)


@router.post("/triage")
def triage(body: TextIn, p: Person = Depends(require_crew), db: Session = Depends(get_db)):
    t = ops.create_triage(db, p, body.text.strip()[:1000])
    return {"id": t.id, "level": t.level, "conduct": t.conduct, "prevention": t.prevention, "rule": t.rule,
            "summary": t.summary, "provider": t.provider}


@router.post("/messages")
def send_to_earth(body: CrewMsgIn, p: Person = Depends(require_crew), db: Session = Depends(get_db)):
    text = body.text.strip()[:1000]
    if not text:
        raise HTTPException(400, "Mensagem vazia")
    n = db.scalar(select(func.count()).select_from(CrewMessage)) or 0
    c = CrewMessage(id=f"TX-{101 + n:03d}", person_id=p.id, text=text, reply_to=body.reply_to)
    db.add(c)
    db.flush()
    link.enqueue(db, "up", "crew_message", c.id, f"Mensagem de {p.code} para a Terra", 3)
    link.log(db, "Bordo", f"{p.code} enviou a mensagem {c.id} para a Terra")
    db.commit()
    link.pump(db)
    return {"id": c.id, "arrives": _iso(c.earth_visible_at)}


@router.post("/messages/{mid}/ack")
def ack_message(mid: str, p: Person = Depends(require_crew), db: Session = Depends(get_db)):
    m = db.get(Message, mid)
    if not m or (m.to_person_id not in (None, p.id)):
        raise HTTPException(404)
    ops.ack_message(db, m, p)
    link.pump(db)
    return {"ok": True}


@router.post("/alerts/{aid}/ack")
def ack_alert(aid: str, p: Person = Depends(require_crew), db: Session = Depends(get_db)):
    if not db.get(Alert, aid):
        raise HTTPException(404)
    ops.ack_alert(db, aid, p)
    link.pump(db)
    return {"ok": True}


EXPLAIN = {
    "heart_rate": "Frequência cardíaca de repouso {v} bpm; o seu normal é {b} bpm. Sem gravidade o coração trabalha menos e pode perder condição; o exercício aeróbico diário ajuda.",
    "reaction_ms": "Tempo de reacção {v} ms; o seu normal é {b} ms. Noites curtas e cansaço tornam a atenção mais lenta, mesmo sem dar por isso.",
    "sleep_h": "Dormiu {v} h; o seu normal é {b} h. O isolamento e a luz da nave afectam o sono; manter o horário ajuda.",
}


@router.get("/explain/{indicator}")
def explain(indicator: str, p: Person = Depends(require_crew), db: Session = Depends(get_db)):
    vals = phy.latest(db, p.id)
    if indicator not in EXPLAIN or indicator not in vals:
        return {"text": "Sem dados suficientes para explicar este indicador.", "label": "Porquê esta medição?"}
    return {"text": EXPLAIN[indicator].format(v=vals[indicator]["value"], b=phy.baseline(db, p.id, indicator)),
            "label": "Explicação da IA, não é uma decisão médica"}
