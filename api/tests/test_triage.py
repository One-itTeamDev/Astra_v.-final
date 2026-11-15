"""As regras de segurança são a parte que não pode falhar: testamo-las sem base de dados."""
from app.services import triage as tri
from app.services import radiation as rad


def test_chest_pain_is_always_critical():
    r = tri.triage("Sinto dor no peito desde há 10 minutos", {"heart_rate": 80}, 66)
    assert r["level"] == "crit"
    assert r["rule"].startswith("R-01")


def test_rules_only_raise_never_lower():
    r = tri.triage("estou um pouco cansado", {"heart_rate": 70}, 66)
    assert r["level"] == "ok" and r["rule"] is None
    r = tri.triage("estou um pouco cansado", {"heart_rate": 120}, 66)   # coração > 1,6 × linha de base
    assert r["level"] == "crit" and r["rule"].startswith("R-10")


def test_headache_and_blurred_vision_is_attention():
    r = tri.triage("Acordei com dor de cabeça forte e vejo desfocado. Estou enjoado.", {}, 66)
    assert r["level"] == "warn"
    assert {"Dor de cabeça", "Visão alterada", "Náusea"} <= set(r["summary"]["symptoms"])
    assert r["summary"]["since"] == "desde que acordou"


def test_no_diagnosis_or_prescription_passes_final_check():
    assert tri.FORBIDDEN.search("Tome 2 comprimidos de 500 mg")
    assert tri.FORBIDDEN.search("Você tem uma enxaqueca")
    assert not tri.FORBIDDEN.search(tri.CONDUCT["warn"])


def test_noaa_s_scale_thresholds():
    assert rad.s_scale(5) == "S0"
    assert rad.s_scale(10) == "S1"
    assert rad.s_scale(150) == "S2"
    assert rad.s_scale(12000) == "S4"


def test_mars_background_dose_matches_msl_rad():
    assert round(rad.dose_rate("mars", None, False) * 24 / 1000, 2) == 1.84


def test_closed_environment_flags_co2_above_nasa_limit():
    from app.services.hazards import cabin_status
    ok = {"ppco2_mmHg": 2.6, "o2_pct": 21.0, "temp_C": 22.5, "rh_pct": 47, "pressure_kPa": 101.2}
    assert cabin_status(ok)[0] == "ok"
    assert cabin_status({**ok, "ppco2_mmHg": 3.4})[0] == "warn"
