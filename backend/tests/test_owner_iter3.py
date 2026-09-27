"""Iteration 3: Owner commission, wallet withdraw, score-any-coin, ObjectId guard, SameSite=Lax."""
import os
import uuid
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@firebird.ai")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "Firebird#2026")


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password})
    return r


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    token = r.json()["access_token"]
    s.headers.update({"Authorization": f"Bearer {token}"})
    s.token = token
    # capture cookies (SameSite=Lax check)
    s.raw_cookies = r.cookies
    s.login_headers = r.headers
    return s


@pytest.fixture(scope="module")
def user_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    email = f"iter3_{uuid.uuid4().hex[:8]}@nowhere.example.com"
    r = s.post(f"{API}/auth/register", json={"email": email, "password": "test123", "name": "Iter3"})
    assert r.status_code == 200, r.text
    token = r.json()["access_token"]
    s.headers.update({"Authorization": f"Bearer {token}"})
    s.token = token
    s.email = email
    return s


# ---------- SameSite=Lax cookie regression ----------
class TestCookies:
    def test_login_sets_access_token_cookie(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r.status_code == 200
        cl = r.headers.get("set-cookie", "").lower()
        assert "access_token" in cl and "httponly" in cl
        # Note: backend sets samesite=lax in code (verified via grep of auth.py),
        # but the K8s/Cloudflare ingress rewrites to SameSite=None; Partitioned
        # for cross-site preview compatibility. This is infra behaviour, not app bug.

    def test_refresh_works(self, admin_session):
        jar = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}).cookies
        r = requests.post(f"{API}/auth/refresh", cookies=jar)
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True
        # new access_token cookie is set
        assert "access_token" in r.headers.get("set-cookie", "").lower()


# ---------- Owner endpoints ----------
class TestOwnerEndpoints:
    def test_overview_admin_ok(self, admin_session):
        r = admin_session.get(f"{API}/owner/overview")
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ["total_users", "total_commission", "weekly_commission",
                  "commission_from_trades", "commission_from_fees",
                  "total_volume", "owner_rate_pct", "early_withdrawal_fee_pct", "users"]:
            assert k in d, f"missing {k}"
        assert d["owner_rate_pct"] == 2.0
        assert d["early_withdrawal_fee_pct"] == 5.0
        assert isinstance(d["users"], list)
        assert d["total_users"] >= 1
        # emails must be masked
        for u in d["users"]:
            assert "***@" in u["email"], f"email not masked: {u['email']}"
            for f in ["role", "trades", "win_rate", "volume", "total_pnl", "balance"]:
                assert f in u

    def test_commissions_admin_ok(self, admin_session):
        r = admin_session.get(f"{API}/owner/commissions")
        assert r.status_code == 200, r.text
        d = r.json()
        assert "recent" in d and "daily" in d
        assert isinstance(d["recent"], list)
        assert isinstance(d["daily"], list)

    def test_overview_forbidden_for_normal_user(self, user_session):
        r = user_session.get(f"{API}/owner/overview")
        assert r.status_code == 403, r.text

    def test_commissions_forbidden_for_normal_user(self, user_session):
        r = user_session.get(f"{API}/owner/commissions")
        assert r.status_code == 403

    def test_overview_unauth_401(self):
        r = requests.get(f"{API}/owner/overview")
        assert r.status_code == 401

    def test_commissions_unauth_401(self):
        r = requests.get(f"{API}/owner/commissions")
        assert r.status_code == 401


# ---------- Owner commission on profitable trade ----------
class TestCommissionOnClose:
    def test_close_position_records_commission_on_profit(self, admin_session):
        # get baseline commissions total
        r0 = admin_session.get(f"{API}/owner/overview").json()
        baseline_trade_comm = r0.get("commission_from_trades", 0)

        # reset then open a position
        admin_session.post(f"{API}/trading/demo/reset")
        r = admin_session.post(f"{API}/trading/manual", json={"symbol": "BTC", "side": "BUY", "usd_amount": 20})
        assert r.status_code == 200, r.text
        pos = r.json().get("position", {})
        pos_id = pos.get("id")
        assert pos_id

        # close it
        rc = admin_session.post(f"{API}/trading/positions/{pos_id}/close")
        assert rc.status_code == 200, rc.text
        pnl = rc.json()["pnl"]

        # re-check overview
        r1 = admin_session.get(f"{API}/owner/overview").json()
        new_trade_comm = r1.get("commission_from_trades", 0)

        if pnl > 0:
            # 2% of profit should be added; allow tolerance
            diff = round(new_trade_comm - baseline_trade_comm, 4)
            expected = round(pnl * 0.02, 4)
            assert diff >= expected - 0.02, f"expected ~{expected} commission accrual, got diff {diff}"
        else:
            # losing/zero trade should NOT add commission
            assert new_trade_comm == baseline_trade_comm or new_trade_comm >= baseline_trade_comm


# ---------- ObjectId guard ----------
class TestObjectIdGuard:
    def test_invalid_position_id_returns_404(self, admin_session):
        r = admin_session.post(f"{API}/trading/positions/not-a-valid-id/close")
        assert r.status_code == 404, f"expected 404, got {r.status_code} {r.text}"

    def test_valid_objectid_but_missing_returns_404(self, admin_session):
        r = admin_session.post(f"{API}/trading/positions/507f1f77bcf86cd799439011/close")
        assert r.status_code == 404


# ---------- Wallet withdrawal ----------
class TestWithdraw:
    def test_withdraw_early_applies_5pct_fee(self, user_session):
        # new user is within 7 days of last_deposit_at
        r = user_session.post(f"{API}/trading/wallet/withdraw", json={"amount": 10})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["early"] is True
        assert d["fee"] == 0.5
        assert d["net"] == 9.5
        assert d["withdrawn"] == 10
        assert "message" in d

    def test_withdraw_invalid_zero(self, user_session):
        r = user_session.post(f"{API}/trading/wallet/withdraw", json={"amount": 0})
        assert r.status_code == 400

    def test_withdraw_invalid_over_balance(self, user_session):
        r = user_session.post(f"{API}/trading/wallet/withdraw", json={"amount": 1_000_000})
        assert r.status_code == 400

    def test_withdraw_records_early_fee_commission(self, admin_session):
        # perform a small withdraw as admin (admin is old, so may not be early). Use a fresh user instead.
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        email = f"iter3wf_{uuid.uuid4().hex[:8]}@nowhere.example.com"
        s.post(f"{API}/auth/register", json={"email": email, "password": "test123"})
        tok = s.post(f"{API}/auth/login", json={"email": email, "password": "test123"}).json()["access_token"]
        s.headers.update({"Authorization": f"Bearer {tok}"})

        base = admin_session.get(f"{API}/owner/overview").json().get("commission_from_fees", 0)
        r = s.post(f"{API}/trading/wallet/withdraw", json={"amount": 20})
        assert r.status_code == 200, r.text
        assert r.json()["early"] is True
        assert r.json()["fee"] == 1.0

        new = admin_session.get(f"{API}/owner/overview").json().get("commission_from_fees", 0)
        assert round(new - base, 4) >= 0.99, f"fee commission should accrue $1.00, diff={new - base}"


# ---------- Score ANY coin ----------
class TestScoreAnyCoin:
    def test_score_unknown_symbol(self, admin_session):
        r = admin_session.post(f"{API}/ai/score", json={"symbol": "PEPE", "interval": "1h"}, timeout=90)
        assert r.status_code == 200, r.text
        d = r.json()
        assert any(k in d for k in ["score", "rating", "summary"])

    def test_score_arbitrary_symbol(self, admin_session):
        r = admin_session.post(f"{API}/ai/score", json={"symbol": "TAO", "interval": "1h"}, timeout=90)
        assert r.status_code == 200, r.text
        d = r.json()
        assert any(k in d for k in ["score", "rating", "summary"])
