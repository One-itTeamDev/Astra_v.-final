"""Dados reais externos: NASA DONKI (SEP, erupções, tempestades geomagnéticas),
NOAA SWPC (fluxo de protões do GOES), NASA Image Library e DSCOVR/EPIC.

Tudo é guardado na base de dados / cache em disco, para o sistema continuar a funcionar
sem internet (princípio 2). Se uma fonte falhar, fica a última cópia válida.
"""
import json
import logging
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx
from sqlalchemy import select, delete
from sqlalchemy.orm import Session

from ..config import NASA_API_KEY, DATA_DIR, CACHE_DIR, OFFLINE
from ..models import SpaceWeatherEvent, ProtonFlux, KeyValue, utcnow

log = logging.getLogger("astra.nasa")
DONKI = "https://api.nasa.gov/DONKI"
NOAA_PROTONS = "https://services.swpc.noaa.gov/json/goes/primary/integral-protons-1-day.json"
IMAGES_API = "https://images-api.nasa.gov"
EPIC_API = "https://epic.gsfc.nasa.gov/api/natural"
TIMEOUT = httpx.Timeout(12.0, connect=6.0)
CAMERAS = json.loads((DATA_DIR / "cameras.json").read_text(encoding="utf-8"))


def _parse(ts: str) -> datetime:
    ts = ts.replace("Z", "+00:00")
    if re.match(r".*T\d\d:\d\d\+", ts):
        ts = ts.replace("+", ":00+", 1)
    dt = datetime.fromisoformat(ts)
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def kv_set(db: Session, key: str, value: dict):
    row = db.get(KeyValue, key)
    if row:
        row.value, row.updated_at = value, utcnow()
    else:
        db.add(KeyValue(key=key, value=value))


def kv_get(db: Session, key: str) -> dict | None:
    row = db.get(KeyValue, key)
    return row.value if row else None


# ---------------- clima espacial ----------------

def _store_events(db: Session, kind: str, items: list, source: str):
    id_key, t_key = {"SEP": ("sepID", "eventTime"), "FLR": ("flrID", "beginTime"),
                     "GST": ("gstID", "startTime")}[kind]
    for it in items:
        eid, t = it.get(id_key), it.get(t_key)
        if not eid or not t:
            continue
        row = db.get(SpaceWeatherEvent, eid)
        if row:
            row.data, row.source, row.fetched_at = it, source, utcnow()
        else:
            db.add(SpaceWeatherEvent(id=eid, kind=kind, time=_parse(t), data=it, source=source))


def load_fallback(db: Session):
    """Carrega os eventos reais guardados no repositório, se a base estiver vazia."""
    if db.scalar(select(SpaceWeatherEvent.id).limit(1)):
        return
    data = json.loads((DATA_DIR / "fallback" / "donki.json").read_text(encoding="utf-8"))
    for kind in ("SEP", "FLR", "GST"):
        _store_events(db, kind, data.get(kind, []), "cache")
    kv_set(db, "space_weather_status", {"source": "cache", "fetched_at": None, "errors": ["sem dados ao vivo ainda"]})
    db.commit()


def refresh_space_weather(db: Session) -> dict:
    status = {"source": "cache", "fetched_at": utcnow().isoformat(), "errors": [], "ok": []}
    if OFFLINE:
        status["errors"].append("modo offline")
        kv_set(db, "space_weather_status", status)
        db.commit()
        return status
    end = utcnow().date()
    windows = {"SEP": 365, "FLR": 30, "GST": 60}
    with httpx.Client(timeout=TIMEOUT) as c:
        for kind, days in windows.items():
            try:
                r = c.get(f"{DONKI}/{kind}", params={"startDate": str(end - timedelta(days=days)),
                                                     "endDate": str(end), "api_key": NASA_API_KEY})
                r.raise_for_status()
                items = r.json() if r.text.strip() else []
                _store_events(db, kind, items or [], "live")
                status["ok"].append(f"DONKI {kind}: {len(items or [])}")
            except Exception as e:  # noqa: BLE001
                status["errors"].append(f"DONKI {kind}: {type(e).__name__}")
        try:
            r = c.get(NOAA_PROTONS)
            r.raise_for_status()
            rows = [x for x in r.json() if x.get("energy") == ">=10 MeV"]
            if rows:
                db.execute(delete(ProtonFlux))
                for x in rows:
                    db.add(ProtonFlux(time=_parse(x["time_tag"]), flux=float(x["flux"]), satellite=int(x.get("satellite") or 0)))
                status["ok"].append(f"NOAA GOES protões: {len(rows)}")
        except Exception as e:  # noqa: BLE001
            status["errors"].append(f"NOAA GOES: {type(e).__name__}")
    if status["ok"]:
        status["source"] = "live"
    kv_set(db, "space_weather_status", status)
    db.commit()
    log.info("clima espacial: %s", status)
    return status


def space_weather_summary(db: Session) -> dict:
    seps = db.scalars(select(SpaceWeatherEvent).where(SpaceWeatherEvent.kind == "SEP")
                      .order_by(SpaceWeatherEvent.time.desc()).limit(8)).all()
    flrs = db.scalars(select(SpaceWeatherEvent).where(SpaceWeatherEvent.kind == "FLR")
                      .order_by(SpaceWeatherEvent.time.desc()).limit(40)).all()
    gsts = db.scalars(select(SpaceWeatherEvent).where(SpaceWeatherEvent.kind == "GST")
                      .order_by(SpaceWeatherEvent.time.desc()).limit(5)).all()
    flr_ids = {f.id: f.data.get("classType") for f in flrs}
    sep_out = []
    for s in seps:
        linked = [l.get("activityID", "") for l in (s.data.get("linkedEvents") or [])]
        sep_out.append({"id": s.id, "time": s.time.isoformat(), "source": s.source,
                        "instruments": [i.get("displayName") for i in (s.data.get("instruments") or [])],
                        "flares": [flr_ids.get(a) or a.split("-FLR")[0] for a in linked if "FLR" in a],
                        "cme": sum(1 for a in linked if "CME" in a), "link": s.data.get("link"),
                        "note": s.data.get("note") or ""})
    recent = [f for f in flrs if f.time > utcnow() - timedelta(days=30)]
    classes = {"X": 0, "M": 0, "C": 0}
    for f in recent:
        c = (f.data.get("classType") or "?")[:1]
        if c in classes:
            classes[c] += 1
    kp = None
    if gsts:
        kps = gsts[0].data.get("allKpIndex") or []
        if kps:
            kp = {"value": max(k.get("kpIndex", 0) for k in kps), "time": gsts[0].time.isoformat()}
    flux = db.scalars(select(ProtonFlux).order_by(ProtonFlux.time)).all()
    return {"status": kv_get(db, "space_weather_status") or {},
            "sep": sep_out, "flares_30d": classes,
            "flares_recent": [{"class": f.data.get("classType"), "time": f.time.isoformat()} for f in flrs[:6]],
            "kp_latest": kp,
            "protons": [{"t": p.time.isoformat(), "flux": p.flux} for p in flux[::3]],
            "protons_latest": ({"t": flux[-1].time.isoformat(), "flux": flux[-1].flux, "satellite": flux[-1].satellite}
                               if flux else None)}


# ---------------- imagens reais (câmaras) ----------------

def _pick(hrefs: list[str]) -> str | None:
    for suffix in ("~large.jpg", "~medium.jpg", "~orig.jpg", "~small.jpg"):
        for h in hrefs:
            if h.lower().endswith(suffix):
                return h
    return next((h for h in hrefs if h.lower().endswith(".jpg")), None)


def _download(c: httpx.Client, url: str, dest: Path):
    r = c.get(url, follow_redirects=True)
    r.raise_for_status()
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(r.content)


def refresh_camera(db: Session, cam: dict) -> dict:
    dest = CACHE_DIR / "cameras" / f"{cam['id']}.jpg"
    meta = {"id": cam["id"], "ok": False, "caption": cam["fallback_caption"]}
    if OFFLINE:
        return meta
    try:
        with httpx.Client(timeout=httpx.Timeout(25.0, connect=6.0)) as c:
            if cam.get("epic"):
                items = c.get(EPIC_API).json()
                last = items[-1]
                d = datetime.strptime(last["date"], "%Y-%m-%d %H:%M:%S")
                url = f"https://epic.gsfc.nasa.gov/archive/natural/{d:%Y/%m/%d}/jpg/{last['image']}.jpg"
                _download(c, url, dest)
                meta.update(ok=True, title="Terra vista pela câmara EPIC", date=last["date"] + " UTC",
                            credit="NASA/NOAA DSCOVR EPIC", source_url=url)
            else:
                ids = list(cam.get("nasa_ids", []))
                people = re.compile(CAMERAS["people_filter"], re.I)
                for nid in ids + ["__search__"]:
                    try:
                        if nid == "__search__":
                            res = c.get(f"{IMAGES_API}/search", params={"q": cam["query"], "media_type": "image"}).json()
                            cand = [it for it in res["collection"]["items"]
                                    if not people.search(it["data"][0].get("description", "") + it["data"][0].get("title", ""))]
                            if not cand:
                                break
                            nid = cand[0]["data"][0]["nasa_id"]
                        asset = c.get(f"{IMAGES_API}/asset/{nid}").json()
                        url = _pick([i["href"] for i in asset["collection"]["items"]])
                        if not url:
                            continue
                        _download(c, url.replace(" ", "%20"), dest)
                        info = c.get(f"{IMAGES_API}/search", params={"nasa_id": nid}).json()
                        d0 = info["collection"]["items"][0]["data"][0] if info["collection"]["items"] else {}
                        meta.update(ok=True, nasa_id=nid, title=d0.get("title", nid), date=(d0.get("date_created") or "")[:10],
                                    credit=f"NASA, {d0.get('center', '')}".strip(" ,"), source_url=f"https://images.nasa.gov/details/{nid}")
                        break
                    except Exception:  # noqa: BLE001
                        continue
    except Exception as e:  # noqa: BLE001
        meta["error"] = type(e).__name__
    if meta["ok"]:
        meta["fetched_at"] = utcnow().isoformat()
        kv_set(db, f"camera:{cam['id']}", meta)
        db.commit()
    return meta


def camera_list(db: Session) -> list[dict]:
    out = []
    for cam in CAMERAS["cameras"]:
        meta = kv_get(db, f"camera:{cam['id']}") or {}
        has = (CACHE_DIR / "cameras" / f"{cam['id']}.jpg").exists()
        out.append({"id": cam["id"], "code": cam["code"], "name": cam["name"], "available": has,
                    "title": meta.get("title"), "date": meta.get("date"), "credit": meta.get("credit"),
                    "caption": cam["fallback_caption"], "source_url": meta.get("source_url"),
                    "image": f"/api/media/cameras/{cam['id']}.jpg" if has else None})
    return out
