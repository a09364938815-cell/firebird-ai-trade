"""NFT multi-marketplace API — exposes the adapter layer (PRIORITY 1).

Aggregates floor/listings/stats across Blur, Magic Eden, Rarible, Tensor and
Enftino. Buy/Sell return a non-custodial signing/deep-link intent (the user
signs in their own wallet; keys are never stored). Falls back to deterministic
mock data when no provider key is set or a marketplace geo-blocks the request.
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from auth import get_current_user
from nft_adapters import NftMarketManager, SUPPORTED_MARKETPLACES, build_nft_adapter

nft_market_router = APIRouter(prefix="/api/nft-market", tags=["nft-market"])

DEFAULT_COLLECTION = "firebird-555"


@nft_market_router.get("/marketplaces")
async def marketplaces(user: dict = Depends(get_current_user)):
    return [build_nft_adapter(m["id"]).meta() for m in SUPPORTED_MARKETPLACES]


@nft_market_router.get("/floor")
async def floor(collection: str = DEFAULT_COLLECTION, marketplace: str = "all",
                user: dict = Depends(get_current_user)):
    if marketplace == "all":
        return await NftMarketManager().aggregate_floor(collection)
    a = build_nft_adapter(marketplace)
    if not a:
        return {"error": "unknown marketplace"}
    return {"collection": collection, "marketplace": a.id, "name": a.name,
            "floor_price_eth": await a.get_floor_price(collection),
            "requires_proxy": a.requires_proxy}


@nft_market_router.get("/stats")
async def stats(collection: str = DEFAULT_COLLECTION, marketplace: str = "all",
                user: dict = Depends(get_current_user)):
    if marketplace == "all":
        return await NftMarketManager().aggregate_stats(collection)
    a = build_nft_adapter(marketplace)
    if not a:
        return {"error": "unknown marketplace"}
    return await a.get_collection_stats(collection)


@nft_market_router.get("/listings")
async def listings(collection: str = DEFAULT_COLLECTION, marketplace: str = "all",
                   limit: int = 30, user: dict = Depends(get_current_user)):
    limit = max(1, min(limit, 60))
    if marketplace == "all":
        return await NftMarketManager().aggregate_listings(collection, limit=limit)
    a = build_nft_adapter(marketplace)
    if not a:
        return []
    return await a.get_listings(collection, limit=limit)


class TradeIntent(BaseModel):
    marketplace: str
    token_id: int
    price_eth: float | None = None
    wallet: str | None = None


@nft_market_router.post("/buy")
async def buy(data: TradeIntent, user: dict = Depends(get_current_user)):
    a = build_nft_adapter(data.marketplace)
    if not a:
        return {"ok": False, "error": "unknown marketplace"}
    return await a.buy(data.token_id, data.price_eth, data.wallet)


@nft_market_router.post("/sell")
async def sell(data: TradeIntent, user: dict = Depends(get_current_user)):
    a = build_nft_adapter(data.marketplace)
    if not a:
        return {"ok": False, "error": "unknown marketplace"}
    return await a.sell(data.token_id, data.price_eth, data.wallet)
