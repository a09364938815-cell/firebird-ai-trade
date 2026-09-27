"""Firebird AI Trade — Backend API tests."""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://trade-intelligence-73.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@firebird.ai")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "Firebird#2026")


@pytest.fixture(scope="session")
def admin_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    data = r.json()
    token = data.get("access_token")
    assert token, "No access_token in login body"
    s.headers.update({"Authorization": f"Bearer {token}"})
    s.token = token
    s.user = data
    return s


# ---------- Health ----------
def test_health():
    r = requests.get(f"{API}/")
    assert r.status_code == 200
    assert r.json().get("status") == "ok"


# ---------- Auth ----------
class TestAuth:
    def test_login_admin(self, admin_session):
        assert admin_session.user["email"] == ADMIN_EMAIL
        assert admin_session.user["role"] == "admin"
        assert "_id" not in admin_session.user
        assert "password_hash" not in admin_session.user

    def test_me_bearer(self, admin_session):
        r = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {admin_session.token}"})
        assert r.status_code == 200
        assert r.json()["email"] == ADMIN_EMAIL

    def test_me_no_auth(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_login_invalid(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "wrongpass"})
        assert r.status_code == 401

    def test_register_and_me(self):
        email = f"test_{uuid.uuid4().hex[:8]}@test.com"
        r = requests.post(f"{API}/auth/register", json={"email": email, "password": "test123", "name": "Tester"})
        assert r.status_code == 200, r.text
        data = r.json()
        token = data["access_token"]
        assert data["email"] == email
        assert data.get("demo_balance") == 100.0
        r2 = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert r2.status_code == 200
        assert r2.json()["email"] == email

    def test_register_short_password(self):
        r = requests.post(f"{API}/auth/register", json={"email": f"a{uuid.uuid4().hex[:6]}@t.com", "password": "abc"})
        assert r.status_code == 422

    def test_logout(self, admin_session):
        r = requests.post(f"{API}/auth/logout")
        assert r.status_code == 200


# ---------- Market ----------
class TestMarket:
    def test_coins(self, admin_session):
        r = admin_session.get(f"{API}/market/coins")
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, (list, dict))

    def test_signals(self, admin_session):
        r = admin_session.get(f"{API}/market/signals", params={"interval": "1h"})
        assert r.status_code == 200, r.text

    def test_klines(self, admin_session):
        r = admin_session.get(f"{API}/market/klines", params={"symbol": "BTC", "interval": "1h"})
        assert r.status_code == 200, r.text

    def test_whales(self, admin_session):
        r = admin_session.get(f"{API}/market/whales")
        assert r.status_code == 200

    def test_news(self, admin_session):
        r = admin_session.get(f"{API}/market/news")
        assert r.status_code == 200


# ---------- Trading ----------
class TestTrading:
    def test_portfolio(self, admin_session):
        r = admin_session.get(f"{API}/trading/portfolio")
        assert r.status_code == 200, r.text
        data = r.json()
        assert "demo_balance" in data or "total_value" in data or "balance" in data

    def test_settings_persist(self, admin_session):
        r = admin_session.get(f"{API}/trading/settings")
        assert r.status_code == 200
        cur = r.json().get("settings", r.json())
        new_tp = 9.5 if cur.get("take_profit_pct") != 9.5 else 7.5
        r2 = admin_session.put(f"{API}/trading/settings", json={"take_profit_pct": new_tp})
        assert r2.status_code == 200, r2.text
        r3 = admin_session.get(f"{API}/trading/settings")
        got = r3.json().get("settings", r3.json())
        assert got.get("take_profit_pct") == new_tp

    def test_demo_reset(self, admin_session):
        r = admin_session.post(f"{API}/trading/demo/reset")
        assert r.status_code == 200
        rp = admin_session.get(f"{API}/trading/portfolio")
        data = rp.json()
        bal = data.get("demo_balance") or data.get("balance") or data.get("total_value")
        assert bal is not None
        assert abs(float(bal) - 100.0) < 50  # tolerate open positions accounted

    def test_manual_trade_buy_and_close(self, admin_session):
        # ensure clean state
        admin_session.post(f"{API}/trading/demo/reset")
        r = admin_session.post(f"{API}/trading/manual", json={"symbol": "BTC", "side": "BUY", "usd_amount": 20})
        assert r.status_code == 200, r.text
        data = r.json()
        pos_id = data.get("id") or data.get("position_id") or (data.get("position") or {}).get("id")
        if pos_id:
            rc = admin_session.post(f"{API}/trading/positions/{pos_id}/close")
            assert rc.status_code == 200, rc.text

    def test_backtest(self, admin_session):
        r = admin_session.get(f"{API}/trading/backtest", params={"symbol": "BTC", "interval": "1h"})
        assert r.status_code == 200, r.text
        data = r.json()
        # expect windows and disclaimer
        assert "disclaimer" in data or "windows" in data or "results" in data

    def test_reports(self, admin_session):
        r = admin_session.get(f"{API}/trading/reports")
        assert r.status_code == 200
        data = r.json()
        assert "win_rate" in data or "total_pnl" in data or "trades" in data

    def test_auto_tick(self, admin_session):
        admin_session.put(f"{API}/trading/settings", json={"auto_trade": True})
        r = admin_session.post(f"{API}/trading/auto/tick")
        assert r.status_code == 200, r.text


# ---------- Scanner ----------
class TestScanner:
    def test_memecoins(self, admin_session):
        r = admin_session.get(f"{API}/scanner/memecoins")
        assert r.status_code == 200, r.text
        data = r.json()
        items = data if isinstance(data, list) else data.get("items") or data.get("memecoins") or []
        assert isinstance(items, list)
        for it in items:
            score = it.get("score") or it.get("opportunity_score") or 0
            assert score >= 75, f"Item {it.get('symbol')} score {score} < 75"


# ---------- NFT ----------
class TestNFT:
    def test_stats(self):
        r = requests.get(f"{API}/nft/stats")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("total_supply") == 555
        rares = data.get("rares") or data.get("legendary") or data.get("legendaries") or []
        assert len(rares) == 6 or data.get("legendary_count") == 6

    def test_collection_pagination(self):
        r = requests.get(f"{API}/nft/collection", params={"tier": "all", "page": 1})
        assert r.status_code == 200
        data = r.json()
        items = data.get("items") or data.get("nfts") or []
        assert len(items) <= 24

    def test_collection_tier(self):
        r = requests.get(f"{API}/nft/collection", params={"tier": "Legendary", "page": 1})
        assert r.status_code == 200


# ---------- AI ----------
class TestAI:
    def test_chat(self, admin_session):
        r = admin_session.post(f"{API}/ai/chat", json={"message": "Hi, one line summary of BTC."}, timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        reply = data.get("reply") or data.get("message") or data.get("response")
        assert reply and isinstance(reply, str) and len(reply) > 0

    def test_score(self, admin_session):
        r = admin_session.post(f"{API}/ai/score", json={"symbol": "BTC", "interval": "1h"}, timeout=90)
        assert r.status_code == 200, r.text
        data = r.json()
        # score/rating/entry_strategy/exit_strategy/risk/summary
        keys = set(data.keys())
        assert "score" in keys or "rating" in keys or "summary" in keys

    def test_history(self, admin_session):
        r = admin_session.get(f"{API}/ai/history")
        assert r.status_code == 200


# ---------- Brute force ----------
def test_brute_force_lockout():
    email = f"bf_{uuid.uuid4().hex[:6]}@t.com"
    # register then fail 5x
    requests.post(f"{API}/auth/register", json={"email": email, "password": "test123"})
    codes = []
    for _ in range(6):
        r = requests.post(f"{API}/auth/login", json={"email": email, "password": "wrong!!"})
        codes.append(r.status_code)
    # after 5 fails should get 429
    assert 429 in codes, f"Expected 429 lockout, got {codes}"
