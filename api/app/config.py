"""Configuração lida de variáveis de ambiente (ver .env.example)."""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent          # api/
DATA_DIR = BASE_DIR / "data"
WEB_DIR = Path(os.getenv("WEB_DIR", BASE_DIR.parent / "web"))
CACHE_DIR = Path(os.getenv("CACHE_DIR", BASE_DIR / "cache"))

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+psycopg://astra:astra@localhost:5432/astra")
NASA_API_KEY = os.getenv("NASA_API_KEY", "DEMO_KEY")
OLLAMA_URL = os.getenv("OLLAMA_URL", "")            # ex.: http://ollama:11434 (opcional)
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2:3b")
SPACE_WEATHER_REFRESH_MIN = int(os.getenv("SPACE_WEATHER_REFRESH_MIN", "30"))
OFFLINE = os.getenv("ASTRA_OFFLINE", "0") == "1"    # força o uso da cache local

# Atraso de comunicação num sentido (segundos). "demo" = Marte dividido por 60.
DISTANCES = {
    "leo":  {"label": "Órbita baixa", "short": "LEO",   "delay": 0.4,   "demo": 0.4,  "text": "menos de 1 s"},
    "moon": {"label": "Lua",          "short": "LUA",   "delay": 1.3,   "demo": 1.3,  "text": "1,3 s"},
    "mars": {"label": "Marte",        "short": "MARTE", "delay": 846.0, "demo": 14.1, "text": "14 min 06 s"},
}
MISSION_DAY0_OFFSET_DAYS = 142   # a missão começou há 142 dias

# Faixa habitual (linha de base ± margem), secção 4.6 da documentação
MARGINS = {"heart_rate": 6, "reaction_ms": 12, "sleep_h": 1.0}
