"""Dose de radiação estimada a bordo (modelo ilustrativo, documentado em data/references.json).

- Fundo de raios cósmicos galácticos (GCR) por destino:
    LEO/ISS ~0,5 mSv/dia; espaço profundo cislunar ~1,4 mSv/dia;
    cruzeiro Terra–Marte 1,84 mSv/dia (MSL/RAD, Zeitlin et al., Science 2013).
- Componente de partículas solares (SEP) proporcional ao fluxo real de protões ≥10 MeV
  medido pelo GOES (NOAA SWPC), atenuado pela blindagem da nave.
"""
from datetime import datetime

GCR_uSv_h = {"leo": 0.5e3 / 24, "moon": 1.4e3 / 24, "mars": 1.84e3 / 24}
SEP_uSv_h_per_pfu = 0.6      # por pfu (≥10 MeV) atrás de ~20 g/cm² de blindagem (ordem de grandeza)
SHELTER_FACTOR = 0.25        # o abrigo de tempestade reduz a componente SEP
CAREER_LIMIT_mSv = 600       # NASA-STD-3001, limite de carreira (2022)


def s_scale(flux_pfu: float | None) -> str:
    """Escala NOAA de tempestades de radiação solar (S1 ≥10 pfu … S5 ≥100 000 pfu)."""
    if flux_pfu is None:
        return "—"
    for lvl, thr in ((5, 1e5), (4, 1e4), (3, 1e3), (2, 1e2), (1, 10)):
        if flux_pfu >= thr:
            return f"S{lvl}"
    return "S0"


def replay_flux(t: datetime, start: datetime, until: datetime) -> float:
    """Perfil de reprodução de um SEP: subida rápida, pico de ~180 pfu, decaimento lento."""
    total = (until - start).total_seconds()
    x = max(0.0, (t - start).total_seconds() / total)
    if x < 0.15:
        return 0.4 + 180 * (x / 0.15) ** 2
    return 0.4 + 180 * (1 - (x - 0.15) / 0.85) ** 1.6


def dose_rate(distance: str, flux_pfu: float | None, sheltered: bool) -> float:
    sep = SEP_uSv_h_per_pfu * max(0.0, (flux_pfu or 0) - 0.5)
    if sheltered:
        sep *= SHELTER_FACTOR
    return GCR_uSv_h[distance] + sep
