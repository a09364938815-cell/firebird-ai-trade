from datetime import datetime, timezone, timedelta
import os
import json
import asyncio

import numpy as np
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request, Body
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from db import db
from auth import get_current_user
from payments import require_premium
from market import INTERVAL_MAP, MIN_STOP_LOSS_PCT, get_tickers, get_klines, compute_signal, COINS, get_price
from scanner import get_safe_memecoins

trading_router = APIRouter(prefix="/api/trading", tags=["trading"])

# ---- Risk-management config (all values sourced from .env) ----
AUTO_MAX_LEVERAGE = float(os.environ.get("AUTO_MAX_LEVERAGE", 10))
AUTO_DEFAULT_LEVERAGE = float(os.environ.get("AUTO_DEFAULT_LEVERAGE", 2))
MAX_CONCURRENT_TRADES = int(os.environ.get("MAX_CONCURRENT_TRADES", 2))
MAX_DRAWDOWN_PCT = float(os.environ.get("MAX_DRAWDOWN_PCT", 20))
MAX_CONSECUTIVE_LOSSES = int(os.environ.get("MAX_CONSECUTIVE_LOSSES", 5))
MIN_SAFETY_SCORE = int(os.environ.get("MIN_SAFETY_SCORE", 75))
AUTO_MIN_SCORE = float(os.environ.get("AUTO_MIN_SCORE", 62))
AUTO_TIMEFRAMES = [tf.strip() for tf in os.environ.get("AUTO_TIMEFRAMES", "1m,5m,15m,1h,4h,1d").split(",") if tf.strip()]

# ---- Strategy-quality guards (reduce choppy / downtrend losing entries) ----
# Stricter conviction for AUTO entries than the display threshold (AUTO_MIN_SCORE).
AUTO_ENTRY_MIN_SCORE = float(os.environ.get("AUTO_ENTRY_MIN_SCORE", 70))
# Only enter on these (>=15m) timeframes — 1m/5m are noise and cause whipsaw losses.
AUTO_QUALITY_TFS = [tf for tf in AUTO_TIMEFRAMES if tf in ("15m", "1h", "4h", "1d")] or ["15m", "1h", "4h"]
# Avoid buying overbought tops.
AUTO_MAX_ENTRY_RSI = float(os.environ.get("AUTO_MAX_ENTRY_RSI", 68))
# Cooldown: after this many consecutive losses, pause NEW entries for N minutes.
AUTO_COOLDOWN_LOSSES = int(os.environ.get("AUTO_COOLDOWN_LOSSES", 2))
AUTO_COOLDOWN_MINUTES = int(os.environ.get("AUTO_COOLDOWN_MINUTES", 30))


def _ai_leverage(score: float) -> float:
    """Firebird Core decides leverage from signal conviction.
    Starts at the default (2-3x) and scales up to the hard cap based on score.
    Never exceeds AUTO_MAX_LEVERAGE."""
    span = max(1.0, 100.0 - AUTO_MIN_SCORE)
    conviction = max(0.0, min(1.0, (score - AUTO_MIN_SCORE) / span))
    lev = AUTO_DEFAULT_LEVERAGE + conviction * (AUTO_MAX_LEVERAGE - AUTO_DEFAULT_LEVERAGE)
    return round(min(AUTO_MAX_LEVERAGE, max(AUTO_DEFAULT_LEVERAGE, lev)), 1)


# Manual-trade limits per coin tier: (default risk %, max risk %, max leverage)
MANUAL_TIERS = {"major": (3.0, 15.0, 25), "mid": (7.0, 20.0, 20), "meme": (10.0, 25.0, 10)}
MAJOR_COINS = {"BTC", "ETH", "BNB"}
MEME_COINS = {"DOGE", "SHIB", "PEPE", "WIF", "BONK", "FLOKI", "MEME", "BOME"}
HIGH_RISK_PCT = 15.0
EXTREME_LEVERAGE = 20


def coin_limits(symbol: str) -> dict:
    s = symbol.upper()
    tier = "major" if s in MAJOR_COINS else "meme" if s in MEME_COINS else \
        "mid" if s in {c["symbol"] for c in COINS} else "meme"
    d, mx, lev = MANUAL_TIERS[tier]
    return {"symbol": s, "tier": tier, "default_risk_pct": d, "min_risk_pct": 1.0, "max_risk_pct": mx,
            "max_leverage": lev, "high_risk_pct": HIGH_RISK_PCT, "extreme_leverage": EXTREME_LEVERAGE,
            "min_stop_loss_pct": MIN_STOP_LOSS_PCT}


class ManualTradeInput(BaseModel):
    symbol: str
    side: str  # BUY or SELL
    usd_amount: float
    leverage: float = 1.0
    risk_pct: float | None = None
    high_risk_ack: bool = False
    leverage_confirmed: bool = False
    take_profit_pct: float | None = None
    stop_loss_pct: float | None = None


class SettingsInput(BaseModel):
    demo_balance: float | None = None
    risk_lock: bool | None = None
    max_position_pct: float | None = None
    trailing_stop_pct: float | None = None
    take_profit_pct: float | None = None
    stop_loss_pct: float | None = None
    auto_trade: bool | None = None
    language: str | None = None
    auto_leverage: float | None = None
    manual_max_leverage: float | None = None
    max_concurrent_auto: int | None = None
    drawdown_halt_pct: float | None = None
    max_consecutive_losses: int | None = None


class WithdrawInput(BaseModel):
    amount: float


def _now():
    return datetime.now(timezone.utc).isoformat()


async def _get_user(uid: str):
    return await db.users.find_one({"_id": ObjectId(uid)})


async def _open_positions(uid: str):
    docs = await db.positions.find({"user_id": uid, "status": "open"}).to_list(200)
    for d in docs:
        d["id"] = str(d.pop("_id"))
    return docs


async def _portfolio_value(uid: str):
    user = await _get_user(uid)
    balance = user.get("demo_balance", 100.0)
    tickers = await get_tickers()
    positions = await _open_positions(uid)
    holdings_value = 0.0
    for p in positions:
        price = tickers.get(p["symbol"], {}).get("price", p["entry_price"])
        holdings_value += p["size"] * price
    return balance, holdings_value, positions, tickers


async def _account_equity(uid: str, tickers):
    """True account equity = cash + posted margin + unrealized PnL.
    (Not cash + leveraged notional, which would overstate equity and break drawdown.)"""
    user = await _get_user(uid)
    balance = user.get("demo_balance", 100.0)
    positions = await _open_positions(uid)
    equity = balance
    for p in positions:
        price = tickers.get(p["symbol"], {}).get("price", p["entry_price"])
        unreal = (price - p["entry_price"]) * p["size"] * (1 if p["side"] == "BUY" else -1)
        unreal = max(unreal, -p.get("usd_amount", 0))  # capped at margin (liquidation floor)
        equity += p.get("usd_amount", 0) + unreal
    return balance, round(equity, 4), positions


@trading_router.get("/portfolio")
async def portfolio(user: dict = Depends(get_current_user)):
    uid = user["id"]
    balance, holdings_value, positions, tickers = await _portfolio_value(uid)
    enriched = []
    unrealized = 0.0
    for p in positions:
        price = tickers.get(p["symbol"], {}).get("price", p["entry_price"])
        pnl = (price - p["entry_price"]) * p["size"] * (1 if p["side"] == "BUY" else -1)
        unrealized += pnl
        enriched.append({**p, "current_price": price, "pnl": round(pnl, 2),
                         "pnl_pct": round(pnl / (p["entry_price"] * p["size"]) * 100, 2) if p["size"] else 0})
    total = balance + holdings_value
    return {"cash": round(balance, 2), "holdings_value": round(holdings_value, 2),
            "total_value": round(total, 2), "unrealized_pnl": round(unrealized, 2),
            "positions": enriched}


async def _open_position(uid: str, symbol: str, side: str, usd: float, tickers, settings, source="manual", leverage=1.0, tp_pct=None, sl_pct=None):
    user = await _get_user(uid)
    balance = user.get("demo_balance", 100.0)
    if usd <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    if usd > balance:
        raise HTTPException(status_code=400, detail="Insufficient demo balance")
    max_pct = settings.get("max_position_pct", 25.0)
    if settings.get("risk_lock", True) and usd > balance * max_pct / 100 + 1e-6:
        raise HTTPException(status_code=400,
                            detail=f"Risk lock: max {max_pct}% of balance per trade")
    price = tickers.get(symbol, {}).get("price")
    if not price:
        raise HTTPException(status_code=400, detail=f"No price available for {symbol}")
    leverage = max(1.0, float(leverage))
    notional = usd * leverage
    size = notional / price
    sl = settings.get("stop_loss_pct", 4.0)
    tp = settings.get("take_profit_pct", 8.0)
    # Optional per-trade overrides (manual advanced order form). Clamp to safe bounds.
    if sl_pct is not None and float(sl_pct) > 0:
        sl = max(float(sl_pct), MIN_STOP_LOSS_PCT)
    if tp_pct is not None and float(tp_pct) > 0:
        tp = float(tp_pct)
    if source == "auto":
        # Rule 1 & 2: mandatory SL/TP with a strict 2:1 reward:risk ratio.
        if not sl or float(sl) <= 0:
            sl = MIN_STOP_LOSS_PCT
        sl = max(float(sl), MIN_STOP_LOSS_PCT)
        tp = round(sl * 2, 2)
        if sl <= 0 or tp <= 0:
            raise HTTPException(status_code=400, detail="Bot requires both Stop Loss and Take Profit")
    doc = {"user_id": uid, "symbol": symbol, "side": side, "size": size,
           "entry_price": price, "usd_amount": usd, "leverage": leverage, "notional": notional,
           "status": "open", "source": source,
           "take_profit_pct": tp, "stop_loss_pct": sl,
           "trailing_stop_pct": settings.get("trailing_stop_pct", 3.0),
           "peak_price": price, "opened_at": _now()}
    res = await db.positions.insert_one(doc)
    await db.users.update_one({"_id": ObjectId(uid)}, {"$inc": {"demo_balance": -usd}})
    doc["id"] = str(res.inserted_id)
    doc.pop("_id", None)
    return doc


OWNER_RATE = 0.02  # owner commission on profit
EARLY_WITHDRAWAL_FEE = 0.05
LOCK_DAYS = 7


async def _close_position(uid: str, position: dict, price: float, reason="manual"):
    entry = position["entry_price"]
    size = position["size"]
    side = position["side"]
    margin = position["usd_amount"]
    pnl_raw = (price - entry) * size * (1 if side == "BUY" else -1)
    pnl = max(pnl_raw, -margin)  # liquidation floor: can't lose more than margin
    commission = round(max(0.0, pnl) * OWNER_RATE, 4)
    proceeds = margin + pnl - commission
    await db.positions.update_one({"_id": ObjectId(position["id"])},
                                  {"$set": {"status": "closed", "exit_price": price,
                                            "pnl": round(pnl, 4), "owner_commission": commission,
                                            "closed_at": _now(), "close_reason": reason}})
    await db.users.update_one({"_id": ObjectId(uid)}, {"$inc": {"demo_balance": proceeds}})
    if pnl > 0:
        await db.users.update_one({"_id": ObjectId(uid)}, {"$set": {"consecutive_losses": 0}})
    else:
        await db.users.update_one({"_id": ObjectId(uid)}, {"$inc": {"consecutive_losses": 1}})
    if commission > 0:
        await db.owner_commissions.insert_one({
            "user_id": uid, "amount": commission, "symbol": position["symbol"],
            "kind": "trade_profit", "created_at": _now()})
    return round(pnl, 2)


@trading_router.get("/limits")
async def manual_limits(symbol: str, user: dict = Depends(get_current_user)):
    return coin_limits(symbol)


@trading_router.post("/manual")
async def manual_trade(data: ManualTradeInput, user: dict = Depends(get_current_user)):
    uid = user["id"]
    if not user.get("email_verified", True):
        raise HTTPException(status_code=403, detail="Please verify your email before opening trades.")
    symbol = data.symbol.upper()
    if not symbol:
        raise HTTPException(status_code=400, detail="Symbol is required")
    settings = user.get("settings", {})
    tickers = await get_tickers()
    # The coin search spans the whole Binance universe, but get_tickers() only
    # preloads the COINS majors — fetch a live price for any other symbol so the
    # paper engine can price the trade instead of failing with "no price".
    if not tickers.get(symbol, {}).get("price"):
        live = await get_price(symbol)
        if live:
            tickers[symbol] = {"price": live, "change_24h": 0.0, "volume": 0.0, "simulated": False}
    if data.side.upper() == "BUY":
        lim = coin_limits(symbol)
        lev = max(1.0, float(data.leverage or 1.0))
        if lev > lim["max_leverage"]:
            raise HTTPException(status_code=400, detail=f"Max leverage for {symbol} is {lim['max_leverage']}x")
        if lev > EXTREME_LEVERAGE and not data.leverage_confirmed:
            raise HTTPException(status_code=400, detail="Leverage above 20x requires double confirmation")
        risk = float(data.risk_pct if data.risk_pct is not None else lim["default_risk_pct"])
        if not (lim["min_risk_pct"] <= risk <= lim["max_risk_pct"]):
            raise HTTPException(status_code=400, detail=f"Risk for {symbol} must be between 1% and {lim['max_risk_pct']:g}%")
        if risk > HIGH_RISK_PCT and not data.high_risk_ack:
            raise HTTPException(status_code=400, detail="Risk above 15% requires High Risk confirmation")
        trade_settings = {**settings, "risk_lock": True, "max_position_pct": risk}
        pos = await _open_position(uid, symbol, "BUY", data.usd_amount, tickers, trade_settings, "manual", lev,
                                   tp_pct=data.take_profit_pct, sl_pct=data.stop_loss_pct)
        warning = "High liquidation risk" if lev > 10 else None
        return {"ok": True, "position": pos, "leverage": lev, "warning": warning}
    # SELL closes matching open BUY positions
    positions = await _open_positions(uid)
    matching = [p for p in positions if p["symbol"] == symbol and p["side"] == "BUY"]
    if not matching:
        raise HTTPException(status_code=400, detail="No open position to sell")
    price = tickers.get(symbol, {}).get("price")
    total_pnl = 0.0
    for p in matching:
        total_pnl += await _close_position(uid, p, price, "manual")
    return {"ok": True, "closed": len(matching), "pnl": round(total_pnl, 2)}


@trading_router.post("/positions/{position_id}/close")
async def close_one(position_id: str, user: dict = Depends(get_current_user)):
    uid = user["id"]
    try:
        oid = ObjectId(position_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Position not found")
    doc = await db.positions.find_one({"_id": oid, "user_id": uid, "status": "open"})
    if not doc:
        raise HTTPException(status_code=404, detail="Position not found")
    doc["id"] = str(doc["_id"])
    tickers = await get_tickers()
    price = tickers.get(doc["symbol"], {}).get("price", doc["entry_price"])
    pnl = await _close_position(uid, doc, price, "manual")
    return {"ok": True, "pnl": pnl}


# ---- NFT paper-trading (demo). Stored in db.nft_positions, kept separate from
# crypto positions so the risk engine / auto-trader logic is untouched. ----
class NftTradeInput(BaseModel):
    nft_id: int
    nft_name: str | None = None
    nft_image: str | None = None
    side: str = "BUY"
    usd_amount: float
    entry_floor_eth: float
    eth_usd: float | None = None


def _nft_current_floor(nft_id: int, entry_floor: float) -> float:
    """Deterministic pseudo-live floor that drifts in 5-min buckets (demo only)."""
    import random as _r
    import time as _t
    bucket = int(_t.time() // 300)
    rnd = _r.Random(int(nft_id) * 131 + bucket)
    drift = (rnd.random() - 0.45) * 0.12
    return round(max(0.0001, float(entry_floor) * (1 + drift)), 6)


def _nft_pnl(side: str, entry: float, current: float, usd: float) -> float:
    ratio = (current / entry) if entry else 1.0
    return usd * (ratio - 1) if side == "BUY" else usd * (1 - ratio)


@trading_router.post("/nft/open")
async def nft_open(data: NftTradeInput, user: dict = Depends(get_current_user)):
    uid = user["id"]
    if not user.get("email_verified", True):
        raise HTTPException(status_code=403, detail="Please verify your email before opening trades.")
    if data.usd_amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than 0")
    u = await _get_user(uid)
    balance = u.get("demo_balance", 100.0)
    if data.usd_amount > balance + 1e-9:
        raise HTTPException(status_code=400, detail="Amount exceeds your free balance")
    entry = max(0.0001, float(data.entry_floor_eth))
    qty = round(data.usd_amount / (entry * data.eth_usd), 6) if data.eth_usd else round(data.usd_amount / entry, 6)
    doc = {
        "user_id": uid, "type": "nft", "nft_id": data.nft_id,
        "nft_name": data.nft_name, "nft_image": data.nft_image,
        "side": data.side.upper(), "usd_amount": round(data.usd_amount, 2),
        "entry_floor_eth": entry, "eth_usd": data.eth_usd,
        "quantity": qty, "status": "open", "opened_at": _now(),
    }
    res = await db.nft_positions.insert_one(doc)
    await db.users.update_one({"_id": ObjectId(uid)}, {"$inc": {"demo_balance": -data.usd_amount}})
    nft_label = data.nft_name or ('#' + str(data.nft_id))
    await _notify(uid, "nft_open", f"NFT position opened (Demo): {nft_label}", key="ntf_nft_opened", params={"name": nft_label})
    doc.pop("_id", None)
    doc["id"] = str(res.inserted_id)
    return {"ok": True, "position": doc}


@trading_router.get("/nft/positions")
async def nft_positions(user: dict = Depends(get_current_user)):
    uid = user["id"]
    docs = await db.nft_positions.find({"user_id": uid, "status": "open"}).to_list(200)
    out = []
    for d in docs:
        entry = d["entry_floor_eth"]
        cur = _nft_current_floor(d["nft_id"], entry)
        pnl = _nft_pnl(d["side"], entry, cur, d["usd_amount"])
        out.append({
            "id": str(d["_id"]), "nft_id": d["nft_id"], "nft_name": d.get("nft_name"),
            "nft_image": d.get("nft_image"), "side": d["side"], "usd_amount": d["usd_amount"],
            "entry_floor_eth": entry, "current_floor_eth": cur, "eth_usd": d.get("eth_usd"),
            "pnl": round(pnl, 2), "opened_at": d.get("opened_at"),
        })
    return out


@trading_router.post("/nft/positions/{position_id}/close")
async def nft_close(position_id: str, user: dict = Depends(get_current_user)):
    uid = user["id"]
    try:
        oid = ObjectId(position_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Position not found")
    d = await db.nft_positions.find_one({"_id": oid, "user_id": uid, "status": "open"})
    if not d:
        raise HTTPException(status_code=404, detail="Position not found")
    entry = d["entry_floor_eth"]
    cur = _nft_current_floor(d["nft_id"], entry)
    pnl = _nft_pnl(d["side"], entry, cur, d["usd_amount"])
    proceeds = d["usd_amount"] + pnl
    await db.nft_positions.update_one({"_id": oid},
        {"$set": {"status": "closed", "closed_at": _now(), "exit_floor_eth": cur, "pnl": round(pnl, 2)}})
    await db.users.update_one({"_id": ObjectId(uid)}, {"$inc": {"demo_balance": proceeds}})
    await _notify(uid, "nft_close", f"NFT position closed (Demo): PnL ${round(pnl, 2)}",
                  key="ntf_nft_closed", params={"pnl": f"${round(pnl, 2)}"})
    return {"ok": True, "pnl": round(pnl, 2)}


@trading_router.get("/nft/history")
async def nft_history(user: dict = Depends(get_current_user)):
    uid = user["id"]
    docs = await db.nft_positions.find({"user_id": uid, "status": "closed"}).sort("closed_at", -1).to_list(300)
    wins = sum(1 for d in docs if (d.get("pnl") or 0) > 0)
    total_pnl = round(sum(d.get("pnl") or 0 for d in docs), 2)
    trades = [{
        "id": str(d["_id"]), "nft_name": d.get("nft_name"), "nft_image": d.get("nft_image"),
        "side": d.get("side"), "usd_amount": d.get("usd_amount"),
        "entry_floor_eth": d.get("entry_floor_eth"), "exit_floor_eth": d.get("exit_floor_eth"),
        "pnl": d.get("pnl"), "closed_at": d.get("closed_at"),
    } for d in docs]
    return {"total_trades": len(docs), "wins": wins, "losses": len(docs) - wins,
            "total_pnl": total_pnl, "trades": trades}


async def _apply_risk_management(uid: str, tickers):
    """Trailing stop / TP / SL evaluation on open positions."""
    positions = await _open_positions(uid)
    events = []
    for p in positions:
        price = tickers.get(p["symbol"], {}).get("price", p["entry_price"])
        entry = p["entry_price"]
        side = p["side"]
        margin = p.get("usd_amount", 0)
        unreal = (price - entry) * p["size"] * (1 if side == "BUY" else -1)
        if margin and unreal <= -margin:  # liquidation: margin wiped out
            pnl = await _close_position(uid, p, price, "liquidation")
            events.append({"symbol": p["symbol"], "reason": "liquidation", "pnl": pnl})
            continue
        peak = max(p.get("peak_price", entry), price)
        if peak != p.get("peak_price"):
            await db.positions.update_one({"_id": ObjectId(p["id"])}, {"$set": {"peak_price": peak}})
        change_pct = (price - entry) / entry * 100
        drop_from_peak = (peak - price) / peak * 100
        tp = p.get("take_profit_pct", 8.0)
        sl = p.get("stop_loss_pct", 4.0)
        trail = p.get("trailing_stop_pct", 3.0)
        if change_pct >= tp and drop_from_peak >= trail:
            pnl = await _close_position(uid, p, price, "trailing_take_profit")
            events.append({"symbol": p["symbol"], "reason": "trailing_take_profit", "pnl": pnl})
        elif change_pct <= -sl:
            pnl = await _close_position(uid, p, price, "stop_loss")
            events.append({"symbol": p["symbol"], "reason": "stop_loss", "pnl": pnl})
    return events


async def _notify(uid: str, ntype: str, message: str, meta: dict | None = None,
                  key: str | None = None, params: dict | None = None):
    """Create an in-app notification. `key` + `params` let the frontend render it in any language."""
    await db.notifications.insert_one({
        "user_id": uid, "type": ntype, "message": message, "key": key, "params": params or {},
        "meta": meta or {}, "read": False, "created_at": _now()})


async def _auto_cycle(uid: str):
    """One evaluation cycle of the rules-based auto-trader (demo). Reusable by the
    HTTP tick and the server-side cloud cron so the bot runs 24/7."""
    fresh = await _get_user(uid)
    settings = fresh.get("settings", {})
    tickers = await get_tickers()
    events = await _apply_risk_management(uid, tickers)
    for ev in events:  # notify SL/TP/liquidation closes
        await _notify(uid, "trade_closed",
                      f"{ev['reason']}: {ev['symbol']} closed · PnL ${ev['pnl']}",
                      {"symbol": ev["symbol"], "reason": ev["reason"], "pnl": ev["pnl"]},
                      key="ntf_trade_closed", params={"reason": ev["reason"], "symbol": ev["symbol"], "pnl": f"${ev['pnl']}"})

    balance, equity, positions = await _account_equity(uid, tickers)
    peak = max(fresh.get("peak_equity", equity), equity)
    dd = (peak - equity) / peak * 100 if peak > 0 else 0
    dd_limit = MAX_DRAWDOWN_PCT
    max_losses = MAX_CONSECUTIVE_LOSSES
    # Re-read the loss streak AFTER risk-management closes (they update it in DB);
    # fresh was loaded before those closes, so its counter is stale.
    cl = fresh.get("consecutive_losses", 0)
    had_loss_this_cycle = any(ev.get("pnl", 0) <= 0 for ev in events)
    if events:
        cl = (await _get_user(uid)).get("consecutive_losses", cl)
    updates = {"peak_equity": peak}
    halt = fresh.get("risk_halt", False)
    reason = fresh.get("halt_reason")

    if not halt and dd >= dd_limit:
        for p in await _open_positions(uid):
            pr = tickers.get(p["symbol"], {}).get("price", p["entry_price"])
            await _close_position(uid, p, pr, "drawdown_halt")
        halt = True
        reason = f"Max drawdown {dd:.0f}% reached the {dd_limit:.0f}% limit. All positions closed. Bot halted."
    elif not halt and cl >= max_losses:
        halt = True
        reason = f"{max_losses} consecutive losses. Bot halted. Confirm to resume."

    if halt:
        s = dict(settings)
        s["auto_trade"] = False
        updates.update({"risk_halt": True, "halt_reason": reason, "settings": s})
        await db.users.update_one({"_id": ObjectId(uid)}, {"$set": updates})
        hk = ("ntf_risk_drawdown", {"dd": f"{dd:.0f}", "limit": f"{dd_limit:.0f}"}) if reason.startswith("Max drawdown") \
            else ("ntf_risk_losses", {"count": cl})
        await _notify(uid, "risk_halt", reason, {"drawdown_pct": round(dd, 1)}, key=hk[0], params=hk[1])
        return {"closed": events, "opened": [], "halt": True, "halt_reason": reason,
                "equity": round(equity, 2), "drawdown_pct": round(dd, 1),
                "consecutive_losses": cl, "blocked_reason": None}

    # ---- Cooldown after a losing streak (below the hard halt) ----
    # Start/refresh a cooldown ONLY when a loss just occurred this cycle and the
    # streak reached the cooldown threshold. Time-based so it self-expires; it
    # never reactivates the bot — it only pauses NEW entries while running.
    now_dt = datetime.now(timezone.utc)
    cooldown_until_raw = fresh.get("auto_cooldown_until")
    if had_loss_this_cycle and AUTO_COOLDOWN_LOSSES <= cl < max_losses:
        cooldown_until_raw = (now_dt + timedelta(minutes=AUTO_COOLDOWN_MINUTES)).isoformat()
        updates["auto_cooldown_until"] = cooldown_until_raw
        await _notify(uid, "cooldown",
                      f"Cooling down after {cl} consecutive losses — new entries paused for {AUTO_COOLDOWN_MINUTES} min.",
                      {"consecutive_losses": cl, "minutes": AUTO_COOLDOWN_MINUTES},
                      key="ntf_cooldown", params={"count": cl, "minutes": AUTO_COOLDOWN_MINUTES})
    in_cooldown = False
    if cooldown_until_raw:
        try:
            cu = datetime.fromisoformat(cooldown_until_raw)
            if cu.tzinfo is None:
                cu = cu.replace(tzinfo=timezone.utc)
            in_cooldown = cu > now_dt
        except Exception:
            in_cooldown = False

    opened = []
    blocked_reason = None
    if in_cooldown:
        blocked_reason = f"Cooling down after {cl} consecutive losses. New entries paused for {AUTO_COOLDOWN_MINUTES} min."
    elif settings.get("auto_trade"):
        held = {p["symbol"] for p in positions}
        # Rule 4 & 5: max concurrent trades across ALL timeframes (hard cap from .env)
        max_conc = min(int(settings.get("max_concurrent_auto", MAX_CONCURRENT_TRADES)), MAX_CONCURRENT_TRADES)
        if len(positions) >= max_conc:
            blocked_reason = "Max concurrent trades reached."
        elif balance > 5:
            # Rule 6: candidates = majors + legitimate shitcoins (Safety Score >= threshold)
            candidates = list(COINS)
            try:
                safe_memes = await get_safe_memecoins(MIN_SAFETY_SCORE)
                for m in safe_memes:
                    tickers.setdefault(m["symbol"], {})["price"] = m["price"]
                    candidates.append({"symbol": m["symbol"], "name": m["name"]})
            except Exception:
                pass
            best = None  # (symbol, timeframe, sig)
            for c in candidates:
                if c["symbol"] in held:
                    continue
                if not tickers.get(c["symbol"], {}).get("price"):
                    continue
                # Higher-timeframe trend gate: never buy a coin whose 1h trend is
                # bearish (SMA9 <= SMA21). Avoids knife-catching in downtrends.
                htf = await get_klines(c["symbol"], "1h", 80)
                htf_sig = compute_signal(htf["candles"])
                if htf_sig.get("sma_fast", 0) <= htf_sig.get("sma_slow", 0):
                    continue
                for tf in AUTO_QUALITY_TFS:
                    d = await get_klines(c["symbol"], tf, 80)
                    sig = compute_signal(d["candles"])
                    # Stricter entry: strong BUY conviction + confirmed uptrend on the
                    # entry TF + not overbought. These filters cut choppy-market losses.
                    qualifies = (
                        sig["action"] == "BUY"
                        and sig["score"] >= AUTO_ENTRY_MIN_SCORE
                        and sig.get("sma_fast", 0) > sig.get("sma_slow", 0)
                        and sig.get("rsi", 50) < AUTO_MAX_ENTRY_RSI
                    )
                    if qualifies:
                        if best is None or sig["score"] > best[2]["score"]:
                            best = (c["symbol"], tf, sig)
                        break  # coin qualifies; move on to keep the scan light
                if best and best[2]["score"] >= 90:
                    break  # very strong entry found; stop scanning
            if best:
                lev = _ai_leverage(best[2]["score"])  # AI-decided, capped at AUTO_MAX_LEVERAGE
                usd = min(balance * settings.get("max_position_pct", 25.0) / 100, balance)
                if usd > 1:
                    await _open_position(uid, best[0], "BUY", round(usd, 2), tickers, settings, "auto", lev)
                    opened.append({"symbol": best[0], "timeframe": best[1],
                                   "score": best[2]["score"], "leverage": lev})
                    await _notify(uid, "trade_opened",
                                  f"Opened {best[0]} {best[1]} · score {best[2]['score']} · {lev}x",
                                  {"symbol": best[0], "timeframe": best[1], "leverage": lev},
                                  key="ntf_trade_opened",
                                  params={"symbol": best[0], "timeframe": best[1], "score": best[2]["score"], "leverage": f"{lev}x"})
    await db.users.update_one({"_id": ObjectId(uid)}, {"$set": updates})
    return {"closed": events, "opened": opened, "halt": False,
            "equity": round(equity, 2), "drawdown_pct": round(dd, 1),
            "consecutive_losses": cl, "blocked_reason": blocked_reason}


@trading_router.post("/auto/tick")
async def auto_tick(user: dict = Depends(require_premium)):
    """One evaluation cycle triggered by the client (demo only)."""
    return await _auto_cycle(user["id"])


@trading_router.get("/auto/status")
async def auto_status(user: dict = Depends(require_premium)):
    fresh = await _get_user(user["id"])
    tickers = await get_tickers()
    balance, equity, positions = await _account_equity(user["id"], tickers)
    peak = max(fresh.get("peak_equity", equity), equity)
    dd = (peak - equity) / peak * 100 if peak > 0 else 0
    halted = fresh.get("risk_halt", False)
    cd_raw = fresh.get("auto_cooldown_until")
    in_cooldown = False
    if cd_raw:
        try:
            cu = datetime.fromisoformat(cd_raw)
            if cu.tzinfo is None:
                cu = cu.replace(tzinfo=timezone.utc)
            in_cooldown = cu > datetime.now(timezone.utc)
        except Exception:
            in_cooldown = False
    return {
        "risk_halt": halted,
        "risk_mode": "Halted" if halted else "Active",
        "cloud_trading": fresh.get("cloud_trading", False),
        "cloud_status": ("halted" if halted else ("active" if fresh.get("cloud_trading") else "off")),
        "halt_reason": fresh.get("halt_reason"),
        "consecutive_losses": fresh.get("consecutive_losses", 0),
        "in_cooldown": in_cooldown,
        "cooldown_until": cd_raw if in_cooldown else None,
        "drawdown_pct": round(dd, 1),
        "open_positions": len(positions),
        "peak_equity": round(peak, 2),
        "equity": round(equity, 2),
        "limits": {
            "max_leverage": AUTO_MAX_LEVERAGE,
            "default_leverage": AUTO_DEFAULT_LEVERAGE,
            "max_concurrent": MAX_CONCURRENT_TRADES,
            "max_drawdown_pct": MAX_DRAWDOWN_PCT,
            "max_consecutive_losses": MAX_CONSECUTIVE_LOSSES,
            "min_safety_score": MIN_SAFETY_SCORE,
            "timeframes": AUTO_TIMEFRAMES,
            "entry_min_score": AUTO_ENTRY_MIN_SCORE,
            "entry_timeframes": AUTO_QUALITY_TFS,
            "cooldown_losses": AUTO_COOLDOWN_LOSSES,
            "cooldown_minutes": AUTO_COOLDOWN_MINUTES,
        },
    }


@trading_router.post("/cloud/enable")
async def cloud_enable(user: dict = Depends(require_premium)):
    """Turn on 24/7 server-side cloud trading. The platform cron drives it even
    when the user's device is offline."""
    uid = user["id"]
    if not user.get("email_verified", True):
        raise HTTPException(status_code=403, detail="Please verify your email before enabling auto-trade.")
    fresh = await _get_user(uid)
    s = dict(fresh.get("settings", {}))
    s["auto_trade"] = True
    await db.users.update_one({"_id": ObjectId(uid)},
                              {"$set": {"cloud_trading": True, "settings": s}})
    await _notify(uid, "cloud", "Cloud trading enabled — bot runs 24/7.", key="ntf_cloud_enabled")
    return {"ok": True, "cloud_trading": True}


@trading_router.post("/cloud/disable")
async def cloud_disable(user: dict = Depends(require_premium)):
    uid = user["id"]
    fresh = await _get_user(uid)
    s = dict(fresh.get("settings", {}))
    s["auto_trade"] = False
    await db.users.update_one({"_id": ObjectId(uid)},
                              {"$set": {"cloud_trading": False, "settings": s}})
    await _notify(uid, "cloud", "Cloud trading disabled.", key="ntf_cloud_disabled")
    return {"ok": True, "cloud_trading": False}


@trading_router.post("/stream-token")
async def stream_token(user: dict = Depends(get_current_user)):
    """Issue a short-lived, single-purpose token for the SSE stream (avoids putting
    the long-lived access JWT in the URL)."""
    from auth import create_stream_token
    return {"token": create_stream_token(user["id"])}


@trading_router.get("/stream")
async def stream(token: str = "", request: Request = None):
    """Server-Sent Events: pushes live status + portfolio to the client without
    polling. Authenticated with a short-lived scoped stream token (not the access JWT)."""
    from auth import decode_stream_sub
    uid = decode_stream_sub(token)
    if not uid:
        raise HTTPException(status_code=401, detail="Invalid token")

    async def event_gen():
        while True:
            if request and await request.is_disconnected():
                break
            try:
                fresh = await _get_user(uid)
                tickers = await get_tickers()
                balance, equity, positions = await _account_equity(uid, tickers)
                peak = max(fresh.get("peak_equity", equity), equity)
                dd = (peak - equity) / peak * 100 if peak > 0 else 0
                unread = await db.notifications.count_documents({"user_id": uid, "read": False})
                payload = {
                    "cloud_trading": fresh.get("cloud_trading", False),
                    "risk_halt": fresh.get("risk_halt", False),
                    "consecutive_losses": fresh.get("consecutive_losses", 0),
                    "drawdown_pct": round(dd, 1),
                    "equity": round(equity, 2),
                    "open_positions": len(positions),
                    "unread_notifications": unread,
                }
                yield f"data: {json.dumps(payload)}\n\n"
            except Exception as e:
                yield f"event: error\ndata: {json.dumps({'error': str(e)})}\n\n"
            await asyncio.sleep(5)

    return StreamingResponse(event_gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@trading_router.post("/auto/resume")
async def auto_resume(user: dict = Depends(require_premium)):
    """User re-authorizes the bot after a risk halt. Resets counters and re-seeds
    the drawdown peak to current equity so it doesn't immediately re-halt."""
    uid = user["id"]
    tickers = await get_tickers()
    _, equity, _ = await _account_equity(uid, tickers)
    await db.users.update_one({"_id": ObjectId(uid)},
                              {"$set": {"risk_halt": False, "halt_reason": None,
                                        "consecutive_losses": 0, "peak_equity": round(equity, 2),
                                        "auto_cooldown_until": None}})
    return {"ok": True}


@trading_router.get("/reports")
async def reports(user: dict = Depends(get_current_user)):
    uid = user["id"]
    closed = await db.positions.find({"user_id": uid, "status": "closed"}).sort("closed_at", -1).to_list(500)
    trades = []
    wins = 0
    total_pnl = 0.0
    for d in closed:
        pnl = d.get("pnl", 0)
        total_pnl += pnl
        if pnl > 0:
            wins += 1
        trades.append({"id": str(d["_id"]), "symbol": d["symbol"], "side": d["side"],
                       "entry_price": d["entry_price"], "exit_price": d.get("exit_price"),
                       "pnl": round(pnl, 2), "reason": d.get("close_reason"),
                       "closed_at": d.get("closed_at"), "source": d.get("source")})
    n = len(trades)
    return {"total_trades": n, "win_rate": round(wins / n * 100, 1) if n else 0,
            "total_pnl": round(total_pnl, 2), "wins": wins, "losses": n - wins,
            "trades": trades}


@trading_router.get("/settings")
async def get_settings(user: dict = Depends(get_current_user)):
    fresh = await _get_user(user["id"])
    return {"settings": fresh.get("settings", {}), "demo_balance": fresh.get("demo_balance", 100.0)}


@trading_router.put("/settings")
async def update_settings(data: SettingsInput, user: dict = Depends(get_current_user)):
    uid = user["id"]
    fresh = await _get_user(uid)
    settings = fresh.get("settings", {})
    updates = data.model_dump(exclude_none=True)
    if updates.get("auto_trade") and not user.get("email_verified", True):
        raise HTTPException(status_code=403, detail="Please verify your email before enabling auto-trade.")
    reset_balance = updates.pop("demo_balance", None)
    settings.update(updates)
    set_ops = {"settings": settings}
    if reset_balance is not None:
        set_ops["demo_balance"] = reset_balance
    await db.users.update_one({"_id": ObjectId(uid)}, {"$set": set_ops})
    return {"ok": True, "settings": settings}


class DemoResetInput(BaseModel):
    balance: float | None = None


@trading_router.post("/demo/reset")
async def reset_demo(data: DemoResetInput = Body(default=None), user: dict = Depends(get_current_user)):
    """Reset DEMO data only: custom starting balance, wipe demo trade/P&L history,
    clear drawdown/halt/cooldown. Never touches subscription or any live data."""
    uid = user["id"]
    bal = round(float(data.balance), 2) if (data and data.balance is not None) else 500.0
    if bal < 100:
        raise HTTPException(status_code=400, detail="Minimum demo balance is 100")
    if bal > 10_000_000:
        raise HTTPException(status_code=400, detail="Demo balance is too large (max 10,000,000)")
    # Demo trade history lives in positions / nft_positions (paper trades only).
    await db.positions.delete_many({"user_id": uid})
    try:
        await db.nft_positions.delete_many({"user_id": uid})
    except Exception:
        pass
    fresh = await _get_user(uid)
    settings = dict(fresh.get("settings", {}))
    settings["auto_trade"] = False  # start idle; user re-enables after reset
    await db.users.update_one({"_id": ObjectId(uid)},
                              {"$set": {"demo_balance": bal, "last_deposit_at": _now(),
                                        "peak_equity": bal, "consecutive_losses": 0,
                                        "risk_halt": False, "halt_reason": None,
                                        "auto_cooldown_until": None, "cloud_trading": False,
                                        "settings": settings}})
    return {"ok": True, "demo_balance": bal}


@trading_router.post("/wallet/withdraw")
async def withdraw(data: WithdrawInput, user: dict = Depends(get_current_user)):
    uid = user["id"]
    fresh = await _get_user(uid)
    bal = fresh.get("demo_balance", 0.0)
    amt = data.amount
    if amt <= 0 or amt > bal:
        raise HTTPException(status_code=400, detail="Invalid withdrawal amount")
    dep = fresh.get("last_deposit_at") or fresh.get("created_at")
    early = False
    fee = 0.0
    if dep:
        try:
            if datetime.now(timezone.utc) - datetime.fromisoformat(dep) < timedelta(days=LOCK_DAYS):
                early = True
                fee = round(amt * EARLY_WITHDRAWAL_FEE, 2)
        except Exception:
            pass
    net = round(amt - fee, 2)
    await db.users.update_one({"_id": ObjectId(uid)}, {"$inc": {"demo_balance": -amt}})
    if fee > 0:
        await db.owner_commissions.insert_one({
            "user_id": uid, "amount": fee, "symbol": "EARLY_WITHDRAWAL",
            "kind": "early_withdrawal_fee", "created_at": _now()})
    return {"ok": True, "withdrawn": amt, "fee": fee, "net": net, "early": early,
            "message": f"Early-withdrawal fee of 5% (${fee}) applied." if early else "No fee (held 7+ days)."}


@trading_router.get("/backtest")
async def backtest(symbol: str = "BTC", interval: str = "1h", symbols: str | None = None,
                   window_size: int = 200, min_score: int = 55, stop_loss_pct: float | None = None, save: bool = True,
                   user: dict = Depends(get_current_user)):
    """Backtest: LONG + SHORT + multi-coin + by-section stats."""
    if interval not in INTERVAL_MAP:
        raise HTTPException(status_code=400, detail="Invalid interval")
    symbols = [x.strip().upper() for x in (symbols or symbol).split(",") if x.strip()][:10] or ["BTC"]
    win_size = max(50, min(int(window_size), 400))
    try:
        slp = float(stop_loss_pct if stop_loss_pct is not None else (user.get("settings") or {}).get("stop_loss_pct", 2.0) or 2.0)
    except (TypeError, ValueError):
        slp = 2.0
    slp = round(min(max(slp, MIN_STOP_LOSS_PCT), 20.0), 2)
    min_score = max(50, min(int(min_score), 90))
    sources = set()

    SECTIONS = {
        "major":    ["BTC", "ETH", "SOL", "BNB", "XRP", "ADA"],
        "shitcoin": ["DOGE", "SHIB", "PEPE", "FLOKI", "BONK", "WIF"],
        "meme":     ["MEME", "POPCAT", "BOME", "MYRO", "TURBO"],
        "nft":      ["BLUR", "APE", "SAND", "MANA", "AXS"],
    }

    def get_section(sym):
        for sec, coins in SECTIONS.items():
            if sym in coins:
                return sec
        return "other"

    all_results = []
    section_stats = {}

    for symbol in symbols:
        try:
            data = await get_klines(symbol, interval, 500)
            candles = data["candles"]
            src = "simulated" if data.get("simulated") else "live"
            sources.add(src)
            total = len(candles)
            if total < win_size + 50:
                continue

            starts = np.linspace(0, max(0, total - win_size), 5).astype(int)
            all_wins = all_trades = 0
            all_return = 0.0
            windows = []

            for w, start in enumerate(starts):
                seg = candles[start:start + win_size]
                if len(seg) < 50:
                    continue
                position = None
                entry = stop = target = 0.0
                direction = None
                wins = trades = 0
                ret = 0.0

                for i in range(22, len(seg)):
                    sig = compute_signal(seg[:i + 1])
                    close = seg[i][4]
                    high = seg[i][2]
                    low = seg[i][3]
                    action = sig.get("action", "HOLD")
                    score = sig.get("score", 0)

                    if position is None:
                        if action == "BUY" and score >= min_score and sig["sma_fast"] > sig["sma_slow"]:
                            entry = close
                            stop = entry * (1 - slp / 100)
                            target = entry * (1 + 2 * slp / 100)
                            position = entry
                            direction = "LONG"
                        elif action == "SELL" and score >= min_score and sig["sma_fast"] < sig["sma_slow"]:
                            entry = close
                            stop = entry * (1 + slp / 100)
                            target = entry * (1 - 2 * slp / 100)
                            position = entry
                            direction = "SHORT"
                    else:
                        exited = False
                        if direction == "LONG":
                            if low <= stop:
                                ret += -slp
                                trades += 1
                                exited = True
                            elif high >= target:
                                ret += 2 * slp
                                wins += 1
                                trades += 1
                                exited = True
                        else:
                            if high >= stop:
                                ret += -slp
                                trades += 1
                                exited = True
                            elif low <= target:
                                ret += 2 * slp
                                wins += 1
                                trades += 1
                                exited = True

                        if not exited:
                            opposite = (direction == "LONG" and action == "SELL") or \
                                       (direction == "SHORT" and action == "BUY")
                            if opposite:
                                pnl_pct = ((close - entry) / entry * 100) if direction == "LONG" else ((entry - close) / entry * 100)
                                ret += pnl_pct
                                trades += 1
                                if pnl_pct > 0:
                                    wins += 1
                                exited = True

                        if exited:
                            position = None
                            direction = None

                all_wins += wins
                all_trades += trades
                all_return += ret
                windows.append({
                    "window": w + 1,
                    "trades": trades,
                    "wins": wins,
                    "win_rate": round(wins / trades * 100, 1) if trades else 0,
                    "return_pct": round(ret, 2)
                })

            sec = get_section(symbol)
            if sec not in section_stats:
                section_stats[sec] = {"trades": 0, "wins": 0, "return": 0.0, "coins": []}
            section_stats[sec]["trades"] += all_trades
            section_stats[sec]["wins"] += all_wins
            section_stats[sec]["return"] += all_return
            section_stats[sec]["coins"].append(symbol)

            all_results.append({
                "symbol": symbol,
                "section": sec,
                "interval": interval,
                "data_source": src,
                "windows": windows,
                "total_trades": all_trades,
                "overall_win_rate": round(all_wins / all_trades * 100, 1) if all_trades else 0,
                "overall_return_pct": round(all_return, 2),
            })
        except Exception as e:
            all_results.append({"symbol": symbol, "error": str(e)})

    by_section = {}
    for sec, s in section_stats.items():
        by_section[sec] = {
            "total_trades": s["trades"],
            "win_rate": round(s["wins"] / s["trades"] * 100, 1) if s["trades"] else 0,
            "return_pct": round(s["return"], 2),
            "avg_return_pct": round(s["return"] / len(s["coins"]), 2) if s["coins"] else 0,
            "coins": s["coins"],
        }

    first = next((r for r in all_results if "error" not in r), None)
    if first is None:
        raise HTTPException(status_code=400, detail="Not enough candle data for this backtest")
    ok = [r for r in all_results if "error" not in r]
    data_source = "live" if sources == {"live"} else "simulated" if sources == {"simulated"} else "mixed"
    if save:
        trades = sum(r["total_trades"] for r in ok)
        wins = sum(w.get("wins", 0) for r in ok for w in r["windows"])
        await db.backtest_runs.insert_one({
            "user_id": user["id"], "symbols": [r["symbol"] for r in ok], "interval": interval,
            "total_trades": trades, "win_rate": round(wins / trades * 100, 1) if trades else 0,
            "return_pct": round(sum(r["overall_return_pct"] for r in ok) / len(ok), 2),
            "data_source": data_source, "stop_loss_pct": slp, "take_profit_pct": round(2 * slp, 2),
            "min_score": min_score, "created_at": _now()})
    return {
        "symbol": first["symbol"], "interval": interval, "windows": first["windows"],
        "total_trades": first["total_trades"], "overall_win_rate": first["overall_win_rate"],
        "overall_return_pct": first["overall_return_pct"],
        "stop_loss_pct": slp, "take_profit_pct": round(2 * slp, 2),
        "data_source": data_source,
        "results": all_results,
        "by_section": by_section,
        "config": {
            "interval": interval,
            "window_size": win_size,
            "stop_loss_pct": slp,
            "min_score": min_score,
        },
        "disclaimer": "Historical backtest only. Past performance does not guarantee future results."
    }


@trading_router.get("/backtest/history")
async def backtest_history(user: dict = Depends(get_current_user)):
    docs = await db.backtest_runs.find({"user_id": user["id"]}).sort("created_at", -1).to_list(30)
    return [{"id": str(d.pop("_id")), **{k: v for k, v in d.items() if k != "user_id"}} for d in docs]


@trading_router.delete("/backtest/history/{run_id}")
async def delete_backtest_run(run_id: str, user: dict = Depends(get_current_user)):
    if not ObjectId.is_valid(run_id):
        raise HTTPException(status_code=400, detail="Invalid id")
    r = await db.backtest_runs.delete_one({"_id": ObjectId(run_id), "user_id": user["id"]})
    if not r.deleted_count:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}
