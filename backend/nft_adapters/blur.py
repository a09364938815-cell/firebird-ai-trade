"""Blur — Ethereum, pro-trader focused aggregator marketplace."""
from .base import BaseNFTAdapter


class BlurAdapter(BaseNFTAdapter):
    id = "blur"
    name = "Blur"
    chains = ["ethereum"]
    kind = "pro"
    requires_proxy = True
    geo_restricted = True
    base_url = "https://blur.io"
    reservoir_supported = True

    def collection_url(self, collection: str) -> str:
        return f"{self.base_url}/collection/{collection}"

    def token_url(self, token_id) -> str:
        return f"{self.base_url}/asset/{token_id}"
