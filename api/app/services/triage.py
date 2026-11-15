"""Triagem a bordo (secção 5).

Fornecedores (interface única):
  1. Ollama no computador de bordo, se OLLAMA_URL estiver definido (timeout 15 s);
  2. só regras, quando a IA não está disponível.
Em ambos os casos as regras de segurança correm depois e só podem subir o nível,
e uma verificação final impede diagnósticos e receitas.
"""
import json
import re

import httpx

from ..config import DATA_DIR, OLLAMA_URL, OLLAMA_MODEL

RULES = json.loads((DATA_DIR / "safety_rules.json").read_text(encoding="utf-8"))
LEVEL_ORDER = {"ok": 0, "warn": 1, "crit": 2}
FORBIDDEN = re.compile(r"diagn[oó]stic|voc[eê] tem (uma|um)|tome \d|mg de|comprimido|n[aã]o [eé] nada", re.I)
SAFE_FALLBACK = "Não consigo orientar com segurança. Descanse, avise a tripulação e aguarde contacto da Terra."


def rule_check(text: str) -> dict | None:
    for r in RULES["danger"]:
        if re.search(r["pattern"], text, re.I):
            return {"id": r["id"], "name": r["name"], "label": f'{r["id"]}: {r["name"]}'}
    return None


def vital_check(hr: float | None, base_hr: float | None) -> dict | None:
    if not hr or not base_hr:
        return None
    for r in RULES["vital_rules"]:
        if "factor_above" in r and hr > base_hr * r["factor_above"]:
            return {"id": r["id"], "name": r["name"], "label": f'{r["id"]}: {r["name"]}'}
        if "factor_below" in r and hr < base_hr * r["factor_below"]:
            return {"id": r["id"], "name": r["name"], "label": f'{r["id"]}: {r["name"]}'}
    return None


def summarise(text: str) -> dict:
    syms, prev = [], []
    for pat, name, tip in RULES["symptoms"]:
        if re.search(pat, text, re.I) and name not in syms:
            syms.append(name)
            if tip:
                prev.append(tip)
    if not syms:
        syms.append("Mal-estar geral")
    inten = "forte" if re.search(r"forte|muito|insuport|intens", text, re.I) else \
        "ligeira" if re.search(r"ligeir|pouco|leve", text, re.I) else "moderada"
    since = "desde que acordou" if re.search(r"acordei|esta manh", text, re.I) else \
        "desde ontem" if re.search(r"ontem", text, re.I) else \
        "há vários dias" if re.search(r"dias|semana", text, re.I) else \
        "começou agora" if re.search(r"agora|de repente", text, re.I) else "não indicado"
    return {"symptoms": syms, "intensity": inten, "since": since, "prevention": prev[:3]}


def _rules_level(s: dict) -> str:
    if "Visão alterada" in s["symptoms"] or len(s["symptoms"]) >= 3 or s["intensity"] == "forte":
        return "warn"
    return "ok"


CONDUCT = {
    "crit": "Pare o que está a fazer e prenda-se a um apoio. Avise a tripulação. O alerta já seguiu para a Terra.",
    "warn": "Pare a actividade, descanse e repita a medição do coração dentro de 20 minutos. Se piorar, avise a tripulação.",
    "ok": "Pode continuar as tarefas leves. Volte a registar se os sintomas se mantiverem até amanhã.",
}


def _ollama(text: str, summary: dict, meas: dict) -> dict | None:
    if not OLLAMA_URL:
        return None
    system = ("És a IA de triagem de bordo do ASTRA. Responde só em JSON com as chaves "
              "level (ok|warn|crit), conduct (uma frase), prevention (lista curta). "
              "Nunca diagnostiques, nunca receites medicamentos, nunca digas que não é nada.")
    user = f"Sintomas: {text}\nResumo: {json.dumps(summary, ensure_ascii=False)}\nMedições: {json.dumps(meas)}"
    try:
        r = httpx.post(f"{OLLAMA_URL}/api/chat", timeout=15, json={
            "model": OLLAMA_MODEL, "format": "json", "stream": False,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]})
        out = json.loads(r.json()["message"]["content"])
        if out.get("level") not in LEVEL_ORDER or not isinstance(out.get("conduct"), str):
            return None
        return out
    except Exception:
        return None


def triage(text: str, meas: dict, base_hr: float | None) -> dict:
    s = summarise(text)
    ai = _ollama(text, s, meas)
    provider = f"ollama:{OLLAMA_MODEL}" if ai else "regras"
    level = ai["level"] if ai else _rules_level(s)
    conduct = ai["conduct"] if ai else CONDUCT[level]
    prevention = (ai.get("prevention") if ai else None) or s["prevention"]
    # regras de segurança: só sobem o nível
    danger = rule_check(text) or vital_check(meas.get("heart_rate"), base_hr)
    if danger:
        level, conduct = "crit", CONDUCT["crit"]
    # verificação final
    if FORBIDDEN.search(conduct) or any(FORBIDDEN.search(p) for p in prevention):
        conduct, prevention = SAFE_FALLBACK, []
    return {"summary": s, "level": level, "conduct": conduct, "prevention": prevention[:3],
            "rule": danger["label"] if danger else None, "provider": provider,
            "ai_available": bool(ai) or not OLLAMA_URL}
