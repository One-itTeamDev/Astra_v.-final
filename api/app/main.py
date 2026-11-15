"""ASTRA — API + servidor das páginas Web.

Arranque: cria as tabelas, semeia a tripulação, carrega a cache de clima espacial
e inicia um ciclo em segundo plano (fila, confirmações simuladas, dose, dados NASA/NOAA).
"""
import asyncio
import logging
import time
from contextlib import asynccontextmanager
from datetime import timedelta

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select, or_

from .config import WEB_DIR, SPACE_WEATHER_REFRESH_MIN
from .db import Base, engine, SessionLocal
from .models import Person, Message, MessageAck, Alert, AlertAck, utcnow
from .routers import auth, tablet, console, data
from .seed import seed
from .services import link, nasa, ops

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
log = logging.getLogger("astra")


def on_tablet(p: Person) -> bool:
    return bool(p.last_seen and (utcnow() - p.last_seen).total_seconds() < 20)


def simulated_crew_tick(db):
    """Os tripulantes que não estão a usar o tablet confirmam alertas e instruções sozinhos."""
    now = utcnow()
    crew = db.scalars(select(Person).where(Person.kind == "crew")).all()
    for a in db.scalars(select(Alert).where(Alert.active.is_(True))):
        if a.resolve_ship_visible_at and a.resolve_ship_visible_at <= now:
            a.active = False
            link.log(db, "Bordo", f"Alerta {a.id} encerrado a bordo pela decisão da Terra")
            continue
        for c in crew:
            if on_tablet(c) or now < a.created_at + timedelta(seconds=2 + 1.7 * c.id):
                continue
            if not db.scalar(select(AlertAck.id).where(AlertAck.alert_id == a.id, AlertAck.person_id == c.id)):
                ops.ack_alert(db, a.id, c)
    for m in db.scalars(select(Message).where(Message.ship_visible_at.is_not(None), Message.ship_visible_at <= now)):
        for c in crew:
            if m.to_person_id not in (None, c.id) or on_tablet(c):
                continue
            if now < m.ship_visible_at + timedelta(seconds=4 + 2.5 * c.id):
                continue
            if not db.scalar(select(MessageAck.id).where(MessageAck.message_id == m.id, MessageAck.person_id == c.id)):
                ops.ack_message(db, m, c)
    db.commit()


def refresh_external():
    with SessionLocal() as db:
        nasa.refresh_space_weather(db)
        for cam in nasa.CAMERAS["cameras"]:
            nasa.refresh_camera(db, cam)


async def background():
    last_sw = time.monotonic()
    last = time.monotonic()
    asyncio.create_task(asyncio.to_thread(refresh_external))
    while True:
        await asyncio.sleep(2)
        try:
            now = time.monotonic()
            with SessionLocal() as db:
                link.pump(db)
                simulated_crew_tick(db)
                ops.integrate_sep_dose(db, now - last)
                link.pump(db)
            last = now
            if now - last_sw > SPACE_WEATHER_REFRESH_MIN * 60:
                last_sw = now
                asyncio.create_task(asyncio.to_thread(refresh_external))
        except Exception:  # noqa: BLE001
            log.exception("erro no ciclo em segundo plano")


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        seed(db)
        link.mission(db)
        nasa.load_fallback(db)
    task = asyncio.create_task(background())
    yield
    task.cancel()


app = FastAPI(title="ASTRA API", version="0.4", lifespan=lifespan)
for r in (auth.router, tablet.router, console.router, data.router):
    app.include_router(r)


@app.get("/api/health")
def health():
    return {"ok": True, "time": utcnow().isoformat()}


app.mount("/", StaticFiles(directory=WEB_DIR, html=True), name="web")
