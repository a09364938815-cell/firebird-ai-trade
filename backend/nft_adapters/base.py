"""NFT marketplace Adapter Pattern — base contract + mock/real data helpers.

Mirrors exchange_adapters.py: BaseNFTAdapter defines the contract; concrete
adapters wrap a real aggregator (Reservoir) where supported and fall back to
deterministic mock data when no API key is set or the marketplace geo-blocks
the request. Buy/Sell are non-custodial: adapters only return a signing/deep-link
intent — the user signs in their own wallet (keys are NEVER stored server-side).
"""
import os
import time
import random
import logging

import httpx

logger = logging.getLogger(__name__)

RESERVOIR_API_KEY = os.environ.get("RESERVOIR_API_KEY", "")
RESERVOIR_BASE = "https://api.reservoir.tools"

# Shared image pool for mock listings (reuses the in-app Firebird art).
_IMG = "https://static.prod-images.emergentagent.com/jobs/2857b787-092b-48b2-8f7f-f9178af03cef/images"
_MOCK_IMAGES = [
    f"{_IMG}/7eb706671719b6300de76fd1a27822676d3b966d1f6e7686a7fe787aa53410dd.jpeg",
    f"{_IMG}/e910b932f8406358627e42c74c20d1030be9e3858462aeced6848176131be9ab.jpeg",
    f"{_IMG}/8518770a414a86f704a5cf31d74572b7ee774fc7f0722389b9997d66b7cee68e.jpeg",
    f"{_IMG}/c54db03a667c057998be434756d5d1353f5565122da61eecb1012ed50046fb17.jpeg",
    f"{_IMG}/c688d726f2a1ad366ad3d6e9abb8cdb1bf350d06b00a9690630590b7ba9b19a7.jpeg",
    f"{_IMG}/3057ba0f518b8d54db08a7c870fe20e9f07a8b2d31df4e105f3d8a1b9339902a.jpeg",
]


def _bucket() -> int:
    return int(time.time() // 300)  # mock values refresh every 5 minutes


def _seed(*parts) -> int:
    return abs(hash("|".join(str(p) for p in parts))) & 0xFFFFFFFF


def _mock_base_floor(collection: str) -> float:
    r = random.Random(_seed("floor", collection))
    return round(0.02 + r.random() * 1.5, 4)  # 0.02 – 1.52 ETH


class BaseNFTAdapter:
    id = "base"
    name = "Base"
    chains = ["ethereum"]
    kind = "marketplace"
    requires_proxy = True      # international marketplaces block Iranian IPs
    geo_restricted = True
    base_url = "https://example.com"
    reservoir_supported = False

    def __init__(self, api_key: str = ""):
        self.api_key = api_key or RESERVOIR_API_KEY

    # ---------------- metadata ----------------
    def meta(self) -> dict:
        return {
            "id": self.id, "name": self.name, "chains": self.chains, "kind": self.kind,
            "requires_proxy": self.requires_proxy, "geo_restricted": self.geo_restricted,
            "accessible_without_proxy": not self.requires_proxy,
            "url": self.base_url,
        }

    def collection_url(self, collection: str) -> str:
        return self.base_url

    def token_url(self, token_id) -> str:
        return self.base_url

    # ---------------- public contract ----------------
    async def get_floor_price(self, collection: str) -> float | None:
        real = await self._reservoir_floor(collection) if self.reservoir_supported else None
        if real is not None:
            return real
        return self._mock_floor(collection)

    async def get_collection_stats(self, collection: str) -> dict:
        floor = await self.get_floor_price(collection)
        r = random.Random(_seed("stats", collection, self.id, _bucket()))
        return {
            "marketplace": self.id, "name": self.name, "collection": collection,
            "chain": self.chains[0], "floor_price_eth": floor,
            "listed_count": r.randint(20, 400),
            "owners": r.randint(120, 2000),
            "volume_24h_eth": round(2 + r.random() * 60, 2),
            "change_24h": round((r.random() - 0.4) * 20, 2),
            "source": "mock" if not (self.reservoir_supported and self.api_key) else "reservoir",
            "requires_proxy": self.requires_proxy,
        }

    async def get_listings(self, collection: str, limit: int = 20) -> list[dict]:
        floor = await self.get_floor_price(collection)
        r = random.Random(_seed("listings", collection, self.id, _bucket()))
        out = []
        for i in range(limit):
            tid = r.randint(1, 555)
            price = round(floor * (1 + r.random() * 0.6), 4)
            out.append({
                "token_id": tid,
                "name": f"Firebird #{tid:03d}",
                "image": _MOCK_IMAGES[tid % len(_MOCK_IMAGES)],
                "price_eth": price,
                "marketplace": self.id, "marketplace_name": self.name,
                "chain": self.chains[0],
                "token_url": self.token_url(tid),
                "requires_proxy": self.requires_proxy,
            })
        out.sort(key=lambda x: x["price_eth"])
        return out

    async def buy(self, token_id, price_eth: float = None, wallet: str = None) -> dict:
        return self._trade_intent("buy", token_id, price_eth, wallet)

    async def sell(self, token_id, price_eth: float = None, wallet: str = None) -> dict:
        return self._trade_intent("sell", token_id, price_eth, wallet)

    # ---------------- helpers ----------------
    def _trade_intent(self, action: str, token_id, price_eth, wallet) -> dict:
        # Non-custodial: hand the user a deep link + signing intent; no server-side keys.
        return {
            "ok": True, "mode": "deeplink", "action": action,
            "marketplace": self.id, "marketplace_name": self.name,
            "token_id": token_id, "price_eth": price_eth,
            "chain": self.chains[0], "requires_signature": True,
            "requires_proxy": self.requires_proxy,
            "url": self.token_url(token_id),
            "note": ("Sign the transaction in your own wallet (WalletConnect). "
                     "Keys are never stored. You may need a VPN/proxy for this marketplace."
                     if self.requires_proxy else
                     "Sign the transaction in your own wallet (WalletConnect). Keys are never stored."),
        }

    def _mock_floor(self, collection: str) -> float:
        base = _mock_base_floor(collection)
        r = random.Random(_seed(collection, self.id, _bucket()))
        mult = 0.9 + r.random() * 0.25  # each marketplace shows a slightly different floor
        return round(base * mult, 4)

    async def _reservoir_floor(self, collection: str) -> float | None:
        if not self.api_key:
            return None
        try:
            async with httpx.AsyncClient(timeout=6.0) as c:
                r = await c.get(
                    f"{RESERVOIR_BASE}/collections/v7",
                    params={"id": collection},
                    headers={"x-api-key": self.api_key, "accept": "*/*"},
                )
                r.raise_for_status()
                cols = r.json().get("collections") or []
                if not cols:
                    return None
                fp = (((cols[0].get("floorAsk") or {}).get("price") or {}).get("amount") or {}).get("decimal")
                return float(fp) if fp is not None else None
        except Exception as e:  # geo-block / network / rate-limit → mock fallback
            logger.info("Reservoir floor fallback (%s): %s", self.id, e)
            return None
