"""FIX 1 tests: coin search, ticker, and user-scoped watchlist."""
import os
import time
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Read frontend .env fallback
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")

# read admin password from backend/.env
ADMIN_PASSWORD = None
with open("/app/backend/.env") as f:
    for line in f:
        if line.startswith("ADMIN_PASSWORD="):
            ADMIN_PASSWORD = line.split("=", 1)[1].strip().strip('"')
ADMIN_EMAIL = "admin@firebird.ai"


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    data = r.json()
    token = data.get("token") or data.get("access_token")
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module")
def second_user_session():
    s = requests.Session()
    email = f"TEST_user_{int(time.time())}@example.com"
    pw = "TestPass!234"
    r = s.post(f"{BASE_URL}/api/auth/register", json={"email": email, "password": pw, "name": "TestUser"})
    assert r.status_code in (200, 201), f"register failed: {r.status_code} {r.text}"
    body = r.json()
    token = body.get("token") or body.get("access_token")
    if not token:
        r2 = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw})
        assert r2.status_code == 200
        token = r2.json().get("token") or r2.json().get("access_token")
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    return s


class TestSearch:
    def test_search_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/market/search", params={"q": "BT"})
        assert r.status_code in (401, 403)

    def test_search_bt(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/market/search", params={"q": "BT"})
        assert r.status_code == 200
        data = r.json()
        assert "results" in data and isinstance(data["results"], list)
        assert len(data["results"]) > 0
        first = data["results"][0]
        assert "symbol" in first and "name" in first

    def test_search_empty_returns_curated(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/market/search", params={"q": ""})
        assert r.status_code == 200
        assert len(r.json()["results"]) > 0


class TestTicker:
    def test_ticker_arb(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/market/ticker", params={"symbol": "ARB"})
        assert r.status_code == 200
        d = r.json()
        assert d["symbol"] == "ARB"
        assert isinstance(d["price"], (int, float))
        assert "change_24h" in d
        assert "simulated" in d


class TestWatchlist:
    def test_get_watchlist_shape(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/market/watchlist")
        assert r.status_code == 200
        d = r.json()
        assert "symbols" in d and isinstance(d["symbols"], list)
        # cleanup upfront: remove PEPE if present
        admin_session.delete(f"{BASE_URL}/api/market/watchlist/PEPE")

    def test_add_and_persist_pepe(self, admin_session):
        r = admin_session.post(f"{BASE_URL}/api/market/watchlist", json={"symbol": "PEPE"})
        assert r.status_code == 200
        assert "PEPE" in r.json()["symbols"]
        # second GET persists
        r2 = admin_session.get(f"{BASE_URL}/api/market/watchlist")
        assert r2.status_code == 200
        assert "PEPE" in r2.json()["symbols"]

    def test_delete_pepe(self, admin_session):
        r = admin_session.delete(f"{BASE_URL}/api/market/watchlist/PEPE")
        assert r.status_code == 200
        assert "PEPE" not in r.json()["symbols"]

    def test_invalid_symbol_rejected(self, admin_session):
        r = admin_session.post(f"{BASE_URL}/api/market/watchlist", json={"symbol": "bad symbol!!"})
        assert r.status_code == 400

    def test_user_scoping(self, admin_session, second_user_session):
        # admin adds ZZZTEST
        admin_session.post(f"{BASE_URL}/api/market/watchlist", json={"symbol": "ZZZTEST"})
        r = second_user_session.get(f"{BASE_URL}/api/market/watchlist")
        assert r.status_code == 200
        assert "ZZZTEST" not in r.json()["symbols"]
        # cleanup
        admin_session.delete(f"{BASE_URL}/api/market/watchlist/ZZZTEST")
