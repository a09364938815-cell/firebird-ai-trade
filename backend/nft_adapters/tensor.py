"""Tensor — Solana-native pro NFT marketplace (no Reservoir → mock/custom)."""
from .base import BaseNFTAdapter


class TensorAdapter(BaseNFTAdapter):
    id = "tensor"
    name = "Tensor"
    chains = ["solana"]
    kind = "pro"
    requires_proxy = True
    geo_restricted = True
    base_url = "https://www.tensor.trade"
    reservoir_supported = False  # Solana-native; served via mock/custom provider

    def collection_url(self, collection: str) -> str:
        return f"{self.base_url}/trade/{collection}"

    def token_url(self, token_id) -> str:
        return f"{self.base_url}/item/{token_id}"
