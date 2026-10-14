import os
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
    """Encryption at rest uses a dedicated data key (DATA_ENCRYPTION_KEY),
    kept separate from JWT_SECRET so a session-secret leak cannot decrypt keys."""
    key = os.environ.get("DATA_ENCRYPTION_KEY")
    if not key:
        raise RuntimeError("DATA_ENCRYPTION_KEY is not configured")
    return Fernet(key.encode())


def _legacy_fernet() -> Fernet:
    """Decrypt secrets written before the dedicated key existed (JWT_SECRET-derived)."""
    raw = hashlib.sha256(get_jwt_secret().encode()).digest()
    return Fernet(base64.urlsafe_b64encode(raw))


def _encrypt(plain: str) -> str:
    return _fernet().encrypt(plain.encode()).decode() if plain else ""


def _decrypt(token: str) -> str:
    if not token:
        return ""
    try:
        return _fernet().decrypt(token.encode()).decode()
    except Exception:
        try:
            return _legacy_fernet().decrypt(token.encode()).decode()
        except Exception:
            return ""


def _mask(secret: str) -> str:
    if not secret:
        return ""
    if len(secret) <= 8:
        return "****"
    return f"{secret[:4]}****{secret[-4:]}"


def _oid(value: str) -> ObjectId:
    try:
        return ObjectId(value)
    except Exception:
        raise HTTPException(status_code=404, detail="Connection not found")


def _conn_api_key(d: dict) -> str:
    """Read the stored API key: prefer encrypted field, fall back to legacy plaintext."""
    if d.get("api_key_enc"):
        return _decrypt(d["api_key_enc"])
    return d.get("api_key", "")


def _now():
    return datetime.now(timezone.utc).isoformat()


async def _verify(exchange: str, api_key: str, secret: str, passphrase: str = "") -> dict:
    adapter = build_adapter(exchange, api_key, secret, passphrase)
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
    api_passphrase: str = ""


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
            "api_key_masked": d.get("api_key_masked") or _mask(d.get("api_key", "")),
            "verified": d.get("verified", False),
            "read_only": d.get("read_only", None),
            "read_only_source": d.get("read_only_source", "no_keys"),
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
    api_key = data.api_key.strip()
    secret = data.api_secret.strip()
    passphrase = data.api_passphrase.strip()
    result = await _verify(ex, api_key, secret, passphrase)

    # Enforce READ-ONLY: refuse keys that can trade or withdraw (where detectable).
    read_only = None
    ro_source = "no_keys"
    if api_key and result["ok"]:
        adapter = build_adapter(ex, api_key, secret, passphrase)
        perms = await adapter.probe_permissions() if hasattr(adapter, "probe_permissions") else {"can_trade": None, "can_withdraw": None, "source": "unknown"}
        if perms.get("can_trade") or perms.get("can_withdraw"):
            raise HTTPException(
                status_code=400,
                detail="This API key has trade/withdraw permissions. Create a READ-ONLY key (disable Trade and Withdraw).",
            )
        ro_source = perms.get("source", "unknown")
        read_only = perms.get("can_trade") is False and perms.get("can_withdraw") is False

    doc = {
        "user_id": user["id"], "exchange": ex,
        "api_key_enc": _encrypt(api_key),
        "api_key_masked": _mask(api_key),
        "secret_enc": _encrypt(secret),
        "passphrase_enc": _encrypt(passphrase),
        "verified": result["ok"], "status_message": result["message"],
        "read_only": read_only, "read_only_source": ro_source,
        "last_balances": result["balances"], "live_trading": False,
        "created_at": _now(), "updated_at": _now(),
    }
    existing = await db.exchange_connections.find_one({"user_id": user["id"], "exchange": ex})
    if existing:
        # drop any legacy plaintext key on update
        await db.exchange_connections.update_one({"_id": existing["_id"]},
                                                 {"$set": doc, "$unset": {"api_key": ""}})
        cid = str(existing["_id"])
    else:
        res = await db.exchange_connections.insert_one(doc)
        cid = str(res.inserted_id)
    return {"id": cid, "verified": result["ok"], "message": result["message"],
            "read_only": read_only, "balances": result["balances"]}


@exchanges_router.post("/{connection_id}/test")
async def test_connection(connection_id: str, user: dict = Depends(get_current_user)):
    d = await db.exchange_connections.find_one({"_id": _oid(connection_id), "user_id": user["id"]})
    if not d:
        raise HTTPException(status_code=404, detail="Connection not found")
    secret = _decrypt(d["secret_enc"]) if d.get("secret_enc") else ""
    passphrase = _decrypt(d["passphrase_enc"]) if d.get("passphrase_enc") else ""
    result = await _verify(d["exchange"], _conn_api_key(d), secret, passphrase)
    await db.exchange_connections.update_one({"_id": d["_id"]},
        {"$set": {"verified": result["ok"], "status_message": result["message"],
                  "last_balances": result["balances"], "updated_at": _now()}})
    return result


@exchanges_router.post("/{connection_id}/live")
async def toggle_live(connection_id: str, data: LiveToggleInput, user: dict = Depends(get_current_user)):
    d = await db.exchange_connections.find_one({"_id": _oid(connection_id), "user_id": user["id"]})
    if not d:
        raise HTTPException(status_code=404, detail="Connection not found")
    if data.live_trading and not d.get("verified"):
        raise HTTPException(status_code=400, detail="Verify the connection before enabling live trading")
    await db.exchange_connections.update_one({"_id": d["_id"]},
        {"$set": {"live_trading": data.live_trading, "updated_at": _now()}})
    return {"live_trading": data.live_trading}


@exchanges_router.delete("/{connection_id}")
async def delete_connection(connection_id: str, user: dict = Depends(get_current_user)):
    res = await db.exchange_connections.delete_one({"_id": _oid(connection_id), "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Connection not found")
    return {"deleted": True}


def _manager_conns(docs):
    conns = []
    for d in docs:
        secret = _decrypt(d["secret_enc"]) if d.get("secret_enc") else ""
        passphrase = _decrypt(d["passphrase_enc"]) if d.get("passphrase_enc") else ""
        conns.append({"exchange": d["exchange"], "api_key": _conn_api_key(d), "secret": secret, "passphrase": passphrase})
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
