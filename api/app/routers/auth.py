from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Person, SessionToken, AccessLog
from ..security import check_secret, new_session, current_person
from ..services import link

router = APIRouter(prefix="/api/auth", tags=["auth"])


class PinIn(BaseModel):
    person_id: int
    pin: str


class LoginIn(BaseModel):
    username: str
    password: str


def _person(p: Person) -> dict:
    return {"id": p.id, "code": p.code, "name": p.name, "first_name": p.first_name, "role": p.role,
            "kind": p.kind, "color": p.color}


@router.get("/crew")
def crew_list(db: Session = Depends(get_db)):
    return [_person(p) for p in db.scalars(select(Person).where(Person.kind == "crew").order_by(Person.id))]


@router.post("/pin")
def pin_login(body: PinIn, db: Session = Depends(get_db)):
    p = db.get(Person, body.person_id)
    if not p or p.kind != "crew" or not check_secret(body.pin, p.secret_hash):
        db.add(AccessLog(actor_id=p.id if p else None, what="entrada por PIN", allowed=False))
        db.commit()
        raise HTTPException(401, "PIN incorrecto")
    token = new_session(db, p)
    db.add(AccessLog(actor_id=p.id, target_person_id=p.id, what="entrada por PIN no tablet"))
    link.log(db, "Bordo", f"{p.code} entrou no tablet (PIN)")
    db.commit()
    return {"token": token, "person": _person(p)}


@router.post("/login")
def surgeon_login(body: LoginIn, db: Session = Depends(get_db)):
    p = db.scalars(select(Person).where(Person.username == body.username)).first()
    if not p or not check_secret(body.password, p.secret_hash):
        db.add(AccessLog(actor_id=p.id if p else None, what=f"login na consola ({body.username[:30]})", allowed=False))
        link.log(db, "Terra", f"Tentativa de login falhada na consola ({body.username[:30]})")
        db.commit()
        raise HTTPException(401, "Utilizador ou palavra-passe incorrectos")
    token = new_session(db, p)
    db.add(AccessLog(actor_id=p.id, what="login na consola de missão"))
    link.log(db, "Terra", f"{p.name} entrou na consola de missão")
    db.commit()
    return {"token": token, "person": _person(p)}


@router.post("/logout")
def logout(p: Person = Depends(current_person), db: Session = Depends(get_db)):
    for s in db.scalars(select(SessionToken).where(SessionToken.person_id == p.id)):
        db.delete(s)
    link.log(db, "Bordo" if p.kind == "crew" else "Terra", f"{p.code} saiu da sessão")
    db.commit()
    return {"ok": True}
