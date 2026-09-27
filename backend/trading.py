from datetime import datetime, timezone, timedelta

import numpy as np
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from db import db
from auth import get_current_user
from market import get_tickers, get_klines, compute_signal, COINS

trading_router = APIRouter(prefix="/api/trading", tags=["trading"])


class ManualTradeInput(BaseModel):
    symbol: str
    side: str  # BUY or SELL
    usd_amount: float


class SettingsInput(BaseModel):
    demo_balance: float | None = None
    risk_lock: bool | None = None
    max_position_pct: float | None = None
    trailing_stop_pct: float | None = None
    take_profit_pct: float | None = None
    stop_loss_pct: float | None = None
    auto_trade: bool | None = None
    language: str | None = None


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


async def _open_position(uid: str, symbol: str, side: str, usd: float, tickers, settings, source="manual"):
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
        raise HTTPException(status_code=400, detail="No price for symbol")
    size = usd / price
    doc = {"user_id": uid, "symbol": symbol, "side": side, "size": size,
           "entry_price": price, "usd_amount": usd, "status": "open", "source": source,
           "take_profit_pct": settings.get("take_profit_pct", 8.0),
           "stop_loss_pct": settings.get("stop_loss_pct", 4.0),
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
    pnl = (price - entry) * size * (1 if side == "BUY" else -1)
    commission = round(max(0.0, pnl) * OWNER_RATE, 4)
    proceeds = position["usd_amount"] + pnl - commission
    await db.positions.update_one({"_id": ObjectId(position["id"])},
                                  {"$set": {"status": "closed", "exit_price": price,
                                            "pnl": round(pnl, 4), "owner_commission": commission,
                                            "closed_at": _now(), "close_reason": reason}})
    await db.users.update_one({"_id": ObjectId(uid)}, {"$inc": {"demo_balance": proceeds}})
    if commission > 0:
        await db.owner_commissions.insert_one({
            "user_id": uid, "amount": commission, "symbol": position["symbol"],
            "kind": "trade_profit", "created_at": _now()})
    return round(pnl, 2)


@trading_router.post("/manual")
async def manual_trade(data: ManualTradeInput, user: dict = Depends(get_current_user)):
    uid = user["id"]
    symbol = data.symbol.upper()
    settings = user.get("settings", {})
    tickers = await get_tickers()
    if data.side.upper() == "BUY":
        pos = await _open_position(uid, symbol, "BUY", data.usd_amount, tickers, settings, "manual")
        return {"ok": True, "position": pos}
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


async def _apply_risk_management(uid: str, tickers):
    """Trailing stop / TP / SL evaluation on open positions."""
    positions = await _open_positions(uid)
    events = []
    for p in positions:
        price = tickers.get(p["symbol"], {}).get("price", p["entry_price"])
        entry = p["entry_price"]
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


@trading_router.post("/auto/tick")
async def auto_tick(user: dict = Depends(get_current_user)):
    """One evaluation cycle of the auto-trader (demo only)."""
    uid = user["id"]
    settings = user.get("settings", {})
    tickers = await get_tickers()
    events = await _apply_risk_management(uid, tickers)
    opened = []
    if settings.get("auto_trade"):
        fresh = await _get_user(uid)
        balance = fresh.get("demo_balance", 0)
        open_pos = await _open_positions(uid)
        held = {p["symbol"] for p in open_pos}
        if len(open_pos) < 4 and balance > 5:
            # find best BUY signal on 1h not already held
            best = None
            for c in COINS:
                if c["symbol"] in held:
                    continue
                data = await get_klines(c["symbol"], "1h", 80)
                sig = compute_signal(data["candles"])
                if sig["action"] == "BUY" and (best is None or sig["score"] > best[1]["score"]):
                    best = (c["symbol"], sig)
            if best:
                usd = min(balance * settings.get("max_position_pct", 25.0) / 100, balance)
                if usd > 1:
                    pos = await _open_position(uid, best[0], "BUY", round(usd, 2), tickers, settings, "auto")
                    opened.append({"symbol": best[0], "score": best[1]["score"]})
    return {"closed": events, "opened": opened}


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
    reset_balance = updates.pop("demo_balance", None)
    settings.update(updates)
    set_ops = {"settings": settings}
    if reset_balance is not None:
        set_ops["demo_balance"] = reset_balance
    await db.users.update_one({"_id": ObjectId(uid)}, {"$set": set_ops})
    return {"ok": True, "settings": settings}


@trading_router.post("/demo/reset")
async def reset_demo(user: dict = Depends(get_current_user)):
    uid = user["id"]
    await db.positions.delete_many({"user_id": uid})
    await db.users.update_one({"_id": ObjectId(uid)},
                              {"$set": {"demo_balance": 100.0, "last_deposit_at": _now()}})
    return {"ok": True, "demo_balance": 100.0}


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
async def backtest(symbol: str = "BTC", interval: str = "1h", user: dict = Depends(get_current_user)):
    """5x5 backtest: run the SMA/RSI strategy across 5 recent windows and report stats."""
    symbol = symbol.upper()
    data = await get_klines(symbol, interval, 300)
    candles = data["candles"]
    windows = []
    total = len(candles)
    win_size = 60
    starts = np.linspace(0, max(0, total - win_size), 5).astype(int)
    all_wins = 0
    all_trades = 0
    all_return = 0.0
    for w, start in enumerate(starts):
        seg = candles[start:start + win_size]
        if len(seg) < 25:
            continue
        closes = [c[4] for c in seg]
        position = None
        wins = 0
        trades = 0
        ret = 0.0
        for i in range(22, len(seg)):
            sig = compute_signal(seg[:i + 1])
            price = closes[i]
            if position is None and sig["action"] == "BUY":
                position = price
            elif position is not None and (sig["action"] == "SELL" or (price - position) / position * 100 >= 8):
                pnl_pct = (price - position) / position * 100
                ret += pnl_pct
                trades += 1
                if pnl_pct > 0:
                    wins += 1
                position = None
        all_wins += wins
        all_trades += trades
        all_return += ret
        windows.append({"window": w + 1, "trades": trades,
                        "win_rate": round(wins / trades * 100, 1) if trades else 0,
                        "return_pct": round(ret, 2)})
    return {"symbol": symbol, "interval": interval, "windows": windows,
            "total_trades": all_trades,
            "overall_win_rate": round(all_wins / all_trades * 100, 1) if all_trades else 0,
            "overall_return_pct": round(all_return, 2),
            "disclaimer": "Historical backtest only. Past performance does not guarantee future results."}
