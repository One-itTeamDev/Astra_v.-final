"""Dados reais externos: clima espacial e imagens das câmaras."""
import json
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from ..config import CACHE_DIR, DATA_DIR
from ..db import get_db
from ..models import Person, utcnow
from ..security import require_surgeon
from ..services import nasa, ops, link
from ..services import radiation as rad

router = APIRouter(prefix="/api", tags=["dados reais"])
REFS = json.loads((DATA_DIR / "references.json").read_text(encoding="utf-8"))


@router.get("/space-weather")
def space_weather(db: Session = Depends(get_db)):
    out = nasa.space_weather_summary(db)
    flux, src = ops.current_flux(db)
    m = link.mission(db)
    out["now"] = {"flux_pfu": flux, "flux_source": src, "s_scale": rad.s_scale(flux),
                  "dose_rate_uSv_h": round(rad.dose_rate(m.distance, flux, False), 1),
                  "gcr_uSv_h": round(rad.GCR_uSv_h[m.distance], 1), "distance": m.distance}
    if m.sep_replay_until and m.sep_replay_until > utcnow():
        start = m.sep_replay_until - timedelta(seconds=120)
        steps = max(2, int((utcnow() - start).total_seconds() // 3))
        out["replay_curve"] = [{"t": (start + timedelta(seconds=3 * i)).isoformat(),
                                "flux": rad.replay_flux(start + timedelta(seconds=3 * i), start, m.sep_replay_until)} for i in range(steps + 1)]
    return out


@router.post("/space-weather/refresh")
def refresh(p: Person = Depends(require_surgeon), db: Session = Depends(get_db)):
    return nasa.refresh_space_weather(db)


@router.get("/hazards")
def hazards_meta():
    """Os cinco perigos (NASA HRP) com textos, factos com fonte e acções."""
    from ..services.hazards import HAZ
    return HAZ


@router.get("/references")
def references():
    return REFS


@router.get("/media/cameras")
def cameras(db: Session = Depends(get_db)):
    return nasa.camera_list(db)


@router.get("/media/cameras/{cam_id}.jpg")
def camera_image(cam_id: str):
    f = CACHE_DIR / "cameras" / f"{cam_id}.jpg"
    if not f.exists() or "/" in cam_id:
        raise HTTPException(404, "Imagem ainda não descarregada")
    return FileResponse(f, media_type="image/jpeg", headers={"Cache-Control": "max-age=600"})


@router.post("/media/refresh")
def refresh_media(p: Person = Depends(require_surgeon), db: Session = Depends(get_db)):
    return [nasa.refresh_camera(db, c) for c in nasa.CAMERAS["cameras"]]
