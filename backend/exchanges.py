import base64
import hashlib
from datetime import datetime, timezone

from bson import ObjectId
from cryptography.fernet import Fernet
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from db import db
from auth import get_current_user, get_jwt_secret
from exchange_adapters import SUPPORTED_EXCHANGES, build_adapter, ExchangeManager

exchanges_router = APIRouter(prefix="/api/exchanges", tags=["exchanges"])

SUPPORTED_IDS = {e["id"] for e in SUPPORTED_EXCHANGES}


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


async def _verify(exchange: str, api_key: str, secret: str) -> dict:
    adapter = build_adapter(exchange, api_key, secret)
    if not adapter:
        return {"ok": False, "message": "Unsupported exchange", "balances": []}
    try:
        price = await adapter.fetch_price("BTC")
        balances = await adapter.fetch_balances() if api_key else []
    except Exception as e:
        return {"ok": False, "message": f"Connection error: {e}", "balances": []}
    if price is None:
        return {"ok": False, "message": "Exchange unreachable from server", "balances": []}
    msg = "Verified (live balances loaded)" if balances else "Connected (public price OK; add keys for balances)"
    return {"ok": True, "message": msg, "balances": balances}


class ConnectInput(BaseModel):
    exchange: str
    api_key: str = ""
    api_secret: str = ""


class LiveToggleInput(BaseModel):
    live_trading: bool


@exchanges_router.get("/supported")
async def supported(user: dict = Depends(get_current_user)):
    return {"exchanges": SUPPORTED_EXCHANGES}


@exchanges_router.get("/list")
async def list_connections(user: dict = Depends(get_current_user)):
    docs = await db.exchange_connections.find({"user_id": user["id"]}).sort("created_at", -1).to_list(50)
    meta = {e["id"]: e for e in SUPPORTED_EXCHANGES}
    out = []
    for d in docs:
        m = meta.get(d["exchange"], {})
        out.append({
            "id": str(d["_id"]),
            "exchange": d["exchange"],
            "exchange_name": m.get("name", d["exchange"]),
            "kind": m.get("kind", "cex"),
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
    if ex not in SUPPORTED_IDS:
        raise HTTPException(status_code=400, detail=f"Unsupported exchange: {data.exchange}")
    result = await _verify(ex, data.api_key.strip(), data.api_secret.strip())
    doc = {
        "user_id": user["id"], "exchange": ex,
        "api_key": data.api_key.strip(),
        "secret_enc": _encrypt(data.api_secret.strip()) if data.api_secret.strip() else "",
        "verified": result["ok"], "status_message": result["message"],
        "last_balances": result["balances"], "live_trading": False,
        "created_at": _now(), "updated_at": _now(),
    }
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
    secret = _decrypt(d["secret_enc"]) if d.get("secret_enc") else ""
    result = await _verify(d["exchange"], d.get("api_key", ""), secret)
    await db.exchange_connections.update_one({"_id": d["_id"]},
        {"$set": {"verified": result["ok"], "status_message": result["message"],
                  "last_balances": result["balances"], "updated_at": _now()}})
    return result


@exchanges_router.post("/{connection_id}/live")
async def toggle_live(connection_id: str, data: LiveToggleInput, user: dict = Depends(get_current_user)):
    d = await db.exchange_connections.find_one({"_id": ObjectId(connection_id), "user_id": user["id"]})
    if not d:
        raise HTTPException(status_code=404, detail="Connection not found")
    if data.live_trading and not d.get("verified"):
        raise HTTPException(status_code=400, detail="Verify the connection before enabling live trading")
    await db.exchange_connections.update_one({"_id": d["_id"]},
        {"$set": {"live_trading": data.live_trading, "updated_at": _now()}})
    return {"live_trading": data.live_trading}


@exchanges_router.delete("/{connection_id}")
async def delete_connection(connection_id: str, user: dict = Depends(get_current_user)):
    res = await db.exchange_connections.delete_one({"_id": ObjectId(connection_id), "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Connection not found")
    return {"deleted": True}


def _manager_conns(docs):
    conns = []
    for d in docs:
        secret = ""
        if d.get("secret_enc"):
            try:
                secret = _decrypt(d["secret_enc"])
            except Exception:
                secret = ""
        conns.append({"exchange": d["exchange"], "api_key": d.get("api_key", ""), "secret": secret})
    return conns


@exchanges_router.get("/balances")
async def aggregated_balances(user: dict = Depends(get_current_user)):
    """Balances across ALL connected exchanges in one place."""
    docs = await db.exchange_connections.find({"user_id": user["id"]}).to_list(50)
    mgr = ExchangeManager(_manager_conns(docs))
    return {"accounts": await mgr.aggregate_balances()}


@exchanges_router.get("/prices")
async def aggregated_prices(symbols: str = "BTC,ETH,SOL", user: dict = Depends(get_current_user)):
    """Live prices for the same symbols across every connected exchange."""
    syms = [s.strip().upper() for s in symbols.split(",") if s.strip()][:8]
    docs = await db.exchange_connections.find({"user_id": user["id"]}).to_list(50)
    mgr = ExchangeManager(_manager_conns(docs))
    return {"symbols": syms, "exchanges": await mgr.aggregate_prices(syms)}
