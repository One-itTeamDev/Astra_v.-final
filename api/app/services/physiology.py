"""Fisiologia simulada a bordo: linha de base, estado e sinais vitais contínuos.

Os valores seguem gamas fisiológicas reais de adultos saudáveis em repouso e em exercício
(ver data/references.json). O estado de saúde da tripulação é simulado; a forma de o avaliar
(comparar cada pessoa consigo própria) é a da documentação ASTRA.
"""
import math
import random
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import MARGINS
from ..models import Measurement, Person, Alert, utcnow

UNITS = {"heart_rate": "bpm", "hrv_ms": "ms", "resp_rate": "rpm", "reaction_ms": "ms", "reaction_sd": "ms",
         "tremor_hz": "Hz", "tremor_amp": "mg", "bp_sys": "mmHg", "bp_dia": "mmHg", "glucose": "mg/dL",
         "temperature": "°C", "spo2": "%", "sleep_h": "h", "mood": "",
         "stress": "escala 1–4", "grip_kg": "kg", "exercise_min": "min"}
MOODS = ["Muito mal", "Mal", "Normal", "Bem", "Muito bem"]

# Plano diário (UTC) por tripulante: local de trabalho e desfasamento dos blocos de exercício
PLAN = {
    1: {"work": "Destiny, laboratório", "ex": 0},
    2: {"work": "Columbus, laboratório", "ex": 22},
    3: {"work": "Cúpula, observação", "ex": 45},
    4: {"work": "Unity, Nó 1", "ex": 67},
}


def activity(pid: int, t: datetime) -> str:
    minute = t.hour * 60 + t.minute
    if minute >= 22 * 60 + 30 or minute < 6 * 60 + 30:
        return "sleep"
    cyc = (minute + 90 - PLAN[pid]["ex"]) % 90          # 20 min de exercício a cada 90 min
    return "exercise" if cyc < 20 else "work"


def location(p: Person, t: datetime) -> str:
    if p.shelter_until and p.shelter_until > t:
        return "Abrigo de tempestade (TeSS)"
    a = activity(p.id, t)
    return {"sleep": "Quartos da tripulação", "exercise": "ARED, Nó 3 (Tranquility)"}.get(a, PLAN[p.id]["work"])


def _noise(pid: int, s: int, k: int) -> float:
    return random.Random(pid * 1_000_003 + s * 7 + k).uniform(-1, 1)


def vitals(p: Person, t: datetime, base_hr: float, alert_active: bool) -> dict:
    s = t.timestamp()
    a = activity(p.id, t)
    lift = {"exercise": 52, "work": 4, "sleep": -9}.get(a, 0)
    # entrada/saída suave do exercício
    hr = base_hr + lift + 2.4 * math.sin(2 * math.pi * s / 71 + p.id) + 1.3 * math.sin(2 * math.pi * s / 13.7 + p.id * 2) \
        + 0.9 * _noise(p.id, int(s), 1)
    resp = {"exercise": 24, "sleep": 12}.get(a, 15) + 0.8 * math.sin(2 * math.pi * s / 40 + p.id) + 0.4 * _noise(p.id, int(s), 2)
    spo2 = 98.0 + 0.6 * math.sin(2 * math.pi * s / 300 + p.id) + 0.3 * _noise(p.id, int(s), 3) - (0.8 if a == "exercise" else 0)
    skin = 33.9 + 0.25 * math.sin(2 * math.pi * s / 900 + p.id) + (0.5 if a == "exercise" else 0)
    if alert_active:
        hr += 0.7 * base_hr
        resp += 8
        spo2 -= 2.5
    return {"hr": round(hr, 1), "resp": round(resp, 1), "spo2": round(min(100, spo2), 1),
            "skin_temp": round(skin, 2), "activity": a, "location": location(p, t), "t": t.isoformat()}


def cabin(t: datetime, co2_event: tuple | None = None) -> dict:
    """Ambiente da cabine (ECLSS), em gamas típicas da ISS.
    co2_event = (início, fim): avaria simulada do removedor de CO₂ (CDRA) para demonstração."""
    s = t.timestamp()
    co2 = 2.55 + 0.3 * math.sin(2 * math.pi * s / 5400) + 0.05 * math.sin(s / 37)
    if co2_event and co2_event[0] <= t <= co2_event[1]:
        k = min(1.0, (t - co2_event[0]).total_seconds() / 40)
        co2 += 1.7 * k
    return {
        "ppco2_mmHg": round(co2, 2),
        "o2_pct": round(21.0 + 0.15 * math.sin(2 * math.pi * s / 7200), 2),
        "pressure_kPa": round(101.2 + 0.2 * math.sin(2 * math.pi * s / 10800), 1),
        "temp_C": round(22.6 + 0.5 * math.sin(2 * math.pi * s / 8000), 1),
        "rh_pct": round(47 + 4 * math.sin(2 * math.pi * s / 6000), 0),
    }


# ---------- linha de base e estado ----------

def history(db: Session, pid: int, indicator: str, earth_only: bool = False, days: int = 14) -> list[Measurement]:
    q = select(Measurement).where(Measurement.person_id == pid, Measurement.indicator == indicator,
                                  Measurement.measured_at >= utcnow() - timedelta(days=days + 1))
    if earth_only:
        q = q.where(Measurement.earth_visible_at.is_not(None), Measurement.earth_visible_at <= utcnow())
    return list(db.scalars(q.order_by(Measurement.measured_at)).all())


def baseline(db: Session, pid: int, indicator: str) -> float | None:
    """Média dos primeiros 7 dias do histórico (secção 4.6)."""
    first = db.scalar(select(Measurement.measured_at).where(Measurement.person_id == pid, Measurement.indicator == indicator)
                      .order_by(Measurement.measured_at).limit(1))
    if first is None:
        return None
    rows = db.scalars(select(Measurement.value).where(Measurement.person_id == pid, Measurement.indicator == indicator,
                                                      Measurement.measured_at < first + timedelta(days=7))).all()
    return round(sum(rows) / len(rows), 1) if rows else None


def latest(db: Session, pid: int, earth_only: bool = False) -> dict:
    out = {}
    for ind in UNITS:
        q = select(Measurement).where(Measurement.person_id == pid, Measurement.indicator == ind)
        if earth_only:
            q = q.where(Measurement.earth_visible_at.is_not(None), Measurement.earth_visible_at <= utcnow())
        m = db.scalars(q.order_by(Measurement.measured_at.desc()).limit(1)).first()
        if m:
            out[ind] = {"value": m.value, "text": m.text_value, "unit": m.unit, "at": m.measured_at.isoformat(),
                        "method": m.method, "device": m.device}
    return out


def evaluate(db: Session, pid: int, values: dict) -> dict:
    """Compara com a linha de base. Devolve estado por indicador e razões."""
    res, reasons = {}, []
    for ind, margin in MARGINS.items():
        b = baseline(db, pid, ind)
        v = values.get(ind, {}).get("value")
        if b is None or v is None:
            continue
        diff = v - b
        out = abs(diff) > margin
        pct = round(diff / b * 100) if b else 0
        res[ind] = {"baseline": b, "margin": margin, "out": out, "pct": pct}
        if out:
            name = {"heart_rate": "coração", "reaction_ms": "reacção", "sleep_h": "sono"}[ind]
            reasons.append(f"{name} {'+' if pct > 0 else ''}{pct}%")
    mood = values.get("mood", {}).get("text")
    if mood in ("Mal", "Muito mal"):
        reasons.append(f"humor: {mood.lower()}")
    last = max((datetime.fromisoformat(v["at"]) for v in values.values()), default=None)
    if last and (utcnow() - last).total_seconds() > 36 * 3600:
        reasons.append(f"sem check-up há {int((utcnow() - last).total_seconds() // 3600)} h")
    return {"indicators": res, "reasons": reasons, "status": "warn" if reasons else "ok",
            "last_measured": last.isoformat() if last else None}


def active_alert(db: Session, pid: int, earth: bool = False) -> Alert | None:
    q = select(Alert).where(Alert.person_id == pid)
    if earth:
        now = utcnow()
        q = q.where(Alert.earth_visible_at.is_not(None), Alert.earth_visible_at <= now, Alert.resolved_at.is_(None))
    else:
        q = q.where(Alert.active.is_(True))
    return db.scalars(q).first()
