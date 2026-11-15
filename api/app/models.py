"""Modelo de dados (secção 11 da documentação), simplificado para o protótipo.

Regra geral: nada se apaga. O que atravessa a ligação Terra–nave ganha uma coluna
`earth_visible_at` (criado a bordo) ou `ship_visible_at` (criado na Terra), preenchida
quando o pacote correspondente sai da fila: o outro lado só o vê depois dessa hora.
"""
from datetime import datetime, timezone
import uuid

from sqlalchemy import String, Integer, Float, Boolean, DateTime, ForeignKey, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def new_id() -> str:
    return uuid.uuid4().hex


TS = DateTime(timezone=True)


class Person(Base):
    __tablename__ = "person"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(8))   # posição na tripulação: CDR, FE, MS, GEO
    name: Mapped[str] = mapped_column(String(80))
    first_name: Mapped[str] = mapped_column(String(40))
    role: Mapped[str] = mapped_column(String(60))
    kind: Mapped[str] = mapped_column(String(10))            # crew | surgeon
    username: Mapped[str | None] = mapped_column(String(40), unique=True, nullable=True)
    secret_hash: Mapped[str] = mapped_column(String(200))     # hash do PIN ou da palavra-passe
    color: Mapped[str] = mapped_column(String(10), default="#4CC9E0")
    shelter_until: Mapped[datetime | None] = mapped_column(TS, nullable=True)
    last_seen: Mapped[datetime | None] = mapped_column(TS, nullable=True)


class SessionToken(Base):
    __tablename__ = "session"
    token: Mapped[str] = mapped_column(String(64), primary_key=True)
    person_id: Mapped[int] = mapped_column(ForeignKey("person.id"))
    created_at: Mapped[datetime] = mapped_column(TS, default=utcnow)


class Measurement(Base):
    __tablename__ = "measurement"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    person_id: Mapped[int] = mapped_column(ForeignKey("person.id"), index=True)
    indicator: Mapped[str] = mapped_column(String(30), index=True)
    value: Mapped[float] = mapped_column(Float)
    unit: Mapped[str] = mapped_column(String(16))
    method: Mapped[str] = mapped_column(String(60))
    device: Mapped[str] = mapped_column(String(80), default="")
    quality: Mapped[str] = mapped_column(String(12), default="boa")
    text_value: Mapped[str | None] = mapped_column(String(40), nullable=True)   # humor
    batch_id: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    measured_at: Mapped[datetime] = mapped_column(TS, default=utcnow, index=True)
    earth_visible_at: Mapped[datetime | None] = mapped_column(TS, nullable=True)


class Triage(Base):
    __tablename__ = "triage"
    id: Mapped[str] = mapped_column(String(16), primary_key=True)
    person_id: Mapped[int] = mapped_column(ForeignKey("person.id"), index=True)
    text: Mapped[str] = mapped_column(Text)
    summary: Mapped[dict] = mapped_column(JSON)
    level: Mapped[str] = mapped_column(String(8))            # ok | warn | crit
    conduct: Mapped[str] = mapped_column(Text)
    prevention: Mapped[list] = mapped_column(JSON, default=list)
    rule: Mapped[str | None] = mapped_column(String(60), nullable=True)
    provider: Mapped[str] = mapped_column(String(30))
    measurements_used: Mapped[dict] = mapped_column(JSON, default=dict)
    ai_summary: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(TS, default=utcnow)
    earth_visible_at: Mapped[datetime | None] = mapped_column(TS, nullable=True)


class Decision(Base):
    __tablename__ = "decision"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    triage_id: Mapped[str] = mapped_column(ForeignKey("triage.id"))
    type: Mapped[str] = mapped_column(String(12))            # validar | corrigir | info
    level: Mapped[str] = mapped_column(String(8))
    text: Mapped[str] = mapped_column(Text)
    author_id: Mapped[int] = mapped_column(ForeignKey("person.id"))
    created_at: Mapped[datetime] = mapped_column(TS, default=utcnow)
    ship_visible_at: Mapped[datetime | None] = mapped_column(TS, nullable=True)


class Alert(Base):
    __tablename__ = "alert"
    id: Mapped[str] = mapped_column(String(16), primary_key=True)
    person_id: Mapped[int] = mapped_column(ForeignKey("person.id"))
    triage_id: Mapped[str | None] = mapped_column(ForeignKey("triage.id"), nullable=True)
    rule: Mapped[str] = mapped_column(String(60))
    values: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(TS, default=utcnow)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    earth_visible_at: Mapped[datetime | None] = mapped_column(TS, nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(TS, nullable=True)
    resolve_ship_visible_at: Mapped[datetime | None] = mapped_column(TS, nullable=True)


class AlertAck(Base):
    __tablename__ = "alert_ack"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    alert_id: Mapped[str] = mapped_column(ForeignKey("alert.id"))
    person_id: Mapped[int] = mapped_column(ForeignKey("person.id"))
    at: Mapped[datetime] = mapped_column(TS, default=utcnow)
    earth_visible_at: Mapped[datetime | None] = mapped_column(TS, nullable=True)


class Message(Base):
    __tablename__ = "message"
    id: Mapped[str] = mapped_column(String(16), primary_key=True)
    to_person_id: Mapped[int | None] = mapped_column(ForeignKey("person.id"), nullable=True)  # None = todos
    priority: Mapped[str] = mapped_column(String(10), default="normal")
    text: Mapped[str] = mapped_column(Text)
    action: Mapped[str] = mapped_column(String(20), default="")
    author_id: Mapped[int] = mapped_column(ForeignKey("person.id"))
    created_at: Mapped[datetime] = mapped_column(TS, default=utcnow)
    ship_visible_at: Mapped[datetime | None] = mapped_column(TS, nullable=True)


class MessageAck(Base):
    __tablename__ = "message_ack"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    message_id: Mapped[str] = mapped_column(ForeignKey("message.id"))
    person_id: Mapped[int] = mapped_column(ForeignKey("person.id"))
    at: Mapped[datetime] = mapped_column(TS, default=utcnow)
    earth_visible_at: Mapped[datetime | None] = mapped_column(TS, nullable=True)


class CrewMessage(Base):
    """Mensagem escrita por um tripulante para a consola (nave → Terra)."""
    __tablename__ = "crew_message"
    id: Mapped[str] = mapped_column(String(16), primary_key=True)
    person_id: Mapped[int] = mapped_column(ForeignKey("person.id"), index=True)
    text: Mapped[str] = mapped_column(Text)
    reply_to: Mapped[str | None] = mapped_column(String(16), nullable=True)   # id de uma instrução da Terra
    created_at: Mapped[datetime] = mapped_column(TS, default=utcnow)
    earth_visible_at: Mapped[datetime | None] = mapped_column(TS, nullable=True)
    read_at: Mapped[datetime | None] = mapped_column(TS, nullable=True)


class Packet(Base):
    """Fila entre a nave e a Terra. Cada pacote tem identificador único: nunca chega duas vezes."""
    __tablename__ = "packet"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    seq: Mapped[int] = mapped_column(Integer, index=True)
    direction: Mapped[str] = mapped_column(String(4))        # up (nave→Terra) | down (Terra→nave)
    kind: Mapped[str] = mapped_column(String(20))
    ref_id: Mapped[str] = mapped_column(String(32))
    label: Mapped[str] = mapped_column(String(120))
    priority: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(TS, default=utcnow)
    sent_at: Mapped[datetime | None] = mapped_column(TS, nullable=True)
    arrive_at: Mapped[datetime | None] = mapped_column(TS, nullable=True)
    status: Mapped[str] = mapped_column(String(10), default="held")   # held | transit | delivered


class MissionState(Base):
    __tablename__ = "mission_state"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    distance: Mapped[str] = mapped_column(String(8), default="mars")
    link_open: Mapped[bool] = mapped_column(Boolean, default=True)
    demo_mode: Mapped[bool] = mapped_column(Boolean, default=True)
    link_changed_at: Mapped[datetime] = mapped_column(TS, default=utcnow)
    started_at: Mapped[datetime] = mapped_column(TS, default=utcnow)
    sep_replay_until: Mapped[datetime | None] = mapped_column(TS, nullable=True)


class AccessLog(Base):
    __tablename__ = "access_log"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("person.id"), nullable=True)
    target_person_id: Mapped[int | None] = mapped_column(ForeignKey("person.id"), nullable=True)
    what: Mapped[str] = mapped_column(String(120))
    allowed: Mapped[bool] = mapped_column(Boolean, default=True)
    at: Mapped[datetime] = mapped_column(TS, default=utcnow)


class Event(Base):
    __tablename__ = "event"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    at: Mapped[datetime] = mapped_column(TS, default=utcnow, index=True)
    origin: Mapped[str] = mapped_column(String(10))         # Bordo | Terra | Sistema
    text: Mapped[str] = mapped_column(String(300))


class SpaceWeatherEvent(Base):
    __tablename__ = "space_weather_event"
    id: Mapped[str] = mapped_column(String(80), primary_key=True)     # activityID do DONKI
    kind: Mapped[str] = mapped_column(String(6))                      # SEP | FLR | GST | CME
    time: Mapped[datetime] = mapped_column(TS, index=True)
    data: Mapped[dict] = mapped_column(JSON)
    source: Mapped[str] = mapped_column(String(20))                   # live | cache
    fetched_at: Mapped[datetime] = mapped_column(TS, default=utcnow)


class ProtonFlux(Base):
    __tablename__ = "proton_flux"
    time: Mapped[datetime] = mapped_column(TS, primary_key=True)
    flux: Mapped[float] = mapped_column(Float)                        # ≥10 MeV, pfu
    satellite: Mapped[int] = mapped_column(Integer, default=0)


class KeyValue(Base):
    __tablename__ = "kv"
    key: Mapped[str] = mapped_column(String(40), primary_key=True)
    value: Mapped[dict] = mapped_column(JSON)
    updated_at: Mapped[datetime] = mapped_column(TS, default=utcnow)
