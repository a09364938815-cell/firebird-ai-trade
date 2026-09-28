import os
import time
import base64
import hashlib
import hmac
import random
import string
from datetime import datetime, timezone

import httpx
from bson import ObjectId
from cryptography.fernet import Fernet
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from db import db
from auth import get_current_user, get_jwt_secret

exchanges_router = APIRouter(prefix="/api/exchanges", tags=["exchanges"])

SUPPORTED = {
    "lbank": {"name": "LBank", "base": os.environ.get("LBANK_BASE_URL", "https://api.lbkex.com")},
    "binance": {"name": "Binance", "base": "https://api.binance.com"},
    "kraken": {"name": "Kraken", "base": "https://api.kraken.com"},
    "okx": {"name": "OKX", "base": "https://www.okx.com"},
    "bybit": {"name": "Bybit", "base": "https://api.bybit.com"},
}

REAL_TRADING_ENABLED = os.environ.get("REAL_TRADING_ENABLED", "false").lower() == "true"


def _fernet() -> Fernet:
    raw = hashlib.sha256(get_jwt_secret().encode()).digest()
    return Fernet(base64.urlsafe_b64encode(raw))


def _encrypt(plain: str) -> str:
    return _fernet().encrypt(plain.encode()).decode()


def _decrypt(token: str) -> str:
    return _fernet().decrypt(token.encode()).decode()


def _mask(secret: str) -> str:
    if not secret:
        return ""
    if len(secret) <= 8:
        return "****"
    return f"{secret[:4]}****{secret[-4:]}"


def _now():
    return datetime.now(timezone.utc).isoformat()


# ---------------- LBank signed client ----------------
async def _lbank_verify(base: str, api_key: str, secret: str) -> dict:
    """Best-effort signed account request to LBank v2. Returns {ok, message, balances}."""
    echostr = "".join(random.choices(string.ascii_letters + string.digits, k=35))
    ts = str(int(time.time() * 1000))
    params = {
        "api_key": api_key,
        "echostr": echostr,
        "signature_method": "HmacSHA256",
        "timestamp": ts,
    }
    prep = "&".join(f"{k}={params[k]}" for k in sorted(params))
    md5_digest = hashlib.md5(prep.encode()).hexdigest().upper()
    sign = hmac.new(secret.encode(), md5_digest.encode(), hashlib.sha256).hexdigest()
    payload = {**params, "sign": sign}
    url = f"{base.rstrip('/')}/v2/supplement/user_info.do"
    try:
        async with httpx.AsyncClient(timeout=8.0) as c:
            r = await c.post(url, data=payload)
            data = r.json()
    except Exception as e:
        return {"ok": False, "message": f"Network error reaching LBank: {e}", "balances": []}
    if isinstance(data, dict) and data.get("result") in (True, "true"):
        balances = []
        info = data.get("data") or {}
        free = (info.get("free") or {}) if isinstance(info, dict) else {}
        for asset, amt in list(free.items())[:20]:
            try:
                if float(amt) > 0:
                    balances.append({"asset": asset.upper(), "amount": float(amt)})
            except Exception:
                pass
        return {"ok": True, "message": "Verified", "balances": balances}
    err = data.get("error_code") if isinstance(data, dict) else None
    return {"ok": False, "message": f"LBank rejected credentials (error_code={err})", "balances": []}


async def _verify_connection(exchange: str, base: str, api_key: str, secret: str) -> dict:
    if exchange == "lbank":
        return await _lbank_verify(base, api_key, secret)
    # For other exchanges we only do a reachability ping; live order routing not implemented.
    try:
        async with httpx.AsyncClient(timeout=6.0) as c:
            await c.get(base)
        return {"ok": True, "message": "Stored (reachability only, live routing not enabled)", "balances": []}
    except Exception as e:
        return {"ok": False, "message": f"Could not reach {exchange}: {e}", "balances": []}


# ---------------- Schemas ----------------
class ConnectInput(BaseModel):
    exchange: str
    api_key: str
    api_secret: str


class LiveToggleInput(BaseModel):
    live_trading: bool


class OrderInput(BaseModel):
    connection_id: str
    symbol: str
    side: str  # BUY / SELL
    amount: float


# ---------------- Endpoints ----------------
@exchanges_router.get("/supported")
async def supported(user: dict = Depends(get_current_user)):
    return {
        "real_trading_enabled": REAL_TRADING_ENABLED,
        "exchanges": [{"id": k, "name": v["name"]} for k, v in SUPPORTED.items()],
    }


@exchanges_router.get("/list")
async def list_connections(user: dict = Depends(get_current_user)):
    docs = await db.exchange_connections.find({"user_id": user["id"]}).sort("created_at", -1).to_list(50)
    out = []
    for d in docs:
        out.append({
            "id": str(d["_id"]),
            "exchange": d["exchange"],
            "exchange_name": SUPPORTED.get(d["exchange"], {}).get("name", d["exchange"]),
            "api_key_masked": _mask(d.get("api_key", "")),
            "verified": d.get("verified", False),
            "status_message": d.get("status_message", ""),
            "live_trading": d.get("live_trading", False),
            "balances": d.get("last_balances", []),
            "created_at": d.get("created_at"),
        })
    return {"connections": out}


@exchanges_router.post("/connect")
async def connect(data: ConnectInput, user: dict = Depends(get_current_user)):
    ex = data.exchange.lower().strip()
    if ex not in SUPPORTED:
        raise HTTPException(status_code=400, detail=f"Unsupported exchange: {data.exchange}")
    if not data.api_key.strip() or not data.api_secret.strip():
        raise HTTPException(status_code=400, detail="API key and secret are required")

    base = SUPPORTED[ex]["base"]
    result = await _verify_connection(ex, base, data.api_key.strip(), data.api_secret.strip())

    doc = {
        "user_id": user["id"],
        "exchange": ex,
        "api_key": data.api_key.strip(),
        "secret_enc": _encrypt(data.api_secret.strip()),
        "verified": result["ok"],
        "status_message": result["message"],
        "last_balances": result["balances"],
        "live_trading": False,
        "created_at": _now(),
        "updated_at": _now(),
    }
    # upsert: one row per (user, exchange)
    existing = await db.exchange_connections.find_one({"user_id": user["id"], "exchange": ex})
    if existing:
        await db.exchange_connections.update_one({"_id": existing["_id"]}, {"$set": doc})
        cid = str(existing["_id"])
    else:
        res = await db.exchange_connections.insert_one(doc)
        cid = str(res.inserted_id)
    return {"id": cid, "verified": result["ok"], "message": result["message"], "balances": result["balances"]}


@exchanges_router.post("/{connection_id}/test")
async def test_connection(connection_id: str, user: dict = Depends(get_current_user)):
    d = await db.exchange_connections.find_one({"_id": ObjectId(connection_id), "user_id": user["id"]})
    if not d:
        raise HTTPException(status_code=404, detail="Connection not found")
    base = SUPPORTED[d["exchange"]]["base"]
    result = await _verify_connection(d["exchange"], base, d["api_key"], _decrypt(d["secret_enc"]))
    await db.exchange_connections.update_one(
        {"_id": d["_id"]},
        {"$set": {"verified": result["ok"], "status_message": result["message"],
                  "last_balances": result["balances"], "updated_at": _now()}},
    )
    return {"verified": result["ok"], "message": result["message"], "balances": result["balances"]}


@exchanges_router.post("/{connection_id}/live")
async def toggle_live(connection_id: str, data: LiveToggleInput, user: dict = Depends(get_current_user)):
    d = await db.exchange_connections.find_one({"_id": ObjectId(connection_id), "user_id": user["id"]})
    if not d:
        raise HTTPException(status_code=404, detail="Connection not found")
    if data.live_trading and not d.get("verified"):
        raise HTTPException(status_code=400, detail="Verify the connection before enabling live trading")
    if data.live_trading and not REAL_TRADING_ENABLED:
        raise HTTPException(status_code=400, detail="Real trading is disabled on this server. Contact the owner to enable it.")
    await db.exchange_connections.update_one(
        {"_id": d["_id"]}, {"$set": {"live_trading": data.live_trading, "updated_at": _now()}})
    return {"live_trading": data.live_trading}


@exchanges_router.delete("/{connection_id}")
async def delete_connection(connection_id: str, user: dict = Depends(get_current_user)):
    res = await db.exchange_connections.delete_one({"_id": ObjectId(connection_id), "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Connection not found")
    return {"deleted": True}


@exchanges_router.post("/order")
async def place_order(data: OrderInput, user: dict = Depends(get_current_user)):
    d = await db.exchange_connections.find_one({"_id": ObjectId(data.connection_id), "user_id": user["id"]})
    if not d:
        raise HTTPException(status_code=404, detail="Connection not found")
    if not REAL_TRADING_ENABLED or not d.get("live_trading"):
        raise HTTPException(status_code=403, detail="Live trading is not enabled for this connection")
    # Real order routing is only wired for verified connections. LBank order endpoint would go here.
    raise HTTPException(status_code=501, detail="Live order routing is pending exchange certification. Use demo trading meanwhile.")
