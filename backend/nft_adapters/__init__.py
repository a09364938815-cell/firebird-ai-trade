"""NFT marketplace adapter layer — public API.

Usage:
    from nft_adapters import build_nft_adapter, NftMarketManager, SUPPORTED_MARKETPLACES
"""
import asyncio

from .base import BaseNFTAdapter
from .blur import BlurAdapter
from .magiceden import MagicEdenAdapter
from .rarible import RaribleAdapter
from .tensor import TensorAdapter
from .enftino import EnftinoAdapter

_ADAPTERS = {
    BlurAdapter.id: BlurAdapter,
    MagicEdenAdapter.id: MagicEdenAdapter,
    RaribleAdapter.id: RaribleAdapter,
    TensorAdapter.id: TensorAdapter,
    EnftinoAdapter.id: EnftinoAdapter,
}

SUPPORTED_MARKETPLACES = [
    {"id": BlurAdapter.id, "name": BlurAdapter.name, "kind": BlurAdapter.kind,
     "chains": BlurAdapter.chains, "requires_proxy": BlurAdapter.requires_proxy},
    {"id": MagicEdenAdapter.id, "name": MagicEdenAdapter.name, "kind": MagicEdenAdapter.kind,
     "chains": MagicEdenAdapter.chains, "requires_proxy": MagicEdenAdapter.requires_proxy},
    {"id": RaribleAdapter.id, "name": RaribleAdapter.name, "kind": RaribleAdapter.kind,
     "chains": RaribleAdapter.chains, "requires_proxy": RaribleAdapter.requires_proxy},
    {"id": TensorAdapter.id, "name": TensorAdapter.name, "kind": TensorAdapter.kind,
     "chains": TensorAdapter.chains, "requires_proxy": TensorAdapter.requires_proxy},
    {"id": EnftinoAdapter.id, "name": EnftinoAdapter.name, "kind": EnftinoAdapter.kind,
     "chains": EnftinoAdapter.chains, "requires_proxy": EnftinoAdapter.requires_proxy},
]


def build_nft_adapter(marketplace_id: str, api_key: str = "") -> BaseNFTAdapter | None:
    cls = _ADAPTERS.get((marketplace_id or "").lower())
    return cls(api_key) if cls else None


class NftMarketManager:
    """Fan out across every NFT marketplace adapter to aggregate best prices."""

    def __init__(self, marketplace_ids: list[str] = None):
        ids = marketplace_ids or list(_ADAPTERS.keys())
        self.adapters = [a for a in (build_nft_adapter(i) for i in ids) if a]

    async def aggregate_floor(self, collection: str) -> dict:
        async def one(a: BaseNFTAdapter):
            try:
                fp = await a.get_floor_price(collection)
            except Exception:
                fp = None
            return {"marketplace": a.id, "name": a.name, "chain": a.chains[0],
                    "floor_price_eth": fp, "requires_proxy": a.requires_proxy}
        rows = await asyncio.gather(*[one(a) for a in self.adapters])
        valid = [r for r in rows if r["floor_price_eth"] is not None]
        best = min(valid, key=lambda r: r["floor_price_eth"]) if valid else None
        return {"collection": collection, "best": best, "marketplaces": rows}

    async def aggregate_listings(self, collection: str, limit: int = 30) -> list[dict]:
        async def one(a: BaseNFTAdapter):
            try:
                return await a.get_listings(collection, limit=limit)
            except Exception:
                return []
        batches = await asyncio.gather(*[one(a) for a in self.adapters])
        merged = [item for b in batches for item in b]
        merged.sort(key=lambda x: x["price_eth"])
        return merged[:limit]

    async def aggregate_stats(self, collection: str) -> list[dict]:
        async def one(a: BaseNFTAdapter):
            try:
                return await a.get_collection_stats(collection)
            except Exception:
                return None
        rows = await asyncio.gather(*[one(a) for a in self.adapters])
        return [r for r in rows if r]
