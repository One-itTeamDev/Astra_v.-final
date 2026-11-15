"""Relógio de missão e fila Terra–nave (secção 7 da documentação).

- Cada entrada que atravessa a ligação gera um pacote.
- Com a ligação aberta, os pacotes saem por prioridade e ordem; chegam `delay` segundos depois.
- Com a ligação cortada, ficam retidos e saem quando a ligação reabrir.
- À saída, a linha de origem recebe a hora de chegada (earth_visible_at / ship_visible_at).
"""
from datetime import timedelta

from sqlalchemy import select, func
from sqlalchemy.orm import Session

from ..config import DISTANCES, MISSION_DAY0_OFFSET_DAYS
from ..models import (Packet, MissionState, Measurement, Triage, Decision, Alert, AlertAck,
                      Message, MessageAck, CrewMessage, Event, utcnow)

# kind do pacote -> (modelo, coluna que fica visível do outro lado)
TARGETS = {
    "measurement": (Measurement, "earth_visible_at"),
    "triage": (Triage, "earth_visible_at"),
    "alert": (Alert, "earth_visible_at"),
    "alert_ack": (AlertAck, "earth_visible_at"),
    "message_ack": (MessageAck, "earth_visible_at"),
    "crew_message": (CrewMessage, "earth_visible_at"),
    "decision": (Decision, "ship_visible_at"),
    "message": (Message, "ship_visible_at"),
    "alert_resolve": (Alert, "resolve_ship_visible_at"),
}


def mission(db: Session) -> MissionState:
    m = db.get(MissionState, 1)
    if not m:
        m = MissionState(id=1)
        db.add(m)
        db.commit()
    return m


def delay_s(m: MissionState) -> float:
    d = DISTANCES[m.distance]
    return d["demo"] if m.demo_mode else d["delay"]


def met(m: MissionState) -> dict:
    """Tempo de missão: dia 142 + tempo real decorrido desde o arranque."""
    elapsed = (utcnow() - m.started_at).total_seconds() + MISSION_DAY0_OFFSET_DAYS * 86400
    return {"day": int(elapsed // 86400), "seconds": elapsed}


def log(db: Session, origin: str, text: str):
    db.add(Event(origin=origin, text=text[:300]))


def enqueue(db: Session, direction: str, kind: str, ref_id: str, label: str, priority: int = 0) -> Packet:
    seq = (db.scalar(select(func.max(Packet.seq))) or 40) + 1
    p = Packet(seq=seq, direction=direction, kind=kind, ref_id=str(ref_id), label=label[:120], priority=priority)
    db.add(p)
    db.flush()
    return p


def pump(db: Session) -> None:
    """Avança a fila. É chamado em cada pedido e por um ciclo em segundo plano."""
    m = mission(db)
    now = utcnow()
    if m.link_open:
        held = db.scalars(select(Packet).where(Packet.status == "held")
                          .order_by(Packet.priority.desc(), Packet.seq)).all()
        d = delay_s(m)
        for i, p in enumerate(held):
            p.sent_at = now + timedelta(milliseconds=150 * i)
            p.arrive_at = p.sent_at + timedelta(seconds=d)
            p.status = "transit"
            if p.kind == "measurements":     # um check-up = um pacote com várias medições
                for row in db.scalars(select(Measurement).where(Measurement.batch_id == p.ref_id)):
                    row.earth_visible_at = p.arrive_at
                continue
            model, col = TARGETS[p.kind]
            row = db.get(model, p.ref_id)
            if row is not None:
                setattr(row, col, p.arrive_at)
    for p in db.scalars(select(Packet).where(Packet.status == "transit", Packet.arrive_at <= now)).all():
        p.status = "delivered"
    db.commit()


def queue_counts(db: Session) -> dict:
    up = db.scalar(select(func.count()).select_from(Packet).where(Packet.direction == "up", Packet.status != "delivered"))
    down = db.scalar(select(func.count()).select_from(Packet).where(Packet.direction == "down", Packet.status != "delivered"))
    return {"up": up or 0, "down": down or 0}


def mission_dict(db: Session) -> dict:
    m = mission(db)
    d = DISTANCES[m.distance]
    return {
        "distance": m.distance, "label": d["label"], "short": d["short"], "real_delay_text": d["text"],
        "delay_s": delay_s(m), "demo_mode": m.demo_mode, "link_open": m.link_open,
        "met": met(m), "queue": queue_counts(db), "server_time": utcnow().isoformat(),
        "sep_replay": bool(m.sep_replay_until and m.sep_replay_until > utcnow()),
    }
