import os
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr, Field

from db import db

JWT_ALGORITHM = "HS256"
ACCESS_MIN = 60 * 12
REFRESH_DAYS = 7


def get_jwt_secret() -> str:
    return os.environ["JWT_SECRET"]


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_MIN),
        "type": "access",
    }
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



def create_refresh_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=REFRESH_DAYS),
        "type": "refresh",
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


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
        return _clean_user(user)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


class RegisterInput(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str = Field(default="Trader")


class LoginInput(BaseModel):
    email: EmailStr
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


async def _new_user_doc(email: str, password: str, name: str, role: str = "user") -> dict:
    return {
        "email": email.lower(),
        "password_hash": hash_password(password),
        "name": name,
        "role": role,
        "settings": dict(DEFAULT_SETTINGS),
        "demo_balance": 100.0,
        "last_deposit_at": datetime.now(timezone.utc).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }


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
    doc = await _new_user_doc(email, data.password, data.name)
    res = await db.users.insert_one(doc)
    uid = str(res.inserted_id)
    access = create_access_token(uid, email)
    set_auth_cookies(response, access, create_refresh_token(uid))
    doc["_id"] = res.inserted_id
    result = _clean_user(doc)
    result["access_token"] = access
    return result


@auth_router.post("/login")
async def login(data: LoginInput, response: Response, request: Request):
    email = data.email.lower()
    fwd = request.headers.get("x-forwarded-for", "")
    ip = fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else "unknown")
    identifier = f"{ip}:{email}"
    attempt = await db.login_attempts.find_one({"identifier": identifier})
    now = datetime.now(timezone.utc)
    if attempt and attempt.get("locked_until"):
        locked_until = datetime.fromisoformat(attempt["locked_until"])
        if locked_until > now:
            raise HTTPException(status_code=429, detail="Too many attempts. Try again later.")
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(data.password, user["password_hash"]):
        count = (attempt.get("count", 0) if attempt else 0) + 1
        update = {"count": count}
        if count >= 5:
            update["locked_until"] = (now + timedelta(minutes=15)).isoformat()
        await db.login_attempts.update_one({"identifier": identifier}, {"$set": update}, upsert=True)
        raise HTTPException(status_code=401, detail="Invalid email or password")
    await db.login_attempts.delete_one({"identifier": identifier})
    uid = str(user["_id"])
    access = create_access_token(uid, email)
    set_auth_cookies(response, access, create_refresh_token(uid))
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
        response.set_cookie("access_token", create_access_token(uid, user["email"]),
                            httponly=True, secure=True, samesite="lax",
                            max_age=ACCESS_MIN * 60, path="/")
        return {"ok": True}
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")


async def seed_admin():
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@firebird.ai").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing = await db.users.find_one({"email": admin_email})
    if existing is None:
        doc = await _new_user_doc(admin_email, admin_password, "Owner", role="admin")
        await db.users.insert_one(doc)
    elif not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one({"email": admin_email},
                                  {"$set": {"password_hash": hash_password(admin_password)}})
