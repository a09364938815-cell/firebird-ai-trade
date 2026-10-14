"""Rarible — art-focused, multi-chain (Ethereum, Polygon, Immutable X)."""
from .base import BaseNFTAdapter


class RaribleAdapter(BaseNFTAdapter):
    id = "rarible"
    name = "Rarible"
    chains = ["ethereum", "polygon", "immutablex"]
    kind = "art"
    requires_proxy = True
    geo_restricted = True
    base_url = "https://rarible.com"
    reservoir_supported = True

    def collection_url(self, collection: str) -> str:
        return f"{self.base_url}/collection/{collection}"

    def token_url(self, token_id) -> str:
        return f"{self.base_url}/token/{token_id}"
