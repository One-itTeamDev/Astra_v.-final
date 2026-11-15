"""Operações partilhadas pelos routers e pelo ciclo em segundo plano."""
from datetime import timedelta

from sqlalchemy import select, func
from sqlalchemy.orm import Session

from ..models import (Person, Measurement, Triage, Alert, AlertAck, Message, MessageAck, ProtonFlux,
                      KeyValue, new_id, utcnow)
from . import link, physiology as phy, radiation as rad, triage as tri

NAMES = {"heart_rate": "coração", "reaction_ms": "reacção", "sleep_h": "sono", "spo2": "SpO₂"}
LEVEL_WORD = {"ok": "Verde", "warn": "Atenção", "crit": "Crítico"}


def _next_id(db: Session, model, prefix: str, start: int) -> str:
    n = db.scalar(select(func.count()).select_from(model)) or 0
    return f"{prefix}-{start + n:03d}"


# ---------- medições ----------

def add_measurements(db: Session, p: Person, items: list[dict], label: str) -> str:
    batch = new_id()
    now = utcnow()
    for it in items:
        db.add(Measurement(person_id=p.id, indicator=it["indicator"], value=float(it.get("value") or 0),
                           text_value=it.get("text"), unit=phy.UNITS.get(it["indicator"], ""),
                           method=it.get("method", ""), device=it.get("device", ""), quality=it.get("quality", "boa"),
                           measured_at=now, batch_id=batch))
    pk = link.enqueue(db, "up", "measurements", batch, f"{p.code}, {label}", 1)
    link.log(db, "Bordo", f"{p.code} registou {label} ({len(items)} valores, pacote #{pk.seq})")
    db.commit()
    link.pump(db)
    return batch


# ---------- triagem e alertas ----------

def create_triage(db: Session, p: Person, text: str) -> Triage:
    vals = phy.latest(db, p.id)
    meas = {k: vals[k]["value"] for k in ("heart_rate", "reaction_ms", "sleep_h", "spo2") if k in vals}
    base_hr = phy.baseline(db, p.id, "heart_rate")
    r = tri.triage(text, meas, base_hr)
    t = Triage(id=_next_id(db, Triage, "TRI", 31), person_id=p.id, text=text, summary=r["summary"], level=r["level"],
               conduct=r["conduct"], prevention=r["prevention"], rule=r["rule"], provider=r["provider"],
               measurements_used=meas,
               ai_summary=(f"{p.code} refere {', '.join(r['summary']['symptoms']).lower()} "
                           f"({r['summary']['intensity']}, {r['summary']['since']}). "
                           + ", ".join(f"{NAMES.get(k, k)} {v:g} {phy.UNITS.get(k, '')}".strip() for k, v in meas.items())
                           + f". Nível proposto: {LEVEL_WORD[r['level']]}."))
    db.add(t)
    db.flush()
    link.enqueue(db, "up", "triage", t.id, f"Triagem {LEVEL_WORD[t.level]}, {p.code}", 9 if t.level == "crit" else 2)
    link.log(db, "Bordo", f"{p.code} registou a queixa {t.id}, nível provisório {LEVEL_WORD[t.level]} ({r['provider']})")
    if r["rule"]:
        raise_alert(db, p, r["rule"], t.id, base_hr)
    db.commit()
    link.pump(db)
    return t


def raise_alert(db: Session, p: Person, rule: str, triage_id: str | None, base_hr: float | None):
    a = Alert(id=_next_id(db, Alert, "ALR", 7), person_id=p.id, triage_id=triage_id, rule=rule,
              values={"heart_rate": round((base_hr or 70) * 1.7), "baseline_hr": base_hr})
    db.add(a)
    db.flush()
    link.enqueue(db, "up", "alert", a.id, f"ALERTA CRÍTICO, {p.code}, {rule}", 10)
    link.log(db, "Bordo", f"Alerta crítico {a.id}, {p.code}, {rule}, a tocar em todos os tablets")
    return a


def ack_alert(db: Session, alert_id: str, p: Person):
    if db.scalar(select(AlertAck.id).where(AlertAck.alert_id == alert_id, AlertAck.person_id == p.id)):
        return
    ack = AlertAck(alert_id=alert_id, person_id=p.id)
    db.add(ack)
    db.flush()
    link.enqueue(db, "up", "alert_ack", ack.id, f"{p.code} confirmou o alerta {alert_id}", 9)
    db.commit()


def ack_message(db: Session, msg: Message, p: Person):
    if db.scalar(select(MessageAck.id).where(MessageAck.message_id == msg.id, MessageAck.person_id == p.id)):
        return
    ack = MessageAck(message_id=msg.id, person_id=p.id)
    db.add(ack)
    db.flush()
    if msg.action == "shelter":
        p.shelter_until = utcnow() + timedelta(hours=2)
    link.enqueue(db, "up", "message_ack", ack.id, f"{p.code} confirmou {msg.id}", 3)
    link.log(db, "Bordo", f"{p.code} confirmou a instrução {msg.id}")
    db.commit()


# ---------- radiação ----------

def current_flux(db: Session) -> tuple[float | None, str]:
    m = link.mission(db)
    if m.sep_replay_until and m.sep_replay_until > utcnow():
        start = m.sep_replay_until - timedelta(seconds=120)
        return rad.replay_flux(utcnow(), start, m.sep_replay_until), "reprodução"
    last = db.scalars(select(ProtonFlux).order_by(ProtonFlux.time.desc()).limit(1)).first()
    return (last.flux, "GOES ao vivo") if last else (None, "sem dados")


def dose(db: Session, p: Person) -> dict:
    m = link.mission(db)
    flux, src = current_flux(db)
    sheltered = bool(p.shelter_until and p.shelter_until > utcnow())
    rate = rad.dose_rate(m.distance, flux, sheltered)
    kv = db.get(KeyValue, f"dose:{p.id}")
    v = kv.value if kv else {"base_mSv": 250.0, "since": utcnow().isoformat(), "sep_extra_mSv": 0}
    from datetime import datetime
    hours = (utcnow() - datetime.fromisoformat(v["since"])).total_seconds() / 3600
    cum = v["base_mSv"] + rad.GCR_uSv_h[m.distance] * hours / 1000 + v.get("sep_extra_mSv", 0)
    return {"rate_uSv_h": round(rate, 1), "cumulative_mSv": round(cum, 2), "flux_pfu": flux, "flux_source": src,
            "s_scale": rad.s_scale(flux), "sheltered": sheltered, "career_limit_mSv": rad.CAREER_LIMIT_mSv}


def integrate_sep_dose(db: Session, dt_s: float):
    flux, _ = current_flux(db)
    if not flux or flux < 1:
        return
    for p in db.scalars(select(Person).where(Person.kind == "crew")):
        kv = db.get(KeyValue, f"dose:{p.id}")
        if not kv:
            continue
        sheltered = bool(p.shelter_until and p.shelter_until > utcnow())
        extra = rad.SEP_uSv_h_per_pfu * (flux - 0.5) * (rad.SHELTER_FACTOR if sheltered else 1) * dt_s / 3600 / 1000
        kv.value = {**kv.value, "sep_extra_mSv": kv.value.get("sep_extra_mSv", 0) + extra}
    db.commit()


def co2_event(db: Session):
    kv = db.get(KeyValue, "co2_event")
    if not kv:
        return None
    from datetime import datetime
    return (datetime.fromisoformat(kv.value["start"]), datetime.fromisoformat(kv.value["until"]))


def cabin_at(db: Session, t):
    return phy.cabin(t, co2_event(db))


# ---------- cartão do tripulante visto da Terra ----------

def earth_view_time(db: Session):
    m = link.mission(db)
    d = timedelta(seconds=link.delay_s(m))
    if m.link_open:
        return utcnow() - d, False
    return m.link_changed_at - d, True


def crew_card(db: Session, p: Person) -> dict:
    t, frozen = earth_view_time(db)
    base_hr = phy.baseline(db, p.id, "heart_rate") or 65
    alert = phy.active_alert(db, p.id, earth=True)
    onboard = db.scalars(select(Alert).where(Alert.person_id == p.id, Alert.active.is_(True))).first()

    def boosted(tt):  # o corpo reage a bordo; a Terra vê-o com atraso
        return bool(onboard and onboard.created_at <= tt)
    v = phy.vitals(p, t, base_hr, boosted(t))
    spark = [phy.vitals(p, t - timedelta(seconds=2 * k), base_hr, boosted(t - timedelta(seconds=2 * k)))["hr"]
             for k in range(40, -1, -1)]
    vals = phy.latest(db, p.id, earth_only=True)
    ev = phy.evaluate(db, p.id, vals)
    from . import hazards as hz
    d = dose(db, p)
    haz = hz.evaluate(db, p, earth=True, dose=d, cabin=cabin_at(db, t))
    ov = hz.overall(haz)
    status = "crit" if alert else ov["status"]
    return {"id": p.id, "code": p.code, "name": p.name, "first_name": p.first_name, "role": p.role, "color": p.color,
            "status": status, "status_word": LEVEL_WORD[status], "reasons": ov["reasons"], "vitals": v, "spark": spark,
            "telemetry_frozen": frozen, "values": vals, "eval": ev["indicators"], "last_measured": ev["last_measured"],
            "dose": d, "hazards": haz, "on_tablet": bool(p.last_seen and (utcnow() - p.last_seen).total_seconds() < 20),
            "alert": {"id": alert.id, "rule": alert.rule} if alert else None}
