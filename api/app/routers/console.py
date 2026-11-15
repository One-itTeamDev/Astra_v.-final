"""API da consola de missão (cirurgiã de voo, na Terra). Só vê o que já atravessou a ligação."""
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import DISTANCES
from ..db import get_db
from ..models import (Person, Triage, Decision, Alert, AlertAck, Message, MessageAck, CrewMessage, Packet, Event, AccessLog, utcnow)
from ..security import require_surgeon, access
from ..services import link, ops, physiology as phy

router = APIRouter(prefix="/api", tags=["consola"])


class MissionPatch(BaseModel):
    distance: str | None = None
    link_open: bool | None = None
    demo_mode: bool | None = None


class DecisionIn(BaseModel):
    type: str          # validar | corrigir | info
    level: str
    text: str


class MessageIn(BaseModel):
    to: str            # "all" ou id do tripulante
    priority: str = "normal"
    text: str
    action: str = ""


def _visible(col):
    return (col.is_not(None)) & (col <= utcnow())


@router.get("/mission")
def get_mission(db: Session = Depends(get_db)):
    link.pump(db)
    return link.mission_dict(db)


@router.patch("/mission")
def patch_mission(body: MissionPatch, p: Person = Depends(require_surgeon), db: Session = Depends(get_db)):
    m = link.mission(db)
    if body.distance and body.distance in DISTANCES and body.distance != m.distance:
        m.distance = body.distance
        link.log(db, "Terra", f"Distância definida: {DISTANCES[m.distance]['label']} (atraso {DISTANCES[m.distance]['text']})")
    if body.demo_mode is not None and body.demo_mode != m.demo_mode:
        m.demo_mode = body.demo_mode
        link.log(db, "Terra", f"Modo demonstração {'ligado (atraso ÷60)' if m.demo_mode else 'desligado (atraso real)'}")
    if body.link_open is not None and body.link_open != m.link_open:
        m.link_open, m.link_changed_at = body.link_open, utcnow()
        link.log(db, "Terra", "Ligação Terra–nave reaberta, a fila retoma" if m.link_open else "Ligação Terra–nave CORTADA")
    db.commit()
    link.pump(db)
    return link.mission_dict(db)


@router.get("/console/overview")
def overview(p: Person = Depends(require_surgeon), db: Session = Depends(get_db)):
    link.pump(db)
    now = utcnow()
    crew = db.scalars(select(Person).where(Person.kind == "crew").order_by(Person.id)).all()
    t_view, _ = ops.earth_view_time(db)

    pending = []
    for t in db.scalars(select(Triage).where(_visible(Triage.earth_visible_at)).order_by(Triage.created_at.desc())):
        if db.scalar(select(Decision.id).where(Decision.triage_id == t.id)):
            continue
        who = db.get(Person, t.person_id)
        pending.append({"id": t.id, "person": {"id": who.id, "code": who.code, "name": who.name, "color": who.color},
                        "level": t.level, "symptoms": t.summary.get("symptoms", []), "ai_summary": t.ai_summary,
                        "rule": t.rule, "at": t.created_at.isoformat()})

    alerts = []
    for a in db.scalars(select(Alert).where(_visible(Alert.earth_visible_at)).order_by(Alert.created_at.desc()).limit(6)):
        who = db.get(Person, a.person_id)
        acks = {x.person_id: x.at.isoformat() for x in db.scalars(select(AlertAck).where(AlertAck.alert_id == a.id, _visible(AlertAck.earth_visible_at)))}
        alerts.append({"id": a.id, "person": {"id": who.id, "code": who.code, "name": who.name}, "rule": a.rule,
                       "values": a.values, "at": a.created_at.isoformat(), "acks": acks, "triage_id": a.triage_id,
                       "resolved": a.resolved_at is not None})

    sent = []
    for m in db.scalars(select(Message).order_by(Message.created_at.desc()).limit(8)):
        rc = [c for c in crew if m.to_person_id in (None, c.id)]
        acks = {x.person_id: x.at.isoformat() for x in db.scalars(select(MessageAck).where(MessageAck.message_id == m.id, _visible(MessageAck.earth_visible_at)))}
        sent.append({"id": m.id, "text": m.text, "priority": m.priority, "to": "all" if m.to_person_id is None else m.to_person_id,
                     "at": m.created_at.isoformat(), "arrives": m.ship_visible_at.isoformat() if m.ship_visible_at else None,
                     "delivered": bool(m.ship_visible_at and m.ship_visible_at <= now),
                     "acks": [{"code": c.code, "at": acks.get(c.id)} for c in rc]})

    inbox = []
    for cm in db.scalars(select(CrewMessage).where(_visible(CrewMessage.earth_visible_at))
                         .order_by(CrewMessage.created_at.desc()).limit(12)):
        who = db.get(Person, cm.person_id)
        inbox.append({"id": cm.id, "person": {"id": who.id, "code": who.code, "name": who.name, "color": who.color},
                      "text": cm.text, "reply_to": cm.reply_to, "at": cm.created_at.isoformat(),
                      "arrived": cm.earth_visible_at.isoformat(), "read": cm.read_at is not None})
    packets = db.scalars(select(Packet).order_by(Packet.seq.desc()).limit(14)).all()
    events = db.scalars(select(Event).order_by(Event.at.desc()).limit(60)).all()
    return {
        "mission": link.mission_dict(db), "cabin": ops.cabin_at(db, t_view),
        "crew": [ops.crew_card(db, c) for c in crew],
        "pending": pending, "alerts": alerts, "sent": sent, "inbox": inbox,
        "queue": [{"seq": k.seq, "dir": k.direction, "label": k.label, "priority": k.priority, "status": k.status,
                   "sent_at": k.sent_at.isoformat() if k.sent_at else None,
                   "arrive_at": k.arrive_at.isoformat() if k.arrive_at else None} for k in packets],
        "events": [{"at": e.at.isoformat(), "origin": e.origin, "text": e.text} for e in events],
    }


@router.get("/console/crew/{pid}")
def crew_detail(pid: int, p: Person = Depends(require_surgeon), db: Session = Depends(get_db)):
    c = db.get(Person, pid)
    if not c or c.kind != "crew":
        raise HTTPException(404)
    access(db, p, c.id, f"dados de saúde de {c.code}")
    link.log(db, "Terra", f"Acesso permitido, {p.name} → dados de {c.code}")
    db.commit()
    hist = {k: [{"t": m.measured_at.isoformat(), "v": m.value} for m in phy.history(db, c.id, k, earth_only=True)]
            for k in ("heart_rate", "reaction_ms", "sleep_h")}
    tris = db.scalars(select(Triage).where(Triage.person_id == c.id, _visible(Triage.earth_visible_at))
                      .order_by(Triage.created_at.desc()).limit(6)).all()
    return {"card": ops.crew_card(db, c), "history": hist,
            "baseline": {k: phy.baseline(db, c.id, k) for k in hist},
            "triages": [{"id": t.id, "level": t.level, "symptoms": t.summary.get("symptoms", []), "at": t.created_at.isoformat(),
                         "decided": bool(db.scalar(select(Decision.id).where(Decision.triage_id == t.id)))} for t in tris]}


@router.get("/console/triages/{tid}")
def triage_detail(tid: str, p: Person = Depends(require_surgeon), db: Session = Depends(get_db)):
    t = db.get(Triage, tid)
    if not t or not (t.earth_visible_at and t.earth_visible_at <= utcnow()):
        raise HTTPException(404, "Ainda não chegou à Terra")
    c = db.get(Person, t.person_id)
    access(db, p, c.id, f"triagem {t.id}")
    db.commit()
    return {"id": t.id, "person": {"id": c.id, "code": c.code, "name": c.name, "first_name": c.first_name},
            "text": t.text, "summary": t.summary, "level": t.level, "conduct": t.conduct, "prevention": t.prevention,
            "rule": t.rule, "provider": t.provider, "measurements": t.measurements_used, "ai_summary": t.ai_summary,
            "baseline": {k: phy.baseline(db, c.id, k) for k in ("heart_rate", "reaction_ms", "sleep_h")},
            "at": t.created_at.isoformat(), "delay_s": link.delay_s(link.mission(db))}


@router.post("/console/triages/{tid}/decision")
def decide(tid: str, body: DecisionIn, p: Person = Depends(require_surgeon), db: Session = Depends(get_db)):
    t = db.get(Triage, tid)
    if not t or body.type not in ("validar", "corrigir", "info") or body.level not in ("ok", "warn", "crit"):
        raise HTTPException(400)
    d = Decision(triage_id=t.id, type=body.type, level=body.level, text=body.text.strip()[:1000] or "Validado.", author_id=p.id)
    db.add(d)
    db.flush()
    link.enqueue(db, "down", "decision", d.id, f"Decisão sobre {t.id}: {body.type}", 4)
    link.log(db, "Terra", f"{p.name} decidiu {t.id}: {body.type}")
    db.commit()
    link.pump(db)
    return {"ok": True, "arrives": d.ship_visible_at.isoformat() if d.ship_visible_at else None}


@router.post("/console/messages")
def send_message(body: MessageIn, p: Person = Depends(require_surgeon), db: Session = Depends(get_db)):
    if not body.text.strip():
        raise HTTPException(400, "Mensagem vazia")
    to = None if body.to == "all" else int(body.to)
    n = db.scalar(select(Message.id).order_by(Message.created_at.desc()).limit(1))
    num = int(n.split("-")[1]) + 1 if n else 12
    m = Message(id=f"MSG-{num:03d}", to_person_id=to, priority=body.priority if body.priority in ("normal", "urgente") else "normal",
                text=body.text.strip()[:1000], action=body.action if body.action in ("", "shelter", "checkup") else "", author_id=p.id)
    db.add(m)
    db.flush()
    who = "toda a tripulação" if to is None else db.get(Person, to).code
    link.enqueue(db, "down", "message", m.id, f"Instrução {m.id} → {who}", 6 if m.priority == "urgente" else 2)
    link.log(db, "Terra", f"{p.name} enviou {m.id} ({m.priority}) para {who}")
    db.commit()
    link.pump(db)
    return {"id": m.id, "arrives": m.ship_visible_at.isoformat() if m.ship_visible_at else None}


@router.post("/console/inbox/{cid}/read")
def mark_read(cid: str, p: Person = Depends(require_surgeon), db: Session = Depends(get_db)):
    cm = db.get(CrewMessage, cid)
    if cm and not cm.read_at:
        cm.read_at = utcnow()
        access(db, p, cm.person_id, f"mensagem {cm.id}")
        db.commit()
    return {"ok": True}


@router.post("/console/alerts/{aid}/resolve")
def resolve(aid: str, p: Person = Depends(require_surgeon), db: Session = Depends(get_db)):
    a = db.get(Alert, aid)
    if not a:
        raise HTTPException(404)
    a.resolved_at = utcnow()
    link.enqueue(db, "down", "alert_resolve", a.id, f"Encerrar alerta {a.id}", 7)
    link.log(db, "Terra", f"{p.name} encerrou o alerta {a.id}")
    db.commit()
    link.pump(db)
    return {"ok": True}


@router.get("/console/access-log")
def access_log(p: Person = Depends(require_surgeon), db: Session = Depends(get_db)):
    rows = db.scalars(select(AccessLog).order_by(AccessLog.at.desc()).limit(40)).all()
    name = lambda i: db.get(Person, i).name if i else "desconhecido"   # noqa: E731
    return [{"at": r.at.isoformat(), "who": name(r.actor_id), "target": db.get(Person, r.target_person_id).code if r.target_person_id else "",
             "what": r.what, "allowed": r.allowed} for r in rows]


@router.post("/console/demo/{name}")
def demo(name: str, p: Person = Depends(require_surgeon), db: Session = Depends(get_db)):
    """Cenários para apresentações."""
    if name == "sep-replay":
        m = link.mission(db)
        m.sep_replay_until = utcnow() + timedelta(seconds=120)
        link.log(db, "Sistema", "Reprodução de um evento SEP (perfil tipo 2023-07-28, >100 pfu) durante 2 min")
        db.commit()
    elif name == "co2":
        from ..models import KeyValue
        start, until = utcnow(), utcnow() + timedelta(seconds=180)
        kv = db.get(KeyValue, "co2_event")
        val = {"start": start.isoformat(), "until": until.isoformat()}
        if kv:
            kv.value = val
        else:
            db.add(KeyValue(key="co2_event", value=val))
        link.log(db, "Bordo", "Removedor de CO₂ (CDRA) em falha simulada, CO₂ da cabine a subir durante 3 min")
        db.commit()
    elif name == "complaint-t4":
        ops.create_triage(db, db.get(Person, 4),
                          "Acordei com dor de cabeça forte e vejo um pouco desfocado do olho esquerdo. Estou enjoado.")
    elif name == "alert-t1":
        ops.create_triage(db, db.get(Person, 1), "Sinto falta de ar e o coração muito acelerado depois do ARED.")
    else:
        raise HTTPException(404)
    return {"ok": True}
