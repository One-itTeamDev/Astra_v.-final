"""Tripulação e cirurgiã de voo pré-criadas, com 14 dias de histórico.

Os valores seguem gamas fisiológicas reais (data/references.json). Não há registo de contas:
os perfis já vêm criados (secção 3).
"""
import random
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Person, Measurement, Message, MessageAck, CrewMessage, Event, AccessLog, KeyValue, utcnow
from .security import hash_secret
from .services.physiology import UNITS

# PIN de cada tripulante (guardado na base de dados só como hash PBKDF2)
PINS = {1: "4821", 2: "3057", 3: "7314", 4: "6290"}
SURGEON_USER, SURGEON_PASS = "cirurgia", "astra2026"

GRIP = {1: 31, 2: 44, 3: 29, 4: 46}            # força de preensão de referência (kg)
CREW = [
    # id, código, nome, primeiro nome, função, cor, linha de base (hr, reacção, sono), dose acumulada (mSv)
    (1, "CDR", "Celina Macuácua", "Celina", "Comandante", "#7FB0E6", (63, 268, 7.0), 252.4),
    (2, "FE", "Tomás Sitoe", "Tomás", "Engenheiro de voo", "#E2B46A", (66, 286, 7.0), 255.1),
    (3, "MS", "Amélia Cossa", "Amélia", "Especialista de missão", "#6FCB9A", (58, 262, 7.5), 249.8),
    (4, "GEO", "Rafael Nhantumbo", "Rafael", "Geólogo planetário", "#C39BE0", (70, 295, 6.5), 257.3),
]


def _day_time(days_ago: int):
    now = utcnow()
    t = (now - timedelta(days=days_ago)).replace(hour=7, minute=30, second=0, microsecond=0)
    return t - timedelta(days=1) if t > now - timedelta(minutes=30) else t


def sync_crew(db: Session):
    """Base de dados criada por uma versão anterior: alinhar códigos, cores e PIN partilhado antigo."""
    from .security import check_secret
    for pid, code, name, first, role, color, base, dose in CREW:
        p = db.get(Person, pid)
        if not p:
            continue
        p.code, p.name, p.first_name, p.role, p.color = code, name, first, role, color
        if check_secret("1234", p.secret_hash):          # PIN igual para todos nas versões antigas
            p.secret_hash = hash_secret(PINS[pid])
    s = db.get(Person, 99)
    if s:
        s.code = "SURG"
    db.commit()


def seed(db: Session):
    if db.scalar(select(Person.id).limit(1)):
        sync_crew(db)
        return
    db.add(Person(id=99, code="SURG", name="Dra. Inês Matola", first_name="Inês", role="Cirurgiã de voo",
                  kind="surgeon", username=SURGEON_USER, secret_hash=hash_secret(SURGEON_PASS), color="#1F5F8B"))
    for pid, code, name, first, role, color, base, dose in CREW:
        db.add(Person(id=pid, code=code, name=name, first_name=first, role=role, kind="crew",
                      secret_hash=hash_secret(PINS[pid]), color=color))
    db.flush()

    for pid, code, name, first, role, color, (bhr, brt, bsl), dose in CREW:
        r = random.Random(pid * 91)
        for d in range(14):
            if pid == 4 and d >= 12:          # GEO sem check-up há quase 2 dias
                continue
            t = _day_time(13 - d)
            hr = bhr + r.uniform(-3, 3)
            rt = brt + r.uniform(-7, 7)
            sl = round((bsl + r.uniform(-0.5, 0.5)) * 2) / 2
            mood = r.choice(["Bem", "Bem", "Normal", "Muito bem"])
            if pid == 2 and d >= 10:          # FE: reacção mais lenta e noites curtas
                rt = [300, 304, 309, 312][d - 10]
                sl = [6.0, 5.5, 6.0, 5.5][d - 10]
            if pid == 4 and d >= 9:
                sl, mood = [6.0, 5.0, 5.5][d - 9], ["Normal", "Mal", "Mal"][d - 9]
            vals = {"heart_rate": round(hr), "hrv_ms": round(r.uniform(42, 68)), "resp_rate": round(r.uniform(13, 16)),
                    "reaction_ms": round(rt), "reaction_sd": round(r.uniform(18, 32)), "tremor_hz": round(r.uniform(5.2, 6.4), 1),
                    "tremor_amp": round(r.uniform(8, 16)), "sleep_h": sl, "spo2": round(r.uniform(97, 99))}
            if d % 2 == 0:
                vals |= {"bp_sys": round(r.uniform(108, 124)), "bp_dia": round(r.uniform(68, 80)),
                         "temperature": round(r.uniform(36.4, 36.9), 1)}
            if d % 7 == 6:
                vals["glucose"] = round(r.uniform(84, 102))
            # gravidade alterada: exercício diário e força de preensão a cada 3 dias
            vals["exercise_min"] = round(r.uniform(40, 55) if pid == 4 and d >= 10 else r.uniform(105, 130))
            if d % 3 == 0 or d == 11:
                g = GRIP[pid] * (0.86 if pid == 4 and d >= 11 else 1) + r.uniform(-1, 1)
                vals["grip_kg"] = round(g, 1)
            # isolamento: stress (1 baixo … 4 muito alto)
            vals["stress"] = 3 if pid == 4 and d >= 10 else (2 if pid == 2 and d >= 10 else r.choice([1, 1, 2]))
            for ind, v in vals.items():
                method = {"heart_rate": "câmara + flash (PPG)", "hrv_ms": "câmara + flash (PPG)", "resp_rate": "câmara + flash (PPG)",
                          "tremor_hz": "acelerómetro", "tremor_amp": "acelerómetro", "reaction_ms": "ecrã táctil",
                          "reaction_sd": "ecrã táctil", "sleep_h": "registo diário", "spo2": "oxímetro de bordo",
                          "stress": "registo diário", "exercise_min": "ARED / T2 / CEVIS", "grip_kg": "dinamómetro de mão"}.get(ind, "aparelho de bordo")
                db.add(Measurement(person_id=pid, indicator=ind, value=v, unit=UNITS[ind], method=method,
                                   measured_at=t, earth_visible_at=t + timedelta(minutes=15)))
            db.add(Measurement(person_id=pid, indicator="mood", value=0, text_value=mood, unit="", method="registo diário",
                               measured_at=t, earth_visible_at=t + timedelta(minutes=15)))
        db.add(KeyValue(key=f"dose:{pid}", value={"base_mSv": dose, "since": utcnow().isoformat(), "sep_extra_mSv": 0.0}))

    t0 = utcnow() - timedelta(hours=3)
    db.add(Message(id="MSG-011", to_person_id=None, priority="normal", author_id=99, created_at=t0,
                   text="Bom dia, tripulação. Check-up da manhã até às 09:00 e 45 min de ARED hoje.",
                   ship_visible_at=t0 + timedelta(minutes=14)))
    db.flush()
    for pid in (1, 3):
        a = t0 + timedelta(minutes=30 + pid)
        db.add(MessageAck(message_id="MSG-011", person_id=pid, at=a, earth_visible_at=a + timedelta(minutes=14)))
    t1 = utcnow() - timedelta(minutes=50)
    db.add(CrewMessage(id="TX-100", person_id=4, created_at=t1, earth_visible_at=t1 + timedelta(minutes=14),
                       text="Controlo, dormi mal outra vez (cerca de 5 h). Posso passar a sessão de geologia de amanhã para a tarde?"))
    db.add(AccessLog(actor_id=4, target_person_id=2, what="dados de saúde de T2", allowed=False, at=utcnow() - timedelta(hours=5)))
    db.add(AccessLog(actor_id=99, target_person_id=2, what="evolução de T2", allowed=True, at=utcnow() - timedelta(hours=4)))
    db.add(Event(origin="Sistema", text="Base de dados inicializada, tripulação com 14 dias de histórico", at=utcnow() - timedelta(minutes=1)))
    db.commit()
