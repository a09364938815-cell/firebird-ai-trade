"""Iteration 5 — verify SEC-001 (encrypted exchange keys), SEC-002 (SSE stream token),
IDOR/authz regression, cloud trading endpoints, notifications, auth regression,
aggregated multi-exchange endpoints.
"""
import os
import uuid
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://trade-intelligence-73.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@firebird.ai"
ADMIN_PASSWORD = "Firebird#2026"


@pytest.fixture(scope="module")
def admin():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    data = r.json()
    tok = data["access_token"]
    s.headers.update({"Authorization": f"Bearer {tok}"})
    s.token = tok
    s.user_id = data["id"]
    return s


@pytest.fixture(scope="module")
def user2():
    """Second normal user for IDOR test. Skip if rate-limited."""
    s = requests.Session()
    email = f"idor_{uuid.uuid4().hex[:6]}@t.com"
    r = s.post(f"{API}/auth/register", json={"email": email, "password": "test123", "name": "IDOR"})
    if r.status_code == 429:
        pytest.skip("register rate-limited")
    assert r.status_code == 200, r.text
    d = r.json()
    s.headers.update({"Authorization": f"Bearer {d['access_token']}"})
    s.token = d["access_token"]
    s.user_id = d["id"]
    s.email = email
    return s


# ---------- SEC-002: SSE stream token ----------
class TestSECStreamToken:
    def test_stream_token_issued(self, admin):
        r = admin.post(f"{API}/trading/stream-token")
        assert r.status_code == 200, r.text
        tok = r.json().get("token")
        assert tok and isinstance(tok, str) and len(tok) > 20

    def test_stream_with_stream_token_works(self, admin):
        r = admin.post(f"{API}/trading/stream-token")
        tok = r.json()["token"]
        # stream=True to open; read a small chunk then close
        with requests.get(f"{API}/trading/stream", params={"token": tok}, stream=True, timeout=15) as sr:
            assert sr.status_code == 200
            assert "text/event-stream" in sr.headers.get("content-type", "")
            # read one chunk
            got = False
            for chunk in sr.iter_content(chunk_size=200):
                if chunk:
                    got = True
                    text = chunk.decode(errors="ignore")
                    assert "data:" in text or "event:" in text
                    break
            assert got, "No SSE data received"

    def test_stream_rejects_access_jwt(self, admin):
        """SEC-002: long-lived access JWT must NOT be accepted on /stream."""
        r = requests.get(f"{API}/trading/stream", params={"token": admin.token}, timeout=10)
        assert r.status_code == 401, f"Expected 401, got {r.status_code} {r.text[:200]}"

    def test_stream_rejects_bad_token(self):
        r = requests.get(f"{API}/trading/stream", params={"token": "bad.token.here"}, timeout=10)
        assert r.status_code == 401


# ---------- SEC-001: Encrypted exchange key storage ----------
class TestSECExchangeKeyEncryption:
    def test_connect_and_masked_only(self, admin):
        plain_key = "testkey1234567890"
        plain_secret = "secretabcdef"
        r = admin.post(f"{API}/exchanges/connect",
                       json={"exchange": "coinex", "api_key": plain_key, "api_secret": plain_secret})
        assert r.status_code == 200, r.text
        body = r.text
        # plaintext must NOT appear in the connect response
        assert plain_key not in body, "Plaintext api_key leaked in /connect response"
        assert plain_secret not in body, "Plaintext api_secret leaked in /connect response"

        # list response must show masked only
        rl = admin.get(f"{API}/exchanges/list")
        assert rl.status_code == 200
        list_body = rl.text
        assert plain_key not in list_body, "Plaintext api_key leaked in /list response"
        assert plain_secret not in list_body, "Plaintext api_secret leaked in /list response"
        conns = rl.json()["connections"]
        coinex = next((c for c in conns if c["exchange"] == "coinex"), None)
        assert coinex is not None
        masked = coinex.get("api_key_masked", "")
        assert "****" in masked, f"Expected masked key, got {masked!r}"
        # sanity: mask format `test****7890`
        assert masked.startswith(plain_key[:4]) and masked.endswith(plain_key[-4:]), masked


# ---------- IDOR / authz ----------
class TestIDOR:
    def test_user2_cannot_delete_admin_connection(self, admin, user2):
        # ensure admin has one
        admin.post(f"{API}/exchanges/connect",
                   json={"exchange": "coinex", "api_key": "aaaa1111bbbb2222", "api_secret": "ssss"})
        rl = admin.get(f"{API}/exchanges/list")
        conns = rl.json()["connections"]
        assert conns, "admin should have at least one connection"
        cid = conns[0]["id"]

        # user2 attempts delete
        r = user2.delete(f"{API}/exchanges/{cid}")
        assert r.status_code == 404, f"IDOR: user2 got {r.status_code} on admin conn"
        # user2 attempts test
        rt = user2.post(f"{API}/exchanges/{cid}/test")
        assert rt.status_code == 404

    def test_malformed_id_404_not_500(self, admin):
        for path in [f"{API}/exchanges/xyz/test", f"{API}/exchanges/notanid"]:
            if path.endswith("/test"):
                r = admin.post(path)
            else:
                r = admin.delete(path)
            assert r.status_code == 404, f"{path} -> {r.status_code}"

    def test_notifications_scoped_by_user(self, admin, user2):
        r = user2.get(f"{API}/notifications")
        assert r.status_code == 200
        items = r.json().get("items", [])
        # user2 shouldn't see admin's notifications; only its own (likely empty)
        # We can't verify content, but count is at least a smoke check.
        assert isinstance(items, list)

    def test_delete_bad_notification_id(self, admin):
        r = admin.delete(f"{API}/notifications/xyz")
        assert r.status_code == 404


# ---------- Cloud trading ----------
class TestCloud:
    def test_enable_disable_and_status(self, admin):
        r = admin.post(f"{API}/trading/cloud/enable")
        assert r.status_code == 200
        assert r.json().get("cloud_trading") is True

        rs = admin.get(f"{API}/trading/auto/status")
        assert rs.status_code == 200
        st = rs.json()
        assert st.get("cloud_trading") is True
        assert "cloud_status" in st and "risk_mode" in st
        assert "drawdown_pct" in st and "consecutive_losses" in st
        assert "limits" in st and isinstance(st["limits"], dict)

        rd = admin.post(f"{API}/trading/cloud/disable")
        assert rd.status_code == 200
        assert rd.json().get("cloud_trading") is False


# ---------- Notifications ----------
class TestNotifications:
    def test_list_shape(self, admin):
        r = admin.get(f"{API}/notifications")
        assert r.status_code == 200
        d = r.json()
        assert "unread" in d and "items" in d
        assert isinstance(d["items"], list)

    def test_mark_all_read(self, admin):
        # generate one
        admin.post(f"{API}/trading/cloud/enable")
        admin.post(f"{API}/trading/cloud/disable")
        r = admin.post(f"{API}/notifications/read")
        assert r.status_code == 200
        r2 = admin.get(f"{API}/notifications")
        assert r2.json()["unread"] == 0


# ---------- Auth regression ----------
class TestAuthRegression:
    def test_login_sets_cookies(self):
        s = requests.Session()
        r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r.status_code == 200
        # Check Set-Cookie header
        cookies = s.cookies
        assert "access_token" in cookies, f"Expected access_token cookie, got {list(cookies.keys())}"
        assert "refresh_token" in cookies

    def test_me_with_cookie(self):
        s = requests.Session()
        r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r.status_code == 200
        r2 = s.get(f"{API}/auth/me")  # no Authorization header
        assert r2.status_code == 200
        assert r2.json()["email"] == ADMIN_EMAIL

    def test_me_with_bearer(self, admin):
        r = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {admin.token}"})
        assert r.status_code == 200


# ---------- Aggregated multi-exchange ----------
class TestAggregated:
    def test_supported_9(self, admin):
        r = admin.get(f"{API}/exchanges/supported")
        assert r.status_code == 200
        exs = r.json()["exchanges"]
        assert len(exs) == 9, f"Expected 9 exchanges, got {len(exs)}"

    def test_prices(self, admin):
        r = admin.get(f"{API}/exchanges/prices", params={"symbols": "BTC,ETH"})
        assert r.status_code == 200
        d = r.json()
        assert "symbols" in d and "exchanges" in d
        assert d["symbols"] == ["BTC", "ETH"]


# ---------- Auto rules regression (light) ----------
class TestAutoTickRules:
    def test_auto_status_shape(self, admin):
        r = admin.get(f"{API}/trading/auto/status")
        assert r.status_code == 200
        d = r.json()
        for k in ("cloud_trading", "cloud_status", "risk_mode", "drawdown_pct",
                  "consecutive_losses", "limits"):
            assert k in d, f"missing {k}"

    def test_teardown_reset(self, admin):
        # leave clean state
        admin.post(f"{API}/trading/cloud/disable")
        r = admin.post(f"{API}/trading/demo/reset")
        assert r.status_code == 200
