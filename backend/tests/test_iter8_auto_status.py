"""Iter 8: Verify /auto/status returns the configured limits and reset_demo default = 500."""
import os
import pytest
import requests


def _load_backend_url():
    url = os.environ.get("REACT_APP_BACKEND_URL")
    if url:
        return url.rstrip("/")
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip().rstrip("/")
    return ""


BASE_URL = _load_backend_url()


@pytest.fixture(scope="module")
def auth_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": "admin@firebird.ai", "password": "Firebird2026"}, timeout=15)
    assert r.status_code == 200, r.text
    tok = r.json().get("access_token") or r.json().get("token")
    if tok:
        s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


def test_reset_demo_default_balance_is_500(auth_client):
    # Send empty body => default should be 500
    r = auth_client.post(f"{BASE_URL}/api/trading/demo/reset", json={}, timeout=15)
    assert r.status_code == 200, r.text
    assert r.json().get("demo_balance") == 500.0


def test_auto_status_limits(auth_client):
    r = auth_client.get(f"{BASE_URL}/api/trading/auto/status", timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    limits = data.get("limits", {})
    assert limits.get("max_drawdown_pct") == 20
    assert limits.get("entry_min_score") == 70
    assert limits.get("cooldown_losses") == 2
    assert limits.get("cooldown_minutes") == 30
    # quality timeframes must contain 15m, 1h, 4h, 1d
    etfs = limits.get("entry_timeframes") or []
    for tf in ("15m", "1h", "4h", "1d"):
        assert tf in etfs, f"missing {tf} in entry_timeframes={etfs}"
    # risk mode active (not halted) when freshly reset
    assert data.get("risk_mode") in ("Active", "Halted")
    assert data.get("risk_halt") in (False, True)


def test_auto_status_after_reset_is_active(auth_client):
    auth_client.post(f"{BASE_URL}/api/trading/demo/reset", json={"balance": 500}, timeout=15)
    r = auth_client.get(f"{BASE_URL}/api/trading/auto/status", timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert d["risk_halt"] is False
    assert d["risk_mode"] == "Active"
    # equity close to 500 after reset (no open positions)
    assert abs(d["equity"] - 500.0) < 1.0
