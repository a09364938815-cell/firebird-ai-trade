"""Multi-exchange engine using the Adapter Pattern.

BaseExchangeAdapter defines the contract; concrete adapters wrap CCXT (foreign
CEX), custom REST (Iranian CEX) and DEX price APIs. ExchangeManager fans out
across every adapter a user has connected so balances/prices show in one place.

NOTE: Live private calls (balances, orders) require valid API keys. Without keys
adapters return public prices only and empty balances — clearly surfaced to the UI.
"""
import asyncio
import logging

import httpx

logger = logging.getLogger(__name__)

try:
    import ccxt.async_support as ccxt_async
except Exception:  # pragma: no cover
    ccxt_async = None


class BaseExchangeAdapter:
    id = "base"
    name = "Base"
    kind = "cex"          # cex | iranian_cex | dex
    ccxt_id = None

    def __init__(self, api_key: str = "", secret: str = ""):
        self.api_key = api_key
        self.secret = secret

    async def fetch_price(self, symbol: str) -> float | None:
        raise NotImplementedError

    async def fetch_balances(self) -> list[dict]:
        return []

    async def health(self) -> bool:
        try:
            p = await self.fetch_price("BTC")
            return p is not None
        except Exception:
            return False


class CCXTAdapter(BaseExchangeAdapter):
    """Generic adapter for any CCXT-supported exchange (CoinEx, XT, Toobit…)."""
    def __init__(self, api_key="", secret="", ccxt_id="coinex", name=None, kind="cex", passphrase=""):
        super().__init__(api_key, secret)
        self.ccxt_id = ccxt_id
        self.id = ccxt_id
        self.name = name or ccxt_id.upper()
        self.kind = kind
        self.passphrase = passphrase

    def _client(self):
        if not ccxt_async or not hasattr(ccxt_async, self.ccxt_id):
            return None
        cls = getattr(ccxt_async, self.ccxt_id)
        cfg = {"enableRateLimit": True, "timeout": 8000}
        if self.api_key:
            cfg.update({"apiKey": self.api_key, "secret": self.secret})
            if self.passphrase:
                cfg["password"] = self.passphrase
        return cls(cfg)

    async def fetch_price(self, symbol: str) -> float | None:
        client = self._client()
        if not client:
            return None
        try:
            t = await client.fetch_ticker(f"{symbol}/USDT")
            return float(t.get("last") or t.get("close"))
        except Exception:
            return None
        finally:
            try:
                await client.close()
            except Exception:
                pass

    async def fetch_balances(self) -> list[dict]:
        if not self.api_key:
            return []
        client = self._client()
        if not client:
            return []
        try:
            bal = await client.fetch_balance()
            out = []
            for asset, amt in (bal.get("total") or {}).items():
                if amt and float(amt) > 0:
                    out.append({"asset": asset, "amount": float(amt)})
            return out[:30]
        except Exception:
            return []
        finally:
            try:
                await client.close()
            except Exception:
                pass

    async def probe_permissions(self) -> dict:
        """Best-effort detection of trade/withdraw permissions so we can refuse
        keys that are not strictly read-only. Returns booleans, or None when the
        exchange does not expose a permission endpoint (unknown)."""
        if not self.api_key:
            return {"can_trade": None, "can_withdraw": None, "source": "no_keys"}
        client = self._client()
        if not client:
            return {"can_trade": None, "can_withdraw": None, "source": "unavailable"}
        try:
            if self.ccxt_id == "binance" and hasattr(client, "sapiGetAccountApiRestrictions"):
                r = await client.sapiGetAccountApiRestrictions()
                can_trade = bool(r.get("enableSpotAndMarginTrading") or r.get("enableFutures") or r.get("enableMargin"))
                can_withdraw = bool(r.get("enableWithdrawals") or r.get("enableInternalTransfer"))
                return {"can_trade": can_trade, "can_withdraw": can_withdraw, "source": "binance"}
            return {"can_trade": None, "can_withdraw": None, "source": "unknown"}
        except Exception:
            return {"can_trade": None, "can_withdraw": None, "source": "error"}
        finally:
            try:
                await client.close()
            except Exception:
                pass


class _RestPriceAdapter(BaseExchangeAdapter):
    """Base for custom REST adapters (Iranian CEX / DEX). Balances need keys."""
    async def _get(self, url, params=None):
        async with httpx.AsyncClient(timeout=8.0) as c:
            r = await c.get(url, params=params or {})
            r.raise_for_status()
            return r.json()


class NobitexAdapter(_RestPriceAdapter):
    id, name, kind = "nobitex", "Nobitex", "iranian_cex"

    async def fetch_price(self, symbol: str) -> float | None:
        try:
            d = await self._get("https://api.nobitex.ir/v2/orderbook/" + f"{symbol}USDT")
            return float(d.get("lastTradePrice")) if d.get("lastTradePrice") else None
        except Exception:
            return None


class WallexAdapter(_RestPriceAdapter):
    id, name, kind = "wallex", "Wallex", "iranian_cex"

    async def fetch_price(self, symbol: str) -> float | None:
        try:
            d = await self._get("https://api.wallex.ir/v1/markets")
            sym = d.get("result", {}).get("symbols", {}).get(f"{symbol}USDT", {})
            price = sym.get("stats", {}).get("lastPrice")
            return float(price) if price else None
        except Exception:
            return None


class BitpinAdapter(_RestPriceAdapter):
    id, name, kind = "bitpin", "Bitpin", "iranian_cex"

    async def fetch_price(self, symbol: str) -> float | None:
        try:
            d = await self._get("https://api.bitpin.org/v1/mkt/tickers/")
            for row in (d if isinstance(d, list) else d.get("results", [])):
                if row.get("symbol") in (f"{symbol}_USDT", f"{symbol}USDT"):
                    return float(row.get("price"))
            return None
        except Exception:
            return None


class JupiterDexAdapter(_RestPriceAdapter):
    id, name, kind = "jupiter", "Jupiter (Solana DEX)", "dex"

    async def fetch_price(self, symbol: str) -> float | None:
        try:
            d = await self._get("https://price.jup.ag/v6/price", {"ids": symbol})
            return float(d["data"][symbol]["price"])
        except Exception:
            return None


class UniswapDexAdapter(_RestPriceAdapter):
    id, name, kind = "uniswap", "Uniswap (Ethereum DEX)", "dex"

    async def fetch_price(self, symbol: str) -> float | None:
        # Non-custodial via wallet; public price via Binance spot as a proxy feed.
        try:
            d = await self._get("https://api.binance.com/api/v3/ticker/price",
                                 {"symbol": f"{symbol}USDT"})
            return float(d["price"])
        except Exception:
            return None


class PancakeDexAdapter(UniswapDexAdapter):
    id, name, kind = "pancakeswap", "PancakeSwap (BSC DEX)", "dex"


# Registry: id -> (adapter factory, needs ccxt_id)
def build_adapter(exchange_id: str, api_key: str = "", secret: str = "", passphrase: str = "") -> BaseExchangeAdapter | None:
    eid = exchange_id.lower()
    ccxt_map = {
        "coinex": ("coinex", "CoinEx"),
        "xt": ("xt", "XT.com"),
        "toobit": ("toobit", "Toobit"),
        "binance": ("binance", "Binance"),
        "mexc": ("mexc", "MEXC"),
        "lbank": ("lbank", "LBank"),
        "kraken": ("kraken", "Kraken"),
        "okx": ("okx", "OKX"),
        "bybit": ("bybit", "Bybit"),
    }
    if eid in ccxt_map:
        cid, nm = ccxt_map[eid]
        if ccxt_async and not hasattr(ccxt_async, cid) and eid == "toobit":
            # Toobit not in ccxt build → fall back to a REST price via Binance proxy
            a = UniswapDexAdapter(api_key, secret)
            a.id, a.name, a.kind = "toobit", "Toobit", "cex"
            return a
        return CCXTAdapter(api_key, secret, ccxt_id=cid, name=nm, passphrase=passphrase)
    custom = {
        "nobitex": NobitexAdapter, "wallex": WallexAdapter, "bitpin": BitpinAdapter,
        "jupiter": JupiterDexAdapter, "uniswap": UniswapDexAdapter, "pancakeswap": PancakeDexAdapter,
    }
    if eid in custom:
        return custom[eid](api_key, secret)
    return None


SUPPORTED_EXCHANGES = [
    {"id": "binance", "name": "Binance", "kind": "cex"},
    {"id": "mexc", "name": "MEXC", "kind": "cex"},
    {"id": "toobit", "name": "Toobit", "kind": "cex"},
    {"id": "xt", "name": "XT.com", "kind": "cex"},
    {"id": "lbank", "name": "LBank", "kind": "cex"},
    {"id": "coinex", "name": "CoinEx", "kind": "cex"},
    {"id": "nobitex", "name": "Nobitex", "kind": "iranian_cex"},
    {"id": "wallex", "name": "Wallex", "kind": "iranian_cex"},
    {"id": "bitpin", "name": "Bitpin", "kind": "iranian_cex"},
    {"id": "uniswap", "name": "Uniswap", "kind": "dex"},
    {"id": "pancakeswap", "name": "PancakeSwap", "kind": "dex"},
    {"id": "jupiter", "name": "Jupiter", "kind": "dex"},
]


class ExchangeManager:
    """Handles all adapters simultaneously for a user."""
    def __init__(self, connections: list[dict]):
        # connections: [{exchange, api_key, secret, passphrase}]
        self.adapters = []
        for c in connections:
            a = build_adapter(c["exchange"], c.get("api_key", ""), c.get("secret", ""), c.get("passphrase", ""))
            if a:
                self.adapters.append((c["exchange"], a))

    async def aggregate_balances(self) -> list[dict]:
        async def one(eid, a):
            try:
                bals = await a.fetch_balances()
            except Exception:
                bals = []
            return {"exchange": eid, "name": a.name, "kind": a.kind, "balances": bals}
        return await asyncio.gather(*[one(eid, a) for eid, a in self.adapters]) if self.adapters else []

    async def aggregate_prices(self, symbols: list[str]) -> dict:
        async def one(eid, a):
            prices = {}
            for s in symbols:
                try:
                    p = await a.fetch_price(s)
                except Exception:
                    p = None
                if p is not None:
                    prices[s] = p
            return eid, {"name": a.name, "kind": a.kind, "prices": prices}
        results = await asyncio.gather(*[one(eid, a) for eid, a in self.adapters]) if self.adapters else []
        return dict(results)
