"""Tests for NOWPayments pay_currency restriction (iter 9).

- GET /api/payments/plans returns pay_currencies = [usdcsol, bnbbsc]
- POST /api/payments/checkout accepts usdcsol / bnbbsc, rejects others with 400
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://trade-intelligence-73.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "admin@firebird.ai"
ADMIN_PASS = "Firebird2026"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=20)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok, f"no token in response: {r.json()}"
    return tok


@pytest.fixture
def auth_headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def test_plans_returns_pay_currencies(auth_headers):
    r = requests.get(f"{BASE_URL}/api/payments/plans", headers=auth_headers, timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "pay_currencies" in data
    codes = [c["code"] for c in data["pay_currencies"]]
    assert codes == ["usdcsol", "bnbbsc"], f"unexpected pay_currencies: {data['pay_currencies']}"
    labels = {c["code"]: c["label"] for c in data["pay_currencies"]}
    assert "USDC" in labels["usdcsol"] and "Solana" in labels["usdcsol"]
    assert "BNB" in labels["bnbbsc"] and "BSC" in labels["bnbbsc"]


def test_checkout_rejects_unsupported_currency(auth_headers):
    r = requests.post(f"{BASE_URL}/api/payments/checkout",
                      headers=auth_headers,
                      json={"plan": "monthly", "pay_currency": "btc"}, timeout=25)
    assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"
    detail = r.json().get("detail", "")
    assert "Unsupported" in detail or "usdcsol" in detail.lower()


def test_checkout_rejects_uppercase_other(auth_headers):
    r = requests.post(f"{BASE_URL}/api/payments/checkout",
                      headers=auth_headers,
                      json={"plan": "monthly", "pay_currency": "ETH"}, timeout=25)
    assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"


@pytest.mark.parametrize("cur", ["usdcsol", "bnbbsc"])
def test_checkout_accepts_supported_currency(auth_headers, cur):
    r = requests.post(f"{BASE_URL}/api/payments/checkout",
                      headers=auth_headers,
                      json={"plan": "test", "pay_currency": cur}, timeout=30)
    # Either succeeds with invoice_url (gateway ready) OR 503 if gateway not configured.
    if r.status_code == 503:
        pytest.skip("Gateway not configured in this env")
    assert r.status_code == 200, f"expected 200 for {cur}, got {r.status_code}: {r.text}"
    body = r.json()
    assert body.get("invoice_url"), f"no invoice_url returned: {body}"
    assert body.get("order_id")


def test_checkout_defaults_to_usdcsol_when_missing(auth_headers):
    r = requests.post(f"{BASE_URL}/api/payments/checkout",
                      headers=auth_headers,
                      json={"plan": "test"}, timeout=30)
    if r.status_code == 503:
        pytest.skip("Gateway not configured in this env")
    assert r.status_code == 200, r.text
    assert r.json().get("invoice_url")
