"""Magic Eden — multi-chain (Solana, Ethereum, Bitcoin, Polygon)."""
from .base import BaseNFTAdapter


class MagicEdenAdapter(BaseNFTAdapter):
    id = "magiceden"
    name = "Magic Eden"
    chains = ["solana", "ethereum", "bitcoin", "polygon"]
    kind = "multi_chain"
    requires_proxy = True
    geo_restricted = True
    base_url = "https://magiceden.io"
    reservoir_supported = True

    def collection_url(self, collection: str) -> str:
        return f"{self.base_url}/marketplace/{collection}"

    def token_url(self, token_id) -> str:
        return f"{self.base_url}/item-details/{token_id}"
