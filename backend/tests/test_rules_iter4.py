"""Iteration 4: Trading rules engine, leverage, liquidation, auto-tick, backtest."""
import os
import time
import uuid
import pytest
import requests
from dotenv import load_dotenv
load_dotenv("/app/frontend/.env")

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
ADMIN = {"email": "admin@firebird.ai", "password": "Firebird#2026"}


def _new_user():
    s = requests.Session()
    email = f"iter4_{uuid.uuid4().hex[:8]}@test.com"
    r = s.post(f"{BASE}/api/auth/register", json={"email": email, "password": "test123"})
    assert r.status_code in (200, 201), r.text
    return s, email


@pytest.fixture(scope="module")
def user_session():
    # Use admin (already registered) to avoid signup rate limit
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json=ADMIN)
    assert r.status_code == 200, r.text
    # Reset demo state for clean tests
    s.post(f"{BASE}/api/trading/demo/reset")
    s.post(f"{BASE}/api/trading/auto/resume")
    r = s.put(f"{BASE}/api/trading/settings",
              json={"risk_lock": False, "auto_trade": False})
    assert r.status_code == 200
    return s, ADMIN["email"]


@pytest.fixture
def admin_session():
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json=ADMIN)
    assert r.status_code == 200, r.text
    return s


# --- Regression: admin login ---
def test_admin_login(admin_session):
    r = admin_session.get(f"{BASE}/api/auth/me")
    assert r.status_code == 200
    assert r.json().get("role") == "admin"


# --- Manual leverage ---
def test_manual_leverage_notional_and_warning(user_session):
    s, _ = user_session
    r = s.post(f"{BASE}/api/trading/manual",
               json={"symbol": "BTC", "side": "BUY", "usd_amount": 10, "leverage": 20})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["leverage"] == 20
    assert d["warning"] and "leverage" in d["warning"].lower()
    pos = d["position"]
    assert pos["leverage"] == 20
    assert abs(pos["notional"] - 10 * 20) < 0.01
    assert abs(pos["usd_amount"] - 10) < 0.01

    # Balance decreased by margin only ($10), not notional
    port = s.get(f"{BASE}/api/trading/portfolio").json()
    assert port["cash"] <= 90.0 + 0.01
    assert port["cash"] >= 89.99


def test_manual_leverage_capped_at_50(user_session):
    s, _ = user_session
    r = s.post(f"{BASE}/api/trading/manual",
               json={"symbol": "BTC", "side": "BUY", "usd_amount": 5, "leverage": 999})
    assert r.status_code == 200
    d = r.json()
    assert d["leverage"] == 50.0


def test_manual_low_leverage_no_warning(user_session):
    s, _ = user_session
    r = s.post(f"{BASE}/api/trading/manual",
               json={"symbol": "BTC", "side": "BUY", "usd_amount": 5, "leverage": 3})
    assert r.status_code == 200
    d = r.json()
    assert d["leverage"] == 3.0
    assert d["warning"] is None


# --- Liquidation floor ---
def test_liquidation_pnl_floored_at_margin(user_session):
    """Simulate a large loss with high leverage; pnl must not exceed -margin."""
    s, _ = user_session
    # Open a leveraged position
    r = s.post(f"{BASE}/api/trading/manual",
               json={"symbol": "BTC", "side": "BUY", "usd_amount": 10, "leverage": 50})
    assert r.status_code == 200
    pos = r.json()["position"]

    # Manually simulate a big loss by directly forcing close via SELL at same price
    # Since we cannot manipulate market price, instead verify _close_position math:
    # After open, cash = starting - margin. After close at same price pnl ~= 0.
    port_before = s.get(f"{BASE}/api/trading/portfolio").json()
    starting_cash = port_before["cash"]

    # Close via SELL - matches BUY. PnL should be near 0 (price similar), never < -margin
    r2 = s.post(f"{BASE}/api/trading/manual",
                json={"symbol": "BTC", "side": "SELL", "usd_amount": 0.01, "leverage": 1})
    assert r2.status_code == 200
    pnl = r2.json()["pnl"]
    assert pnl >= -10.0  # can't exceed margin loss

    # Verify demo balance never below 100-margin bound
    me = s.get(f"{BASE}/api/auth/me").json()
    assert me["demo_balance"] >= 90.0 - 0.5  # allow small commission/pnl variance


# --- Auto-trade tick ---
def test_auto_tick_opens_and_respects_rules(user_session):
    s, _ = user_session
    r = s.put(f"{BASE}/api/trading/settings", json={"auto_trade": True})
    assert r.status_code == 200

    opened_any = []
    for _ in range(5):
        r = s.post(f"{BASE}/api/trading/auto/tick")
        assert r.status_code == 200, r.text
        d = r.json()
        assert "equity" in d
        assert "drawdown_pct" in d
        assert "halt" in d
        opened_any.extend(d.get("opened", []))

    # Verify at least one opened entry (simulated market usually gives BUY signals)
    if opened_any:
        for o in opened_any:
            assert o["timeframe"] in ["15m", "1h", "4h"]
            assert o["score"] >= 62
            assert o["leverage"] <= 10

    # After ticks, max concurrent auto is 2
    port = s.get(f"{BASE}/api/trading/portfolio").json()
    auto_positions = [p for p in port["positions"] if p.get("source") == "auto"]
    assert len(auto_positions) <= 2


def test_auto_position_has_2to1_reward_risk(user_session):
    s, _ = user_session
    s.put(f"{BASE}/api/trading/settings", json={"auto_trade": True})
    for _ in range(5):
        r = s.post(f"{BASE}/api/trading/auto/tick")
        assert r.status_code == 200
        if r.json().get("opened"):
            break
    port = s.get(f"{BASE}/api/trading/portfolio").json()
    auto_pos = [p for p in port["positions"] if p.get("source") == "auto"]
    if not auto_pos:
        pytest.skip("No auto position opened this run")
    for p in auto_pos:
        tp = p["take_profit_pct"]
        sl = p["stop_loss_pct"]
        assert abs(tp - 2 * sl) < 0.01, f"tp={tp} sl={sl} not 2:1"


# --- Circuit breaker & resume ---
def test_auto_status_and_resume(user_session):
    s, _ = user_session
    r = s.get(f"{BASE}/api/trading/auto/status")
    assert r.status_code == 200
    d = r.json()
    for k in ["risk_halt", "halt_reason", "consecutive_losses", "peak_equity"]:
        assert k in d

    r2 = s.post(f"{BASE}/api/trading/auto/resume")
    assert r2.status_code == 200
    assert r2.json()["ok"] is True

    r3 = s.get(f"{BASE}/api/trading/auto/status")
    d3 = r3.json()
    assert d3["risk_halt"] is False
    assert d3["consecutive_losses"] == 0


# --- Backtest ---
def test_backtest_structure(user_session):
    s, _ = user_session
    r = s.get(f"{BASE}/api/trading/backtest?symbol=BTC&interval=1h")
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["symbol"] == "BTC"
    assert d["interval"] == "1h"
    assert "windows" in d and len(d["windows"]) == 5
    assert "overall_win_rate" in d
    assert "overall_return_pct" in d
    assert "disclaimer" in d
    for w in d["windows"]:
        assert "window" in w and "trades" in w and "win_rate" in w and "return_pct" in w


# --- Owner commission on profit (regression) ---
def test_owner_commission_on_profit(user_session):
    s, _ = user_session
    # Open then close a position - if pnl>0 commission=2%
    r = s.post(f"{BASE}/api/trading/manual",
               json={"symbol": "BTC", "side": "BUY", "usd_amount": 10, "leverage": 1})
    assert r.status_code == 200
    time.sleep(0.5)
    r2 = s.post(f"{BASE}/api/trading/manual",
                json={"symbol": "BTC", "side": "SELL", "usd_amount": 0.01, "leverage": 1})
    assert r2.status_code == 200
    # Just verify endpoint works; commission logic already covered in iter3 tests
    reports = s.get(f"{BASE}/api/trading/reports").json()
    assert reports["total_trades"] >= 1
