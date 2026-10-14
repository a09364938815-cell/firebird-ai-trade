import os
import re
import secrets
import hashlib
import smtplib
import logging
from email.message import EmailMessage
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr, Field

from db import db

logger = logging.getLogger("firebird.auth")

JWT_ALGORITHM = "HS256"
ACCESS_MIN = 60 * 12
REFRESH_DAYS = 7

USERNAME_RE = re.compile(r"^[a-zA-Z0-9_]{3,20}$")


def get_jwt_secret() -> str:
    return os.environ["JWT_SECRET"]


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(user_id: str, email: str, session_version: int = 1, did: str = None) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "sv": session_version,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_MIN),
        "type": "access",
    }
    if did:
        payload["did"] = did
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def decode_access_sub(token: str) -> str | None:
    """Return the user id (sub) from a valid access token, else None.
    Used by SSE where the JWT arrives as a query param."""
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            return None
        return payload.get("sub")
    except jwt.InvalidTokenError:
        return None


def create_stream_token(user_id: str) -> str:
    """Short-lived (60s), single-purpose token for authenticating the SSE stream
    so the long-lived access JWT never appears in a URL query string."""
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(seconds=60),
        "type": "stream",
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def decode_stream_sub(token: str) -> str | None:
    """Validate a stream token (type + expiry) and return its user id, else None."""
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "stream":
            return None
        return payload.get("sub")
    except jwt.InvalidTokenError:
        return None



def create_refresh_token(user_id: str, did: str = None) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=REFRESH_DAYS),
        "type": "refresh",
    }
    if did:
        payload["did"] = did
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


async def _record_device(uid: str, did: str, request: Request):
    """Upsert a per-device record (Trusted Devices). Best-effort, never blocks auth."""
    try:
        fwd = request.headers.get("x-forwarded-for", "")
        ip = fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else "unknown")
        ua = request.headers.get("user-agent", "unknown")[:300]
        now = datetime.now(timezone.utc).isoformat()
        await db.devices.update_one(
            {"user_id": uid, "device_id": did},
            {"$set": {"user_agent": ua, "ip": ip, "last_active": now},
             "$setOnInsert": {"user_id": uid, "device_id": did, "created_at": now}},
            upsert=True)
    except Exception:
        pass


def set_auth_cookies(response: Response, access: str, refresh: str):
    response.set_cookie("access_token", access, httponly=True, secure=True,
                        samesite="lax", max_age=ACCESS_MIN * 60, path="/")
    response.set_cookie("refresh_token", refresh, httponly=True, secure=True,
                        samesite="lax", max_age=REFRESH_DAYS * 86400, path="/")


def _clean_user(user: dict) -> dict:
    user["id"] = str(user["_id"])
    user.pop("_id", None)
    user.pop("password_hash", None)
    return user


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        # session_version: bumping it (password change / logout-all) invalidates old tokens
        if payload.get("sv", 1) != user.get("session_version", 1):
            raise HTTPException(status_code=401, detail="Session expired, please sign in again")
        # Trusted Devices: a revoked device_id is rejected even if the JWT is unexpired
        did = payload.get("did")
        if did and did in (user.get("revoked_devices") or []):
            raise HTTPException(status_code=401, detail="This device has been signed out")
        cleaned = _clean_user(user)
        cleaned["did"] = did
        return cleaned
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


class RegisterInput(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str = Field(default="Trader")
    username: str | None = None


class LoginInput(BaseModel):
    email: str  # username OR email (kept as `email` for frontend compatibility)
    password: str


auth_router = APIRouter(prefix="/api/auth", tags=["auth"])

DEFAULT_SETTINGS = {
    "demo_mode": True,
    "demo_balance": 100.0,
    "language": "en",
    "risk_lock": True,
    "max_position_pct": 25.0,
    "trailing_stop_pct": 3.0,
    "take_profit_pct": 8.0,
    "stop_loss_pct": 4.0,
    "auto_trade": False,
    "auto_leverage": 10.0,
    "manual_max_leverage": 50.0,
    "max_concurrent_auto": 2,
    "drawdown_halt_pct": 20.0,
    "max_consecutive_losses": 5,
}


async def _generate_username(base: str) -> str:
    """Make a unique username from an email prefix / name."""
    base = re.sub(r"[^a-zA-Z0-9_]", "", (base or "").split("@")[0])[:20].lower() or "trader"
    if len(base) < 3:
        base = (base + "user")[:20]
    candidate = base
    i = 0
    while await db.users.find_one({"username": candidate}):
        i += 1
        suffix = str(i)
        candidate = base[:20 - len(suffix)] + suffix
    return candidate


def _mask_email(email: str) -> str:
    try:
        name, dom = email.split("@")
        d_name, d_tld = dom.split(".", 1)
        m_name = name[0] + "***" + name[-1] if len(name) > 2 else name[0] + "***"
        m_dom = dom[0] + "***." + d_tld
        return f"{m_name}@{m_dom}"
    except Exception:
        return "***"


SUBJECTS = {
    "verify": {"en": "Firebird AI — Verify your email", "fa": "فایربرد AI — تأیید ایمیل"},
    "reset": {"en": "Firebird AI — Password Reset", "fa": "فایربرد AI — بازیابی رمز عبور"},
    "change": {"en": "Firebird AI — Confirm your new email", "fa": "فایربرد AI — تأیید ایمیل جدید"},
    "alert": {"en": "Firebird AI — High Opportunity Alert", "fa": "فایربرد AI — هشدار فرصت بالا"},
    "welcome": {"en": "Welcome to Firebird AI", "fa": "به فایربرد AI خوش آمدید"},
    "test": {"en": "Firebird AI — SMTP Test", "fa": "فایربرد AI — تست ایمیل"},
    "sub_expiry": {"en": "FireBird Crypto — Your Premium plan is expiring soon",
                   "fa": "فایربرد کریپتو — اشتراک ویژه شما به‌زودی منقضی می‌شود"},
}


def email_subject(kind: str, lang: str = "en") -> str:
    return SUBJECTS.get(kind, {}).get(lang or "en", SUBJECTS.get(kind, {}).get("en", "Firebird AI"))


import re as _re
import ipaddress as _ipaddress
from html import escape as _escape
from html.parser import HTMLParser as _HTMLParser
from urllib.parse import urlparse as _urlparse

# Emergent managed email proxy (Resend-backed). Base URL is a CONSTANT so it
# survives deployment; the per-app key + display name come from env.
EMAIL_BASE_URL = "https://integrations.emergentagent.com"

_SHORTENERS = ("bit.ly", "tinyurl.com", "t.co", "is.gd", "cutt.ly", "goo.gl", "rebrand.ly")
_CRED_ASK = ("reply with your password", "reply with the code", "send your password", "cvv",
             "send us your password", "enter your password below", "confirm your card number",
             "your full card number", "seed phrase", "recovery phrase", "verify your card",
             "social security number", "confirm your bank details")
_HOSTISH = _re.compile(r"\b(?:https?://)?((?:[a-z0-9-]+\.)+[a-z]{2,})", _re.I)


def _host_ok(host: str) -> bool:
    if not host or "xn--" in host:
        return False
    try:
        _ipaddress.ip_address(host)
        return False
    except ValueError:
        pass
    return not any(host == s or host.endswith("." + s) for s in _SHORTENERS)


def _same_site(shown: str, real: str) -> bool:
    return shown == real or real.endswith("." + shown) or shown.endswith("." + real)


class _EmailScan(_HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags, self.urls, self.anchors = set(), [], []
        self._href, self._text = None, []

    def handle_starttag(self, tag, attrs):
        self.tags.add(tag.lower())
        self.urls += [v for k, v in attrs if k.lower() in ("href", "src") and v]
        if tag.lower() == "a":
            self._href = dict((k.lower(), v) for k, v in attrs).get("href")
            self._text = []

    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(self, tag):
        if tag.lower() == "a" and self._href is not None:
            self.anchors.append((self._href, "".join(self._text)))
            self._href, self._text = None, []


def _assert_safe_email(subject: str, html: str) -> None:
    """Structural G2/G3 guard: no forms/inputs, no credential-ask phrasing, every
    link/asset absolute https on a safe host, anchor text host must match real host."""
    scan = _EmailScan(); scan.feed(html)
    if scan.tags & {"form", "input", "textarea", "select"}:
        raise ValueError("No forms or input fields in email (G2)")
    body = f"{subject}\n{html}".lower()
    for p in _CRED_ASK:
        if p in body:
            raise ValueError(f"Email asks for credentials: {p!r} (G2)")
    for url in scan.urls:
        low = url.strip().lower()
        if low.startswith(("mailto:", "tel:", "cid:", "#")):
            continue
        if not low.startswith("https://"):
            raise ValueError(f"Email links/assets must be absolute https: {url!r} (G3)")
        if not _host_ok(_urlparse(low).hostname or "") or _urlparse(low).username is not None:
            raise ValueError(f"Unsafe URL in email: {url!r} (G3)")
    for href, text in scan.anchors:
        real = _urlparse(href.strip().lower()).hostname or ""
        if not real:
            continue
        for m in _HOSTISH.finditer(text):
            if not _same_site(m.group(1).lower(), real):
                raise ValueError(f"Anchor text {m.group(1)!r} != link host {real!r} (G3)")


def send_email(to: str, subject: str, body: str, html: str = None) -> bool:
    """Send via Emergent managed email proxy; fall back to logging if unconfigured
    or on error. Recipients/HTML come from server-side templates only. The email
    key is NEVER logged."""
    import httpx
    key = os.environ.get("EMERGENT_EMAIL_KEY")
    from_name = os.environ.get("EMAIL_FROM_NAME") or "Firebird AI"
    enabled = os.environ.get("EMAIL_ENABLED", "false").lower() == "true"
    html_final = html or f"<p style='font-family:Arial'>{_escape(body)}</p>"
    if not (enabled and key):
        logger.warning("[EMAIL FALLBACK] (email disabled or unconfigured) To=%s | %s", to, subject)
        return False
    try:
        _assert_safe_email(subject, html_final)
        payload = {"to": [to], "subject": subject, "html": html_final, "from_name": from_name}
        reply_to = os.environ.get("EMAIL_REPLY_TO")
        if reply_to:
            payload["contact_email"] = reply_to
        with httpx.Client(timeout=30) as client:
            resp = client.post(f"{EMAIL_BASE_URL}/api/v1/email/send",
                               headers={"X-Email-Key": key}, json=payload)
        resp.raise_for_status()
        logger.info("Email sent to %s (%s)", to, subject)
        return True
    except Exception as e:
        logger.error("Email send failed: %s", e)  # never logs the key
        logger.warning("[EMAIL FALLBACK] To=%s | %s", to, subject)
        return False


def verify_smtp() -> dict:
    """Startup readiness check for the managed email integration (no secrets logged)."""
    enabled = os.environ.get("EMAIL_ENABLED", "false").lower() == "true"
    key = os.environ.get("EMERGENT_EMAIL_KEY")
    name = os.environ.get("EMAIL_FROM_NAME")
    if not enabled:
        logger.info("[EMAIL] disabled (EMAIL_ENABLED=false) — using log fallback")
        return {"ok": False, "reason": "disabled"}
    if not key:
        logger.warning("[EMAIL] enabled but EMERGENT_EMAIL_KEY missing — using log fallback")
        return {"ok": False, "reason": "no_key"}
    logger.info("[EMAIL] managed email ready (provider=resend, from_name=%s)", name or "Firebird AI")
    return {"ok": True}


def email_html(heading: str, lines, cta_text: str = None, cta_url: str = None) -> str:
    """Branded HTML email body with a permanent 'not financial advice' footer."""
    body = "".join(
        f"<p style='margin:0 0 14px;color:#cbd5e1;font-size:14px;line-height:1.6'>{l}</p>" for l in lines
    )
    cta = ""
    if cta_text and cta_url:
        cta = (f"<a href='{cta_url}' style='display:inline-block;margin:6px 0 18px;padding:12px 22px;"
               f"background:linear-gradient(90deg,#f59e0b,#f97316);color:#0b0b0b;font-weight:700;"
               f"text-decoration:none;border-radius:10px;font-size:14px'>{cta_text}</a>")
    return (
        "<!doctype html><html><body style='margin:0;background:#0b0b0f;padding:28px 0;"
        "font-family:Arial,Helvetica,sans-serif'>"
        "<div style='max-width:520px;margin:0 auto;background:#14141b;border:1px solid #262636;"
        "border-radius:16px;overflow:hidden'>"
        "<div style='padding:22px 26px;border-bottom:1px solid #262636;"
        "background:linear-gradient(90deg,rgba(249,115,22,.15),transparent)'>"
        "<span style='font-size:20px;font-weight:800;color:#f97316;letter-spacing:.5px'>FIREBIRD AI</span>"
        "<div style='color:#64748b;font-size:11px;margin-top:2px'>Crypto &amp; NFT Trading Intelligence</div></div>"
        f"<div style='padding:26px'><h1 style='margin:0 0 14px;color:#f8fafc;font-size:18px'>{heading}</h1>{body}{cta}</div>"
        "<div style='padding:16px 26px;border-top:1px solid #262636;color:#64748b;font-size:11px'>"
        "This is not financial advice.<br/>&copy; Firebird AI — sent because an action was requested for your account."
        "</div></div></body></html>"
    )


async def _new_user_doc(email: str, password: str, name: str, role: str = "user", username: str = None, email_verified: bool = False) -> dict:
    uname = username or await _generate_username(email)
    return {
        "email": email.lower(),
        "username": uname,
        "password_hash": hash_password(password),
        "name": name,
        "role": role,
        "email_verified": email_verified,
        "session_version": 1,
        "settings": dict(DEFAULT_SETTINGS),
        "demo_balance": 100.0,
        "last_deposit_at": datetime.now(timezone.utc).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }


async def _issue_token(user_id: str, kind: str, new_email: str = None, ttl_hours: int = 24) -> str:
    """Create a one-time token (email verify / change-email). Stores only the sha256 hash."""
    raw = secrets.token_urlsafe(32)
    doc = {
        "user_id": user_id,
        "kind": kind,
        "token_hash": hashlib.sha256(raw.encode()).hexdigest(),
        "used": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "expires_at": datetime.now(timezone.utc) + timedelta(hours=ttl_hours),
    }
    if new_email:
        doc["new_email"] = new_email.lower()
    await db.verification_tokens.insert_one(doc)
    return raw


def _verify_url(path: str, token: str) -> str:
    frontend = os.environ.get("FRONTEND_URL", "").rstrip("/")
    return f"{frontend}{path}?token={token}"


@auth_router.post("/register")
async def register(data: RegisterInput, response: Response, request: Request):
    email = data.email.lower()
    fwd = request.headers.get("x-forwarded-for", "")
    ip = fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else "unknown")
    # anti-bot: max 5 registrations per IP per hour
    now = datetime.now(timezone.utc)
    reg = await db.register_attempts.find_one({"ip": ip})
    if reg:
        window_start = datetime.fromisoformat(reg["window_start"])
        if (now - window_start).total_seconds() < 3600 and reg.get("count", 0) >= 5:
            raise HTTPException(status_code=429, detail="Too many sign-ups from this network. Try later.")
        if (now - window_start).total_seconds() >= 3600:
            await db.register_attempts.update_one({"ip": ip}, {"$set": {"count": 1, "window_start": now.isoformat()}})
        else:
            await db.register_attempts.update_one({"ip": ip}, {"$inc": {"count": 1}})
    else:
        await db.register_attempts.insert_one({"ip": ip, "count": 1, "window_start": now.isoformat()})
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    username = None
    if data.username:
        uname = data.username.strip().lower()
        if not USERNAME_RE.match(uname):
            raise HTTPException(status_code=400, detail="Username must be 3-20 letters, numbers or underscore")
        if await db.users.find_one({"username": uname}):
            raise HTTPException(status_code=400, detail="Username already taken")
        username = uname
    # password policy: >= 8 chars, letter + number
    _validate_new_password(data.password)
    doc = await _new_user_doc(email, data.password, data.name, username=username, email_verified=False)
    res = await db.users.insert_one(doc)
    uid = str(res.inserted_id)
    # issue email verification token (24h) — link logged + emailed (fallback logs)
    raw = await _issue_token(uid, "verify_email", ttl_hours=24)
    link = _verify_url("/verify", raw)
    logger.warning("[EMAIL VERIFY LINK] %s -> %s", email, link)
    send_email(email, email_subject("verify", "en"),
               f"Welcome to Firebird AI! Verify your email to start trading (valid 24h):\n\n{link}",
               html=email_html("Verify your email",
                               ["Welcome to Firebird AI! Confirm your email to activate your account.",
                                "This link is valid for 24 hours."],
                               cta_text="Verify Email", cta_url=link))
    did = secrets.token_hex(8)
    access = create_access_token(uid, email, doc.get("session_version", 1), did)
    set_auth_cookies(response, access, create_refresh_token(uid, did))
    await _record_device(uid, did, request)
    doc["_id"] = res.inserted_id
    result = _clean_user(doc)
    result["access_token"] = access
    return result


@auth_router.post("/login")
async def login(data: LoginInput, response: Response, request: Request):
    ident = data.email.strip().lower()
    fwd = request.headers.get("x-forwarded-for", "")
    ip = fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else "unknown")
    identifier = f"{ip}:{ident}"
    attempt = await db.login_attempts.find_one({"identifier": identifier})
    now = datetime.now(timezone.utc)
    if attempt and attempt.get("locked_until"):
        locked_until = datetime.fromisoformat(attempt["locked_until"])
        if locked_until > now:
            raise HTTPException(status_code=429, detail="Too many attempts. Try again later.")
    user = await db.users.find_one({"$or": [{"email": ident}, {"username": ident}]})
    if not user or not verify_password(data.password, user["password_hash"]):
        count = (attempt.get("count", 0) if attempt else 0) + 1
        update = {"count": count}
        if count >= 5:
            update["locked_until"] = (now + timedelta(minutes=15)).isoformat()
        await db.login_attempts.update_one({"identifier": identifier}, {"$set": update}, upsert=True)
        raise HTTPException(status_code=401, detail="Invalid username/email or password")
    await db.login_attempts.delete_one({"identifier": identifier})
    uid = str(user["_id"])
    did = secrets.token_hex(8)
    access = create_access_token(uid, user["email"], user.get("session_version", 1), did)
    set_auth_cookies(response, access, create_refresh_token(uid, did))
    await _record_device(uid, did, request)
    result = _clean_user(user)
    result["access_token"] = access
    return result


@auth_router.post("/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"ok": True}


@auth_router.get("/me")
async def me(user: dict = Depends(get_current_user)):
    return user


@auth_router.post("/refresh")
async def refresh(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="No refresh token")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
        uid = payload["sub"]
        user = await db.users.find_one({"_id": ObjectId(uid)})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        did = payload.get("did")
        if did and did in (user.get("revoked_devices") or []):
            raise HTTPException(status_code=401, detail="This device has been signed out")
        response.set_cookie("access_token", create_access_token(uid, user["email"], user.get("session_version", 1), did),
                            httponly=True, secure=True, samesite="lax",
                            max_age=ACCESS_MIN * 60, path="/")
        return {"ok": True}
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")


def _validate_new_password(pw: str, current: str = None):
    if len(pw) < 8 or not re.search(r"[A-Za-z]", pw) or not re.search(r"\d", pw):
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters and include a letter and a number")
    if current is not None and pw == current:
        raise HTTPException(status_code=400, detail="New password must be different from the current password")


class ChangePasswordInput(BaseModel):
    current_password: str
    new_password: str
    confirm_password: str


@auth_router.post("/change-password")
async def change_password(data: ChangePasswordInput, user: dict = Depends(get_current_user)):
    doc = await db.users.find_one({"_id": ObjectId(user["id"])})
    if not verify_password(data.current_password, doc["password_hash"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if data.new_password != data.confirm_password:
        raise HTTPException(status_code=400, detail="New password and confirmation do not match")
    _validate_new_password(data.new_password, data.current_password)
    await db.users.update_one({"_id": doc["_id"]},
                              {"$set": {"password_hash": hash_password(data.new_password)},
                               "$inc": {"session_version": 1}})
    return {"ok": True, "message": "Password changed. Please sign in again on your other devices."}


@auth_router.post("/logout-all")
async def logout_all(response: Response, user: dict = Depends(get_current_user)):
    await db.users.update_one({"_id": ObjectId(user["id"])}, {"$inc": {"session_version": 1}})
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"ok": True, "message": "Signed out from all devices"}


@auth_router.get("/devices")
async def list_devices(user: dict = Depends(get_current_user)):
    uid = user["id"]
    revoked = set((await db.users.find_one({"_id": ObjectId(uid)}) or {}).get("revoked_devices") or [])
    docs = await db.devices.find({"user_id": uid}).sort("last_active", -1).to_list(100)
    cur = user.get("did")
    out = []
    for d in docs:
        if d["device_id"] in revoked:
            continue
        out.append({
            "device_id": d["device_id"], "user_agent": d.get("user_agent"),
            "ip": d.get("ip"), "created_at": d.get("created_at"), "last_active": d.get("last_active"),
            "current": d["device_id"] == cur,
        })
    return {"devices": out}


@auth_router.post("/devices/{device_id}/revoke")
async def revoke_device(device_id: str, user: dict = Depends(get_current_user)):
    uid = user["id"]
    await db.users.update_one({"_id": ObjectId(uid)}, {"$addToSet": {"revoked_devices": device_id}})
    await db.devices.delete_one({"user_id": uid, "device_id": device_id})
    return {"ok": True, "message": "Device signed out"}


@auth_router.post("/devices/revoke-others")
async def revoke_other_devices(user: dict = Depends(get_current_user)):
    uid, cur = user["id"], user.get("did")
    ids = [d["device_id"] for d in await db.devices.find({"user_id": uid, "device_id": {"$ne": cur}}, {"device_id": 1}).to_list(1000)]
    if ids:
        await db.users.update_one({"_id": ObjectId(uid)}, {"$addToSet": {"revoked_devices": {"$each": ids}}})
        await db.devices.delete_many({"user_id": uid, "device_id": {"$in": ids}})
    return {"ok": True, "revoked": len(ids), "message": "Signed out from all other devices"}


class UsernameInput(BaseModel):
    username: str


@auth_router.post("/username")
async def change_username(data: UsernameInput, user: dict = Depends(get_current_user)):
    uname = data.username.strip().lower()
    if not USERNAME_RE.match(uname):
        raise HTTPException(status_code=400, detail="Username must be 3-20 letters, numbers or underscore")
    doc = await db.users.find_one({"_id": ObjectId(user["id"])})
    if uname == doc.get("username"):
        raise HTTPException(status_code=400, detail="That is already your username")
    last = doc.get("username_changed_at")
    if last:
        days = (datetime.now(timezone.utc) - datetime.fromisoformat(last)).days
        if days < 30:
            raise HTTPException(status_code=400, detail=f"Username can be changed again in {30 - days} day(s)")
    if await db.users.find_one({"username": uname}):
        raise HTTPException(status_code=400, detail="Username already taken")
    await db.users.update_one({"_id": doc["_id"]},
                              {"$set": {"username": uname, "username_changed_at": datetime.now(timezone.utc).isoformat()}})
    return {"ok": True, "username": uname}


@auth_router.get("/security")
async def security_info(user: dict = Depends(get_current_user)):
    doc = await db.users.find_one({"_id": ObjectId(user["id"])})
    last = doc.get("username_changed_at")
    can_change = True
    days_left = 0
    if last:
        days = (datetime.now(timezone.utc) - datetime.fromisoformat(last)).days
        can_change = days >= 30
        days_left = max(0, 30 - days)
    return {
        "username": doc.get("username"),
        "name": doc.get("name"),
        "email": doc.get("email"),
        "email_masked": _mask_email(doc.get("email", "")),
        "email_verified": doc.get("email_verified", False),
        "username_can_change": can_change,
        "username_days_left": days_left,
    }


class DisplayNameInput(BaseModel):
    name: str


@auth_router.post("/display-name")
async def change_display_name(data: DisplayNameInput, user: dict = Depends(get_current_user)):
    name = data.name.strip()[:40] or "Trader"
    await db.users.update_one({"_id": ObjectId(user["id"])}, {"$set": {"name": name}})
    return {"ok": True, "name": name}


@auth_router.get("/verify")
async def verify_email(token: str):
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    rec = await db.verification_tokens.find_one({"token_hash": token_hash, "used": False})
    if not rec:
        raise HTTPException(status_code=400, detail="Invalid or already-used verification link")
    expires = rec["expires_at"]
    if isinstance(expires, str):
        expires = datetime.fromisoformat(expires)
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Verification link expired. Please request a new one.")
    uid = ObjectId(rec["user_id"])
    if rec.get("kind") == "change_email":
        new_email = rec.get("new_email")
        if await db.users.find_one({"email": new_email, "_id": {"$ne": uid}}):
            raise HTTPException(status_code=400, detail="That email is now in use by another account")
        old = await db.users.find_one({"_id": uid})
        await db.users.update_one({"_id": uid},
                                  {"$set": {"email": new_email, "email_verified": True},
                                   "$inc": {"session_version": 1}})
        if old:
            logger.warning("[EMAIL CHANGED NOTICE] old=%s new=%s", old.get("email"), new_email)
            send_email(old.get("email"), "Firebird AI — Your email was changed",
                       f"Your account email was changed to {new_email}. If this wasn't you, contact support immediately.")
        msg = "Email updated. Please sign in again with your new email."
    else:
        await db.users.update_one({"_id": uid}, {"$set": {"email_verified": True}})
        msg = "Email verified! You can now open trades."
    await db.verification_tokens.update_one({"_id": rec["_id"]}, {"$set": {"used": True}})
    return {"ok": True, "message": msg}


@auth_router.post("/resend-verification")
async def resend_verification(user: dict = Depends(get_current_user)):
    doc = await db.users.find_one({"_id": ObjectId(user["id"])})
    if doc.get("email_verified"):
        return {"ok": True, "message": "Email already verified."}
    raw = await _issue_token(str(doc["_id"]), "verify_email", ttl_hours=24)
    link = _verify_url("/verify", raw)
    logger.warning("[EMAIL VERIFY LINK] %s -> %s", doc["email"], link)
    _lang = (doc.get("settings") or {}).get("language", "en")
    send_email(doc["email"], email_subject("verify", _lang),
               f"Verify your email to start trading (valid 24h):\n\n{link}",
               html=email_html("Verify your email",
                               ["Confirm your email to start trading.", "This link is valid for 24 hours."],
                               cta_text="Verify Email", cta_url=link))
    return {"ok": True, "message": "Verification email sent."}


class ChangeEmailInput(BaseModel):
    new_email: EmailStr
    current_password: str


@auth_router.post("/change-email")
async def change_email(data: ChangeEmailInput, user: dict = Depends(get_current_user)):
    doc = await db.users.find_one({"_id": ObjectId(user["id"])})
    if not verify_password(data.current_password, doc["password_hash"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    new_email = data.new_email.lower()
    if new_email == doc.get("email"):
        raise HTTPException(status_code=400, detail="That is already your email")
    if await db.users.find_one({"email": new_email}):
        raise HTTPException(status_code=400, detail="That email is already in use")
    raw = await _issue_token(str(doc["_id"]), "change_email", new_email=new_email, ttl_hours=24)
    link = _verify_url("/verify", raw)
    logger.warning("[EMAIL CHANGE VERIFY LINK] %s -> %s", new_email, link)
    _lang = (doc.get("settings") or {}).get("language", "en")
    send_email(new_email, email_subject("change", _lang),
               f"Confirm this new email for your Firebird AI account (valid 24h):\n\n{link}",
               html=email_html("Confirm your new email",
                               ["Confirm this address to finish changing your Firebird AI email.",
                                "This link is valid for 24 hours."],
                               cta_text="Confirm Email", cta_url=link))
    return {"ok": True, "message": "Verification link sent to the new email. Confirm it to complete the change."}


@auth_router.get("/dev-verify-link")
async def dev_verify_link(email: str, admin: dict = Depends(get_current_user)):
    """DEV FALLBACK (admin only): confirms an active email-verification token exists.
    Raw link is in backend.out.log ('[EMAIL VERIFY LINK]' / '[EMAIL CHANGE VERIFY LINK]')."""
    if admin.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    u = await db.users.find_one({"$or": [{"email": email.lower()}, {"username": email.lower()}]})
    if not u:
        raise HTTPException(status_code=404, detail="No such account")
    rec = await db.verification_tokens.find_one(
        {"user_id": str(u["_id"]), "used": False}, sort=[("created_at", -1)])
    if not rec:
        raise HTTPException(status_code=404, detail="No active verification token")
    return {"note": "Raw link is in backend logs.", "user": u.get("username"),
            "kind": rec.get("kind"), "created_at": rec["created_at"]}


class ForgotPasswordInput(BaseModel):
    identifier: str  # email OR username


@auth_router.post("/forgot-password")
async def forgot_password(data: ForgotPasswordInput, request: Request):
    ident = data.identifier.strip().lower()
    user = await db.users.find_one({"$or": [{"email": ident}, {"username": ident}]})
    neutral = {"ok": True, "message": "If the account exists, a reset link has been sent."}
    if not user:
        return neutral
    now = datetime.now(timezone.utc)
    # rate limit: max 3 requests per user per 15 min
    recent = await db.password_reset_tokens.count_documents({
        "user_id": str(user["_id"]),
        "created_at": {"$gte": (now - timedelta(minutes=15)).isoformat()},
    })
    if recent >= 3:
        raise HTTPException(status_code=429, detail="Too many reset requests. Please try again later.")
    raw = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw.encode()).hexdigest()
    await db.password_reset_tokens.insert_one({
        "user_id": str(user["_id"]),
        "token_hash": token_hash,
        "used": False,
        "created_at": now.isoformat(),
        "expires_at": now + timedelta(minutes=15),
    })
    frontend = os.environ.get("FRONTEND_URL", "").rstrip("/")
    link = f"{frontend}/reset-password?token={raw}"
    logger.warning("[PASSWORD RESET LINK] %s -> %s", user["email"], link)
    _lang = (user.get("settings") or {}).get("language", "en")
    send_email(user["email"], email_subject("reset", _lang),
               f"Reset your password using this link (valid 15 minutes):\n\n{link}\n\nIf you did not request this, ignore this email.",
               html=email_html("Reset your password",
                               ["Use the button below to reset your Firebird AI password.",
                                "This link is valid for 15 minutes. If you didn't request it, ignore this email."],
                               cta_text="Reset Password", cta_url=link))
    return neutral


class ResetPasswordInput(BaseModel):
    token: str
    password: str
    confirm_password: str


@auth_router.post("/reset-password")
async def reset_password(data: ResetPasswordInput):
    if data.password != data.confirm_password:
        raise HTTPException(status_code=400, detail="Passwords do not match")
    _validate_new_password(data.password)
    token_hash = hashlib.sha256(data.token.encode()).hexdigest()
    rec = await db.password_reset_tokens.find_one({"token_hash": token_hash, "used": False})
    if not rec:
        raise HTTPException(status_code=400, detail="Invalid or expired reset link")
    expires = rec["expires_at"]
    if isinstance(expires, str):
        expires = datetime.fromisoformat(expires)
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Reset link has expired")
    await db.users.update_one({"_id": ObjectId(rec["user_id"])},
                              {"$set": {"password_hash": hash_password(data.password)},
                               "$inc": {"session_version": 1}})
    await db.password_reset_tokens.update_one({"_id": rec["_id"]}, {"$set": {"used": True}})
    return {"ok": True, "message": "Password updated. Please sign in with your new password."}


@auth_router.get("/dev-reset-link")
async def dev_reset_link(email: str, admin: dict = Depends(get_current_user)):
    """DEV FALLBACK (admin only): confirms the active reset token for an account
    while no email provider is configured. The raw link is in backend.out.log."""
    if admin.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    user = await db.users.find_one({"$or": [{"email": email.lower()}, {"username": email.lower()}]})
    if not user:
        raise HTTPException(status_code=404, detail="No such account")
    rec = await db.password_reset_tokens.find_one(
        {"user_id": str(user["_id"]), "used": False}, sort=[("created_at", -1)])
    if not rec:
        raise HTTPException(status_code=404, detail="No active reset token — call /forgot-password first")
    return {"note": "Raw token only appears in backend logs. Search backend.out.log for '[PASSWORD RESET LINK]'.",
            "user": user.get("username"), "created_at": rec["created_at"]}


async def ensure_auth_setup():
    """Create auth indexes + backfill username/session_version for existing users."""
    try:
        await db.users.create_index("username", unique=True, sparse=True)
        await db.password_reset_tokens.create_index("expires_at", expireAfterSeconds=0)
        await db.verification_tokens.create_index("expires_at", expireAfterSeconds=0)
    except Exception as e:
        logger.error("auth index setup: %s", e)
    async for u in db.users.find({"$or": [{"username": {"$exists": False}}, {"username": None}]}):
        uname = await _generate_username(u.get("email", "trader"))
        await db.users.update_one({"_id": u["_id"]},
                                  {"$set": {"username": uname, "session_version": u.get("session_version", 1)}})
    await db.users.update_many({"session_version": {"$exists": False}}, {"$set": {"session_version": 1}})
    # Migration: existing accounts are considered already verified (don't lock them out)
    await db.users.update_many({"email_verified": {"$exists": False}}, {"$set": {"email_verified": True}})


async def seed_admin():
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@firebird.ai").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing = await db.users.find_one({"email": admin_email})
    if existing is None:
        username = "admin" if not await db.users.find_one({"username": "admin"}) else None
        doc = await _new_user_doc(admin_email, admin_password, "Owner", role="admin", username=username, email_verified=True)
        await db.users.insert_one(doc)
    else:
        updates = {}
        if not verify_password(admin_password, existing["password_hash"]):
            updates["password_hash"] = hash_password(admin_password)
        if not existing.get("username"):
            updates["username"] = "admin" if not await db.users.find_one({"username": "admin"}) else await _generate_username(admin_email)
        if not existing.get("email_verified"):
            updates["email_verified"] = True
        if updates:
            await db.users.update_one({"email": admin_email}, {"$set": updates})
    await ensure_auth_setup()
