"""Entrada no sistema e permissões (secções 3 e 8): negado por defeito, verificado em cada pedido, registado."""
import hashlib
import hmac
import os
import secrets

from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from .db import get_db
from .models import Person, SessionToken, AccessLog, utcnow


def hash_secret(secret: str, salt: bytes | None = None) -> str:
    salt = salt or os.urandom(16)
    h = hashlib.pbkdf2_hmac("sha256", secret.encode(), salt, 120_000)
    return f"{salt.hex()}${h.hex()}"


def check_secret(secret: str, stored: str) -> bool:
    salt, h = stored.split("$")
    return hmac.compare_digest(hash_secret(secret, bytes.fromhex(salt)).split("$")[1], h)


def new_session(db: Session, person: Person) -> str:
    token = secrets.token_hex(24)
    db.add(SessionToken(token=token, person_id=person.id))
    return token


def current_person(authorization: str = Header(default=""), db: Session = Depends(get_db)) -> Person:
    token = authorization.removeprefix("Bearer ").strip()
    s = db.get(SessionToken, token) if token else None
    if not s:
        raise HTTPException(401, "Sessão inválida")
    p = db.get(Person, s.person_id)
    p.last_seen = utcnow()
    db.commit()
    return p


def require_crew(p: Person = Depends(current_person)) -> Person:
    if p.kind != "crew":
        raise HTTPException(403, "Só tripulantes")
    return p


def require_surgeon(p: Person = Depends(current_person), db: Session = Depends(get_db)) -> Person:
    if p.kind != "surgeon":
        db.add(AccessLog(actor_id=p.id, what="consola de missão", allowed=False))
        db.commit()
        raise HTTPException(403, "Só a cirurgiã de voo")
    return p


def access(db: Session, actor: Person, target_id: int | None, what: str, allowed: bool = True):
    db.add(AccessLog(actor_id=actor.id, target_person_id=target_id, what=what, allowed=allowed))
