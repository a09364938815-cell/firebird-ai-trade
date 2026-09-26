"""Iteration 2 — security bug fix verification.

Focus:
- Unregistered email cannot log in (401).
- Duplicate registration returns 400 with 'Email already registered'.
- Stale/invalid token: /api/auth/me returns 401.
- Email normalized to lowercase.
"""
import os
import uuid
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://trade-intelligence-73.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


def test_unregistered_email_cannot_login():
    email = f"ghost_{uuid.uuid4().hex[:10]}@nowhere.example.com"
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": "whatever123"})
    assert r.status_code == 401, f"Expected 401 for unknown email, got {r.status_code}: {r.text}"
    data = r.json()
    assert "access_token" not in data
    assert "detail" in data


def test_multiple_random_emails_all_rejected():
    codes = []
    for _ in range(3):
        email = f"rand_{uuid.uuid4().hex[:10]}@x.io"
        r = requests.post(f"{API}/auth/login", json={"email": email, "password": "anything"})
        codes.append(r.status_code)
    assert all(c == 401 for c in codes), f"Some unregistered logins succeeded: {codes}"


def test_register_success_then_duplicate_returns_400():
    email = f"dup_{uuid.uuid4().hex[:8]}@test.com"
    r1 = requests.post(f"{API}/auth/register", json={"email": email, "password": "pass123", "name": "Dup"})
    assert r1.status_code == 200, r1.text
    body = r1.json()
    assert body["email"] == email.lower()
    assert "access_token" in body and len(body["access_token"]) > 20

    r2 = requests.post(f"{API}/auth/register", json={"email": email, "password": "pass123", "name": "Dup2"})
    assert r2.status_code == 400, f"Expected 400 duplicate, got {r2.status_code}: {r2.text}"
    assert "already" in r2.json().get("detail", "").lower()


def test_register_email_normalized_lowercase():
    raw = f"MiXeD_{uuid.uuid4().hex[:6]}@Test.COM"
    r = requests.post(f"{API}/auth/register", json={"email": raw, "password": "pass123"})
    assert r.status_code == 200, r.text
    assert r.json()["email"] == raw.lower()
    # login with lowercase works
    rl = requests.post(f"{API}/auth/login", json={"email": raw.lower(), "password": "pass123"})
    assert rl.status_code == 200


def test_stale_or_invalid_token_me_returns_401():
    bad_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.signature"
    r = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {bad_token}"})
    assert r.status_code == 401


def test_expired_looking_random_bytes_token_401():
    r = requests.get(f"{API}/auth/me", headers={"Authorization": "Bearer totally-not-a-jwt"})
    assert r.status_code == 401


def test_login_response_no_password_hash():
    r = requests.post(f"{API}/auth/login", json={"email": "admin@firebird.ai", "password": "Firebird#2026"})
    assert r.status_code == 200
    body = r.json()
    assert "password_hash" not in body
    assert "_id" not in body
    assert body.get("access_token")
