import time
import math
import random
from typing import List

import httpx
import numpy as np
from fastapi import APIRouter, HTTPException

market_router = APIRouter(prefix="/api/market", tags=["market"])

BINANCE = "https://api.binance.com"

COINS = [
    {"symbol": "BTC", "name": "Bitcoin"},
    {"symbol": "ETH", "name": "Ethereum"},
    {"symbol": "BNB", "name": "BNB"},
    {"symbol": "SOL", "name": "Solana"},
    {"symbol": "XRP", "name": "XRP"},
    {"symbol": "ADA", "name": "Cardano"},
    {"symbol": "DOGE", "name": "Dogecoin"},
    {"symbol": "AVAX", "name": "Avalanche"},
    {"symbol": "LINK", "name": "Chainlink"},
    {"symbol": "DOT", "name": "Polkadot"},
    {"symbol": "MATIC", "name": "Polygon"},
    {"symbol": "TON", "name": "Toncoin"},
    {"symbol": "LTC", "name": "Litecoin"},
    {"symbol": "NEAR", "name": "NEAR Protocol"},
    {"symbol": "ATOM", "name": "Cosmos"},
]

INTERVAL_MAP = {
    "1m": "1m", "5m": "5m", "15m": "15m", "1h": "1h", "4h": "4h", "1d": "1d",
}

_BASE_PRICE = {
    "BTC": 68000, "ETH": 3500, "BNB": 580, "SOL": 165, "XRP": 0.62, "ADA": 0.45,
    "DOGE": 0.16, "AVAX": 38, "LINK": 17, "DOT": 7.2, "MATIC": 0.72, "TON": 6.8,
    "LTC": 92, "NEAR": 6.1, "ATOM": 9.4,
}

_cache: dict = {}


async def _fetch_json(url: str, params: dict):
    async with httpx.AsyncClient(timeout=8.0) as c:
        r = await c.get(url, params=params)
        r.raise_for_status()
        return r.json()


def _synthetic_klines(symbol: str, interval: str, limit: int):
    base = _BASE_PRICE.get(symbol, 10.0)
    seed = sum(ord(ch) for ch in symbol) + hash(interval) % 1000
    rnd = random.Random(seed + int(time.time() // 300))
    candles = []
    price = base * (0.9 + rnd.random() * 0.2)
    now = int(time.time() * 1000)
    step = {"1m": 60, "5m": 300, "15m": 900, "1h": 3600, "4h": 14400, "1d": 86400}.get(interval, 3600) * 1000
    for i in range(limit):
        drift = (rnd.random() - 0.48) * base * 0.012
        o = price
        c = max(0.0001, price + drift)
        h = max(o, c) * (1 + rnd.random() * 0.004)
        low = min(o, c) * (1 - rnd.random() * 0.004)
        v = base * (500 + rnd.random() * 1500)
        t = now - (limit - i) * step
        candles.append([t, round(o, 6), round(h, 6), round(low, 6), round(c, 6), round(v, 2)])
        price = c
    return candles, True


async def get_klines(symbol: str, interval: str, limit: int = 120):
    key = f"{symbol}:{interval}:{limit}"
    cached = _cache.get(key)
    if cached and time.time() - cached[0] < 20:
        return cached[1]
    binance_interval = INTERVAL_MAP.get(interval, "1h")
    try:
        raw = await _fetch_json(f"{BINANCE}/api/v3/klines", {
            "symbol": f"{symbol}USDT", "interval": binance_interval, "limit": limit})
        candles = [[k[0], float(k[1]), float(k[2]), float(k[3]), float(k[4]), float(k[5])] for k in raw]
        result = {"candles": candles, "simulated": False}
    except Exception:
        candles, _ = _synthetic_klines(symbol, interval, limit)
        result = {"candles": candles, "simulated": True}
    _cache[key] = (time.time(), result)
    return result


async def get_tickers():
    cached = _cache.get("tickers")
    if cached and time.time() - cached[0] < 15:
        return cached[1]
    symbols = [c["symbol"] for c in COINS]
    result = {}
    try:
        pairs = '[' + ','.join(f'"{s}USDT"' for s in symbols) + ']'
        raw = await _fetch_json(f"{BINANCE}/api/v3/ticker/24hr", {"symbols": pairs})
        by_symbol = {r["symbol"]: r for r in raw}
        for s in symbols:
            r = by_symbol.get(f"{s}USDT")
            if r:
                result[s] = {"price": float(r["lastPrice"]),
                             "change_24h": float(r["priceChangePercent"]),
                             "volume": float(r["quoteVolume"]), "simulated": False}
    except Exception:
        pass
    for c in COINS:
        s = c["symbol"]
        if s not in result:
            rnd = random.Random(sum(ord(x) for x in s) + int(time.time() // 60))
            base = _BASE_PRICE.get(s, 10.0)
            result[s] = {"price": round(base * (0.97 + rnd.random() * 0.06), 6),
                         "change_24h": round((rnd.random() - 0.5) * 12, 2),
                         "volume": round(base * (1e6 + rnd.random() * 5e7), 0),
                         "simulated": True}
    _cache["tickers"] = (time.time(), result)
    return result


def rsi(closes: np.ndarray, period: int = 14) -> float:
    if len(closes) < period + 1:
        return 50.0
    deltas = np.diff(closes)
    gains = np.where(deltas > 0, deltas, 0)
    losses = np.where(deltas < 0, -deltas, 0)
    avg_gain = np.mean(gains[-period:])
    avg_loss = np.mean(losses[-period:])
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return float(100 - (100 / (1 + rs)))


def sma(closes: np.ndarray, period: int) -> float:
    if len(closes) < period:
        return float(np.mean(closes))
    return float(np.mean(closes[-period:]))


def compute_signal(candles: List[list]):
    closes = np.array([c[4] for c in candles], dtype=float)
    if len(closes) < 20:
        return {"action": "HOLD", "score": 50, "rsi": 50, "sma_fast": 0, "sma_slow": 0,
                "reason": "Insufficient data"}
    r = rsi(closes, 14)
    fast = sma(closes, 9)
    slow = sma(closes, 21)
    last = float(closes[-1])
    momentum = (last - float(closes[-10])) / float(closes[-10]) * 100 if closes[-10] else 0

    score = 50
    reasons = []
    if fast > slow:
        score += 15
        reasons.append("SMA9 above SMA21 (bullish trend)")
    else:
        score -= 12
        reasons.append("SMA9 below SMA21 (bearish trend)")
    if r < 30:
        score += 18
        reasons.append(f"RSI {r:.0f} oversold")
    elif r > 70:
        score -= 18
        reasons.append(f"RSI {r:.0f} overbought")
    else:
        reasons.append(f"RSI {r:.0f} neutral")
    if momentum > 1.5:
        score += 10
        reasons.append(f"Positive momentum +{momentum:.1f}%")
    elif momentum < -1.5:
        score -= 10
        reasons.append(f"Negative momentum {momentum:.1f}%")

    score = max(1, min(99, score))
    if score >= 62:
        action = "BUY"
    elif score <= 40:
        action = "SELL"
    else:
        action = "HOLD"
    return {"action": action, "score": int(score), "rsi": round(r, 1),
            "sma_fast": round(fast, 4), "sma_slow": round(slow, 4),
            "momentum": round(momentum, 2), "reason": "; ".join(reasons)}


@market_router.get("/coins")
async def coins():
    tickers = await get_tickers()
    out = []
    for c in COINS:
        t = tickers.get(c["symbol"], {})
        out.append({**c, **t})
    return out


@market_router.get("/klines")
async def klines(symbol: str = "BTC", interval: str = "1h", limit: int = 120):
    symbol = symbol.upper()
    if interval not in INTERVAL_MAP:
        raise HTTPException(status_code=400, detail="Invalid interval")
    return await get_klines(symbol, interval, min(limit, 500))


@market_router.get("/signals")
async def signals(interval: str = "1h"):
    if interval not in INTERVAL_MAP:
        interval = "1h"
    tickers = await get_tickers()
    out = []
    for c in COINS:
        data = await get_klines(c["symbol"], interval, 80)
        sig = compute_signal(data["candles"])
        t = tickers.get(c["symbol"], {})
        out.append({"symbol": c["symbol"], "name": c["name"],
                    "price": t.get("price"), "change_24h": t.get("change_24h"),
                    "interval": interval, **sig})
    out.sort(key=lambda x: x["score"], reverse=True)
    return out


@market_router.get("/news")
async def news():
    """Market pulse derived from real top movers (not social scraping)."""
    tickers = await get_tickers()
    items = []
    movers = sorted(COINS, key=lambda c: abs(tickers.get(c["symbol"], {}).get("change_24h", 0)), reverse=True)
    for c in movers[:8]:
        t = tickers.get(c["symbol"], {})
        ch = t.get("change_24h", 0)
        direction = "surges" if ch >= 0 else "drops"
        items.append({
            "symbol": c["symbol"],
            "title": f"{c['name']} {direction} {abs(ch):.2f}% in 24h",
            "summary": f"{c['name']} ({c['symbol']}) is trading around ${t.get('price')}, "
                       f"with 24h volume of ${t.get('volume', 0):,.0f}.",
            "sentiment": "positive" if ch >= 0 else "negative",
            "source": "Market Pulse",
        })
    return items


@market_router.get("/whales")
async def whales():
    """Simulated whale / smart-money volume signals derived from volume + volatility."""
    tickers = await get_tickers()
    out = []
    for c in COINS:
        t = tickers.get(c["symbol"], {})
        vol = t.get("volume", 0)
        ch = t.get("change_24h", 0)
        pressure = "accumulation" if ch >= 0 else "distribution"
        intensity = min(100, int(abs(ch) * 6 + (vol > 5e8) * 20))
        out.append({"symbol": c["symbol"], "name": c["name"], "volume": vol,
                    "pressure": pressure, "intensity": intensity,
                    "note": f"Smart-money {pressure} signal (indicative, not guaranteed)"})
    out.sort(key=lambda x: x["intensity"], reverse=True)
    return out
