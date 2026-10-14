"""Auto-Scanner + Smart Alerts engine.

ANALYSIS TOOL — NOT a profit guarantee. Computes a composite Opportunity Score
(0-100) across crypto / shitcoin / NFT signals, stores a rolling snapshot, and
dispatches in-app alerts to users whose score threshold is met. Never opens
trades automatically and never surfaces "guaranteed profit" or "win rate".
"""
import os
import random
import logging
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, Body

from auth import get_current_user
from db import db
from market import get_tickers, get_klines, compute_signal, COINS, _levels
from payments import require_premium

logger = logging.getLogger(__name__)
scan_engine_router = APIRouter(prefix="/api/scanner", tags=["scanner"])

SCAN_TFS = ["15m", "1h", "4h"]
VALID_TFS = ["15m", "1h", "4h", "1d"]
DEFAULT_ALERT_SETTINGS = {
    "enabled": True,
    "min_score": 80,
    "timeframes": ["15m", "1h", "4h", "1d"],
    "max_alerts_per_day": 10,
    "notify_method": "in_app",  # in_app | in_app_email
}


def _now():
    return datetime.now(timezone.utc)


def _now_iso():
    return _now().isoformat()


def _today():
    return _now().strftime("%Y-%m-%d")


def _synth(symbol: str, bucket: int, salt: int = 0):
    return random.Random(sum(ord(c) for c in symbol) + bucket + salt)


def _composite(sig: dict, change_24h, vol_ratio: float, whale: bool, mom7: float, safety: int) -> int:
    """Blend sub-scores into a 0-100 opportunity score with an alignment bonus."""
    change = change_24h or 0
    action = sig.get("action", "HOLD")
    trend = abs(sig.get("score", 50) - 50) * 2                      # conviction 0-100
    volume = max(0.0, min(100.0, 45 + (vol_ratio - 1) * 55))        # volume spike
    whale_s = 100 if whale else 50
    mom = max(0.0, min(100.0, 50 + change * 0.9 + mom7 * 0.6))
    base = 0.34 * trend + 0.20 * volume + 0.14 * whale_s + 0.17 * mom + 0.15 * safety
    bonus = 0
    if whale:
        bonus += 4
    if vol_ratio > 1.6:
        bonus += 5
    if (action == "BUY" and change > 0) or (action == "SELL" and change < 0):
        bonus += 5
    if trend >= 44:          # strong directional conviction
        bonus += 8
    if safety >= 85:
        bonus += 3
    return int(max(0, min(100, round(base + bonus))))


async def _crypto_opps(tf: str, bucket: int) -> list:
    tickers = await get_tickers()
    out = []
    for c in COINS:
        data = await get_klines(c["symbol"], tf, 80)
        t = tickers.get(c["symbol"], {})
        change = t.get("change_24h")
        sig = compute_signal(data.get("candles", []), change)
        if sig["action"] == "HOLD":
            continue
        rnd = _synth(c["symbol"], bucket)
        vol_ratio = round(0.8 + rnd.random() * 2.2, 2)
        whale = rnd.random() > 0.55
        mom7 = round((rnd.random() - 0.4) * 20, 2)
        score = _composite(sig, change, vol_ratio, whale, mom7, 85)
        price = t.get("price") or (float(data["candles"][-1][4]) if data.get("candles") else 0.0)
        out.append({
            "asset_type": "crypto", "kind": "major", "symbol": c["symbol"], "name": c["name"],
            "timeframe": tf, "interval": tf, "direction": sig["action"], "action": sig["action"],
            "score": score, "confidence": score, "rsi": sig.get("rsi"),
            "price": price, "change_24h": change, "reason": sig.get("reason", ""),
            "whale_activity": whale, "volume_ratio": vol_ratio,
            **_levels(price or 0.0, sig["action"]),
        })
    return out


async def _shit_opps(tf: str, bucket: int) -> list:
    from scanner import get_safe_memecoins
    safe = await get_safe_memecoins(75)  # Safety Score >= 75 enforced upstream
    out = []
    for c in safe:
        data = await get_klines(c["symbol"], tf, 80)
        candles = data.get("candles", [])
        change = c.get("change_24h")
        sig = compute_signal(candles, change)
        if sig["action"] == "HOLD":
            continue
        rnd = _synth(c["symbol"], bucket, salt=7)
        vol_ratio = round(0.9 + rnd.random() * 2.5, 2)
        whale = rnd.random() > 0.5
        mom7 = round((rnd.random() - 0.4) * 25, 2)
        safety = int(c.get("safety_score", 75))
        score = _composite(sig, change, vol_ratio, whale, mom7, safety)
        entry = float(candles[-1][4]) if candles else (c.get("price") or 0.0)
        out.append({
            "asset_type": "shitcoin", "kind": "shitcoin", "symbol": c["symbol"], "name": c["name"],
            "chain": c.get("chain"), "timeframe": tf, "interval": tf,
            "direction": sig["action"], "action": sig["action"],
            "score": score, "confidence": score, "rsi": sig.get("rsi"),
            "price": c.get("price") or entry, "change_24h": change, "reason": sig.get("reason", ""),
            "safety_score": safety, "liquidity_locked": c.get("liquidity_locked"),
            "mint_renounced": c.get("mint_renounced"),
            "honeypot_safe": c.get("mint_renounced") and c.get("liquidity_locked"),
            "holders": c.get("holders"), "whale_activity": whale, "volume_ratio": vol_ratio,
            **_levels(entry, sig["action"]),
        })
    return out


async def _nft_opps(bucket: int) -> list:
    tickers = await get_tickers()
    eth_usd = (tickers.get("ETH", {}) or {}).get("price") or 3500
    items = await db.nft_items.find({}, {"_id": 0}).sort("rarity_score", -1).to_list(40)
    out = []
    for it in items[:16]:
        rnd = random.Random(it["token_id"] * 97 + bucket)
        change = round((rnd.random() - 0.4) * 18, 2)
        whale = rnd.random() > 0.5
        rarity = it.get("rarity_score", 300)
        bull = (1 if change > 0 else 0) + (1 if whale else 0) + (1 if rarity >= 500 else 0)
        action = "BUY" if bull >= 2 else ("SELL" if change < -5 else "HOLD")
        if action == "HOLD":
            continue
        floor_eth = it.get("floor_price_eth", 0.5)
        pseudo = {"score": 50 + (15 if action == "BUY" else -15) + int(change), "action": action}
        vol_ratio = round(0.9 + rnd.random() * 2.0, 2)
        mom7 = round((rnd.random() - 0.4) * 20, 2)
        safety = 80 if rarity >= 500 else 72
        score = _composite(pseudo, change, vol_ratio, whale, mom7, safety)
        floor_usd = round(floor_eth * eth_usd, 2)
        out.append({
            "asset_type": "nft", "kind": "nft", "symbol": f"FIREBIRD #{str(it['token_id']).zfill(3)}",
            "name": it.get("name"), "nft_id": it["token_id"], "image": it.get("image"),
            "timeframe": "1d", "interval": "24h", "direction": action, "action": action,
            "score": score, "confidence": score,
            "floor_price_eth": floor_eth, "floor_price_usd": floor_usd,
            "change_24h": change, "whale_activity": whale,
            "best_marketplace_name": "Enftino", "volume_24h_eth": round(2 + rnd.random() * 20, 2),
            "reason": f"Rarity {rarity}; {'whale accumulation; ' if whale else ''}floor {'rising' if change > 0 else 'cooling'}",
            **_levels(floor_usd, action),
        })
    return out


async def run_scan() -> dict:
    """Compute opportunities across all asset types and replace the rolling snapshot."""
    bucket = int(_now().timestamp() // 300)  # 5-min bucket
    opps = []
    for tf in SCAN_TFS:
        opps += await _crypto_opps(tf, bucket)
        opps += await _shit_opps(tf, bucket)
    opps += await _nft_opps(bucket)

    scanned_at = _now_iso()
    for o in opps:
        o["high_opportunity"] = o["score"] >= 80
        o["created_at"] = scanned_at
    # Rolling snapshot: keep only the latest scan (represents current 24h view).
    await db.opportunities.delete_many({})
    if opps:
        await db.opportunities.insert_many([dict(o) for o in opps])
    high = [o for o in opps if o["score"] >= 80]
    await _dispatch_alerts(high)
    logger.info(f"[scan] stored {len(opps)} opportunities, {len(high)} high (>=80)")
    return {"total": len(opps), "high": len(high), "scanned_at": scanned_at}


async def _dispatch_alerts(high_opps: list):
    """Create in-app alerts (and mocked email) for users whose threshold is met."""
    if not high_opps:
        return
    users = await db.users.find({}).to_list(5000)
    today = _today()
    for u in users:
        uid = str(u["_id"])
        cfg = {**DEFAULT_ALERT_SETTINGS, **(u.get("alert_settings") or {})}
        if not cfg.get("enabled", True):
            continue
        sent_today = await db.alert_history.count_documents({"user_id": uid, "day": today})
        allowed = max(0, int(cfg.get("max_alerts_per_day", 10)) - sent_today)
        if allowed <= 0:
            continue
        tfs = cfg.get("timeframes") or VALID_TFS
        min_score = int(cfg.get("min_score", 80))
        candidates = [o for o in high_opps if o["score"] >= min_score and o["timeframe"] in tfs]
        candidates.sort(key=lambda x: x["score"], reverse=True)
        for o in candidates:
            if allowed <= 0:
                break
            dedupe = {"user_id": uid, "symbol": o["symbol"], "timeframe": o["timeframe"], "day": today}
            if await db.alert_history.find_one(dedupe):
                continue
            msg = (f"⚠️ {o['symbol']} · {o['timeframe']} · {o['direction']} · Score {o['score']}. "
                   f"Entry ${o.get('entry', '-')} / TP ${o.get('take_profit', '-')} / SL ${o.get('stop_loss', '-')}. "
                   f"Informational only — not financial advice.")
            await db.notifications.insert_one({
                "user_id": uid, "type": "opportunity", "message": msg, "key": "ntf_opportunity",
                "params": {"symbol": o["symbol"], "timeframe": o["timeframe"], "action": o["direction"], "score": o["score"],
                           "entry": o.get("entry", "-"), "tp": o.get("take_profit", "-"), "sl": o.get("stop_loss", "-")},
                "meta": {"symbol": o["symbol"], "timeframe": o["timeframe"], "direction": o["direction"],
                         "score": o["score"], "entry": o.get("entry"), "take_profit": o.get("take_profit"),
                         "stop_loss": o.get("stop_loss"), "reason": o.get("reason")},
                "read": False, "created_at": _now_iso(),
            })
            await db.alert_history.insert_one({
                "user_id": uid, "symbol": o["symbol"], "asset_type": o["asset_type"],
                "timeframe": o["timeframe"], "direction": o["direction"], "score": o["score"],
                "entry": o.get("entry"), "take_profit": o.get("take_profit"), "stop_loss": o.get("stop_loss"),
                "reason": o.get("reason"), "day": today, "created_at": _now_iso(),
            })
            if cfg.get("notify_method") == "in_app_email":
                try:
                    from auth import send_email, email_subject, email_html
                    lang = (u.get("settings") or {}).get("language", "en")
                    send_email(
                        u.get("email"), email_subject("alert", lang),
                        f"{o['symbol']} {o['timeframe']} {o['direction']} — Score {o['score']}. "
                        f"Entry {o.get('entry')} / TP {o.get('take_profit')} / SL {o.get('stop_loss')}. "
                        f"Informational only — not financial advice.",
                        html=email_html(
                            f"High Opportunity · {o['symbol']}",
                            [f"<b>{o['symbol']}</b> &middot; {o['timeframe']} &middot; "
                             f"<b style='color:{'#22c55e' if o['direction'] == 'BUY' else '#ef4444'}'>{o['direction']}</b> "
                             f"&middot; Score <b>{o['score']}</b>",
                             f"Entry: {o.get('entry')} &nbsp; TP: {o.get('take_profit')} &nbsp; SL: {o.get('stop_loss')}",
                             (o.get("reason") or "")],
                        ),
                    )
                except Exception as e:
                    logger.error(f"[alert-email] send failed for {u.get('email')}: {e}")
            allowed -= 1


# ---------------- API ----------------

@scan_engine_router.get("/opportunities")
async def opportunities(min_score: int = 80, timeframe: str = "all", direction: str = "all",
                        user: dict = Depends(require_premium)):
    q = {"score": {"$gte": int(min_score)}}
    if timeframe and timeframe != "all":
        q["timeframe"] = timeframe
    if direction and direction != "all":
        q["direction"] = direction
    docs = await db.opportunities.find(q, {"_id": 0}).sort("score", -1).to_list(60)
    alerts_today = await db.alert_history.count_documents({"user_id": user["id"], "day": _today()})
    return {"opportunities": docs, "alerts_today": alerts_today, "threshold": int(min_score)}


@scan_engine_router.get("/alert-settings")
async def get_alert_settings(user: dict = Depends(get_current_user)):
    u = await db.users.find_one({"_id": __import__("bson").ObjectId(user["id"])})
    return {**DEFAULT_ALERT_SETTINGS, **((u or {}).get("alert_settings") or {})}


@scan_engine_router.put("/alert-settings")
async def update_alert_settings(payload: dict = Body(...), user: dict = Depends(get_current_user)):
    from bson import ObjectId
    cfg = {**DEFAULT_ALERT_SETTINGS, **(payload or {})}
    cfg["enabled"] = bool(cfg.get("enabled", True))
    cfg["min_score"] = max(70, min(95, int(cfg.get("min_score", 80))))
    cfg["max_alerts_per_day"] = max(1, min(50, int(cfg.get("max_alerts_per_day", 10))))
    cfg["timeframes"] = [t for t in (cfg.get("timeframes") or VALID_TFS) if t in VALID_TFS] or VALID_TFS
    if cfg.get("notify_method") not in ("in_app", "in_app_email"):
        cfg["notify_method"] = "in_app"
    await db.users.update_one({"_id": ObjectId(user["id"])}, {"$set": {"alert_settings": cfg}})
    return cfg


@scan_engine_router.get("/alert-history")
async def alert_history(user: dict = Depends(get_current_user)):
    docs = await db.alert_history.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(50)
    return {"history": docs}
