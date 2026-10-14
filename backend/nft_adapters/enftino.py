"""Enftino — Iranian domestic marketplace. Always accessible (no proxy needed)."""
from .base import BaseNFTAdapter


class EnftinoAdapter(BaseNFTAdapter):
    id = "enftino"
    name = "Enftino"
    chains = ["ethereum"]
    kind = "iranian"
    requires_proxy = False     # domestic — never geo-blocked for Iranian users
    geo_restricted = False
    base_url = "https://enftino.com"
    reservoir_supported = False  # domestic API; served via mock/custom provider

    def collection_url(self, collection: str) -> str:
        return f"{self.base_url}/collection/{collection}"

    def token_url(self, token_id) -> str:
        return f"{self.base_url}/nft/{token_id}"
