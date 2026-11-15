"""Teste de ponta a ponta contra PostgreSQL (o mesmo motor do Docker).
Defina TEST_DATABASE_URL para correr; sem ela, o teste é ignorado.
"""
import os
import time

import pytest

URL = os.getenv("TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not URL, reason="TEST_DATABASE_URL não definido")


@pytest.fixture(scope="module")
def client():
    os.environ["DATABASE_URL"] = URL
    os.environ["ASTRA_OFFLINE"] = "1"
    from fastapi.testclient import TestClient
    from app.db import Base, engine
    Base.metadata.drop_all(engine)
    from app.main import app
    with TestClient(app) as c:
        yield c


from app.seed import PINS


def _crew(c, pid=2):
    t = c.post("/api/auth/pin", json={"person_id": pid, "pin": PINS[pid]}).json()["token"]
    return {"Authorization": f"Bearer {t}"}


def _surgeon(c):
    t = c.post("/api/auth/login", json={"username": "cirurgia", "password": "astra2026"}).json()["token"]
    return {"Authorization": f"Bearer {t}"}


def test_wrong_pin_and_password_are_refused(client):
    assert client.post("/api/auth/pin", json={"person_id": 2, "pin": "0000"}).status_code == 401
    assert client.post("/api/auth/pin", json={"person_id": 2, "pin": PINS[1]}).status_code == 401   # PIN de outro tripulante
    assert client.post("/api/auth/login", json={"username": "cirurgia", "password": "x"}).status_code == 401


def test_crew_cannot_open_console(client):
    assert client.get("/api/console/overview", headers=_crew(client)).status_code == 403


def test_message_crosses_link_with_delay(client):
    s, h = _surgeon(client), _crew(client)
    client.patch("/api/mission", json={"distance": "moon", "demo_mode": True, "link_open": True}, headers=s)  # 1,3 s
    mid = client.post("/api/console/messages", json={"to": "2", "text": "teste de atraso"}, headers=s).json()["id"]
    ids = [m["id"] for m in client.get("/api/tablet/summary", headers=h).json()["messages"]]
    assert mid not in ids                                   # ainda em trânsito
    time.sleep(1.6)
    ids = [m["id"] for m in client.get("/api/tablet/summary", headers=h).json()["messages"]]
    assert mid in ids                                       # chegou à nave


def test_cut_link_holds_crew_message_until_reopened(client):
    s, h = _surgeon(client), _crew(client)
    client.patch("/api/mission", json={"distance": "leo", "link_open": False}, headers=s)
    r = client.post("/api/tablet/messages", json={"text": "retida?"}, headers=h).json()
    assert r["arrives"] is None
    client.patch("/api/mission", json={"link_open": True}, headers=s)
    time.sleep(1.5)   # 0,4 s de atraso + 150 ms entre pacotes retidos
    inbox = client.get("/api/console/overview", headers=s).json()["inbox"]
    assert any(x["id"] == r["id"] for x in inbox)


def test_chest_pain_raises_alert_seen_by_earth(client):
    s, h = _surgeon(client), _crew(client)
    r = client.post("/api/tablet/triage", json={"text": "tenho dor no peito"}, headers=h).json()
    assert r["level"] == "crit"
    assert client.get("/api/tablet/summary", headers=h).json()["alerts"]   # a bordo, imediato
    time.sleep(0.6)
    assert client.get("/api/console/overview", headers=s).json()["alerts"]
