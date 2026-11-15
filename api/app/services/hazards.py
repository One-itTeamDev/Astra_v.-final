"""Os cinco perigos do voo espacial humano (NASA HRP) aplicados a cada tripulante.

Cada perigo junta indicadores que o ASTRA já mede. O estado é Verde ou Atenção;
o vermelho continua reservado ao alerta crítico (regras de segurança).
"""
import json
from datetime import timedelta

from sqlalchemy import select, func
from sqlalchemy.orm import Session

from ..config import DATA_DIR
from ..models import Person, Measurement, Triage, Decision, Packet, utcnow
from . import link, physiology as phy

HAZ = json.loads((DATA_DIR / "hazards.json").read_text(encoding="utf-8"))
LIMITS = HAZ["cabin_limits"]
def cap(t: str) -> str:
    """Maiúscula inicial sem estragar siglas (CO₂, O₂)."""
    return t[:1].upper() + t[1:] if t else t


def low(t: str) -> str:
    return t if t[:2].isupper() else t[:1].lower() + t[1:]


def pt(x, d=1):
    return f"{x:.{d}f}".replace(".", ",")


STRESS = ["Baixo", "Moderado", "Alto", "Muito alto"]
EXERCISE_TARGET_MIN = 120
ENV_SYMPTOMS = {"Dor de cabeça", "Irritação da pele", "Sensação de febre", "Congestão nasal", "Náusea"}


def _sum_since(db, pid, ind, hours, earth):
    q = select(func.coalesce(func.sum(Measurement.value), 0)).where(
        Measurement.person_id == pid, Measurement.indicator == ind,
        Measurement.measured_at >= utcnow() - timedelta(hours=hours))
    if earth:
        q = q.where(Measurement.earth_visible_at.is_not(None), Measurement.earth_visible_at <= utcnow())
    return float(db.scalar(q) or 0)


def cabin_status(cab: dict) -> tuple[str, list[str]]:
    out = []
    for k, lim in LIMITS.items():
        v = cab.get(k)
        if v is None:
            continue
        if ("max" in lim and v > lim["max"]) or ("min" in lim and v < lim["min"]):
            out.append(f"{lim['label']} fora da faixa")
    return ("warn" if out else "ok"), out


def evaluate(db: Session, p: Person, earth: bool = False, dose: dict | None = None, cabin: dict | None = None) -> list[dict]:
    vals = phy.latest(db, p.id, earth_only=earth)
    ev = phy.evaluate(db, p.id, vals)
    m = link.mission(db)
    res = []

    # R — radiação
    flux = dose.get("flux_pfu") if dose else None
    warn = bool(flux and flux >= 10)
    res.append({"id": "radiacao", "status": "warn" if warn else "ok",
                "values": [["Protões ≥10 MeV", "—" if flux is None else f"{pt(flux, 1)} pfu ({dose['s_scale']})"],
                           ["Taxa de dose", f"{pt(dose['rate_uSv_h'], 1)} µSv/h" if dose else "—"],
                           ["Dose acumulada", f"{pt(dose['cumulative_mSv'], 1)} de 600 mSv" if dose else "—"]],
                "note": ("Tempestade de radiação em curso" + (", no abrigo" if dose.get("sheltered") else ", ir para o abrigo")) if warn else "Fundo de raios cósmicos"})

    # I — isolamento e confinamento
    mood = vals.get("mood", {}).get("text")
    st = vals.get("stress", {}).get("value")
    sleep_out = ev["indicators"].get("sleep_h", {}).get("out")
    reasons = []
    if mood in ("Mal", "Muito mal"):
        reasons.append("humor em baixo")
    if st and st >= 3:
        reasons.append("stress alto")
    if sleep_out:
        reasons.append(f"sono {ev['indicators']['sleep_h']['pct']}%")
    res.append({"id": "isolamento", "status": "warn" if reasons else "ok",
                "values": [["Humor", mood or "—"], ["Stress", STRESS[int(st) - 1] if st else "—"],
                           ["Sono", f"{pt(vals['sleep_h']['value'], 1)} h" if "sleep_h" in vals else "—"]],
                "note": cap(", ".join(reasons)) if reasons else "Sem sinais de desgaste"})

    # D — distância da Terra (igual para todos, com a parte pessoal das decisões autónomas)
    q = link.queue_counts(db)
    open_tri = 0
    for t in db.scalars(select(Triage).where(Triage.person_id == p.id, Triage.created_at >= utcnow() - timedelta(days=3))):
        if not db.scalar(select(Decision.id).where(Decision.triage_id == t.id, Decision.ship_visible_at.is_not(None),
                                                   Decision.ship_visible_at <= utcnow())):
            open_tri += 1
    last_down = db.scalar(select(func.max(Packet.arrive_at)).where(Packet.direction == "down", Packet.status == "delivered"))
    warn = (not m.link_open) or q["up"] > 5
    res.append({"id": "distancia", "status": "warn" if warn else "ok",
                "values": [["Ligação", "aberta" if m.link_open else "cortada"], ["Atraso", link.mission_dict(db)["real_delay_text"]],
                           ["Fila para a Terra", f"{q['up']} pacotes"], ["Decisões a bordo sem resposta", str(open_tri)],
                           ["Último contacto da Terra", last_down.isoformat() if last_down else "—"]],
                "note": "Sem ligação: a nave decide sozinha" if not m.link_open else ("Fila longa" if q["up"] > 5 else "Comunicação a funcionar")})

    # G — gravidade alterada
    ex = _sum_since(db, p.id, "exercise_min", 24, earth)
    grip = vals.get("grip_kg", {}).get("value")
    gb = phy.baseline(db, p.id, "grip_kg")
    grip_drop = bool(grip and gb and grip < gb * 0.9)
    func_out = ev["indicators"].get("reaction_ms", {}).get("out")
    reasons = []
    if ex < EXERCISE_TARGET_MIN * 0.5:
        reasons.append("pouco exercício")
    if grip_drop:
        reasons.append(f"força {round((grip - gb) / gb * 100)}%")
    if func_out:
        pct = ev["indicators"]["reaction_ms"]["pct"]
        reasons.append(f"reacção {'+' if pct > 0 else ''}{pct}%")
    res.append({"id": "gravidade", "status": "warn" if reasons else "ok",
                "values": [["Exercício (24 h)", f"{pt(ex, 0)} de {EXERCISE_TARGET_MIN} min"],
                           ["Força de preensão", f"{pt(grip, 0)} kg (base {pt(gb, 0)})" if grip and gb else "—"],
                           ["Tremor", f"{pt(vals['tremor_hz']['value'], 1)} Hz" if "tremor_hz" in vals else "—"]],
                "exercise_min": ex, "note": cap(", ".join(reasons)) if reasons else "Contramedidas em dia"})

    # E — ambiente fechado e hostil
    cab = cabin or phy.cabin(utcnow())
    cst, creasons = cabin_status(cab)
    sym = set()
    q2 = select(Triage).where(Triage.person_id == p.id, Triage.created_at >= utcnow() - timedelta(hours=24))
    if earth:
        q2 = q2.where(Triage.earth_visible_at.is_not(None), Triage.earth_visible_at <= utcnow())
    for t in db.scalars(q2):
        sym |= set(t.summary.get("symptoms", [])) & ENV_SYMPTOMS
    reasons = creasons + ([f"sintomas: {', '.join(sorted(sym)).lower()}"] if sym else [])
    res.append({"id": "ambiente", "status": "warn" if reasons else "ok",
                "values": [["CO₂", f"{pt(cab['ppco2_mmHg'], 2)} mmHg (limite 3)"], ["O₂", f"{pt(cab['o2_pct'], 1)} %"],
                           ["Temperatura", f"{pt(cab['temp_C'], 1)} °C"], ["Humidade", f"{pt(cab['rh_pct'], 0)} %"]],
                "note": cap("; ".join(reasons)) if reasons else "Cabine dentro dos limites"})

    # check-up em atraso conta para o estado geral (sem dados, não há avaliação)
    res_meta = {"overdue_h": None}
    if ev["last_measured"]:
        from datetime import datetime
        h = (utcnow() - datetime.fromisoformat(ev["last_measured"])).total_seconds() / 3600
        if h > 36:
            res_meta["overdue_h"] = int(h)
    meta = {h["id"]: h for h in HAZ["hazards"]}
    for r in res:
        h = meta[r["id"]]
        r.update(name=h["name"], letter=h["letter"])
    res[0]["_overdue_h"] = res_meta["overdue_h"]
    return res


def overall(haz: list[dict]) -> dict:
    """Estado geral do tripulante = pior dos cinco perigos (o crítico vem só do alerta)."""
    reasons = [f"{h['name']}: {low(h['note'])}" for h in haz if h["status"] != "ok"]
    if haz and haz[0].get("_overdue_h"):
        reasons.append(f"sem check-up há {haz[0]['_overdue_h']} h")
    return {"status": "warn" if reasons else "ok", "reasons": reasons}
