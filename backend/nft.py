import os
import base64
import random
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from db import db
from auth import get_current_user
from emergentintegrations.llm.chat import LlmChat, UserMessage

nft_router = APIRouter(prefix="/api/nft", tags=["nft"])

RARE_IMG = {
    1: "https://static.prod-images.emergentagent.com/jobs/2857b787-092b-48b2-8f7f-f9178af03cef/images/39f181bb9ec40a48f4c218e4cb7f6bcfbbf9d8c77039edf1725282bd7fc28167.jpeg",
    88: "https://static.prod-images.emergentagent.com/jobs/2857b787-092b-48b2-8f7f-f9178af03cef/images/6617ad992ae5ea2a695bbc7a972eea345838854da974b7b17b3db9417c24a4f4.jpeg",
    111: "https://static.prod-images.emergentagent.com/jobs/2857b787-092b-48b2-8f7f-f9178af03cef/images/f87a2aa5b03006e8dd6f80f90cd47968ba5cfd670fac056ffa98af93cafb3e0a.jpeg",
    333: "https://static.prod-images.emergentagent.com/jobs/2857b787-092b-48b2-8f7f-f9178af03cef/images/56f432ddc280e602b54454346bf5a07b4c15738afeecfefba74154828fdea122.jpeg",
    444: "https://static.prod-images.emergentagent.com/jobs/2857b787-092b-48b2-8f7f-f9178af03cef/images/9af776bd6efccb277974ebab1373d8a9437a7e23ae723e822a13e4cd4dd1a1f0.jpeg",
    555: "https://static.prod-images.emergentagent.com/jobs/2857b787-092b-48b2-8f7f-f9178af03cef/images/79e2b3f2d87cecf0a280cb213c4e53fa24e8f8cb55cdb602875a6233be4971d7.jpeg",
}

RARE_NAMES = {
    1: "Sovereign Ember", 88: "Cosmic Flame", 111: "Crystal Phoenix",
    333: "Golden Ash", 444: "Radiant Wing", 555: "Eternal Legend",
}

RARE_STORY = {
    1: "The first flame. Alone on the highest peak, Sovereign Ember greets every sunrise — majesty that needs no crowd.",
    88: "Born between the stars, Cosmic Flame carries light across galaxies where no fire has burned before.",
    111: "A phoenix of living crystal with a thinking core. Its light is clear, controlled and endlessly patient.",
    333: "From cold grey ash rose Golden Ash. Proof that every ending carries the spark of a beginning.",
    444: "Radiant Wing is pure energy — ribbons of plasma that sing as they fly.",
    555: "Phoenix, dragon and Simorgh in one sky. The last and the first of the collection — a legend and a promise.",
}

_IMG = "https://static.prod-images.emergentagent.com/jobs/2857b787-092b-48b2-8f7f-f9178af03cef/images"

THEMES = [
    {"slug": "rising-from-ashes", "title": "Rising from Ashes",
     "image": f"{_IMG}/56f432ddc280e602b54454346bf5a07b4c15738afeecfefba74154828fdea122.jpeg",
     "story": "From cold grey ash a new flame stirs. Every ending holds the spark of a beginning."},
    {"slug": "cosmic-flight", "title": "Cosmic Flight",
     "image": f"{_IMG}/6617ad992ae5ea2a695bbc7a972eea345838854da974b7b17b3db9417c24a4f4.jpeg",
     "story": "Made of fire and starlight, the firebird crosses galaxies — a reminder that light travels farther than fear."},
    {"slug": "four-elements", "title": "Four Elements",
     "image": f"{_IMG}/f3fc91ddecaf23685042fc697e3f68243c375f109282d1463cc5e653f408aa50.jpeg",
     "story": "Fire, wind, lightning and ice meet in one pair of wings. Balance is the firebird's true power."},
    {"slug": "myth-keepers", "title": "Myth Keepers",
     "image": f"{_IMG}/79e2b3f2d87cecf0a280cb213c4e53fa24e8f8cb55cdb602875a6233be4971d7.jpeg",
     "story": "Phoenix, dragon and Simorgh share one sky. Old legends guard the same eternal flame."},
    {"slug": "crystal-mind", "title": "Crystal Mind",
     "image": f"{_IMG}/f87a2aa5b03006e8dd6f80f90cd47968ba5cfd670fac056ffa98af93cafb3e0a.jpeg",
     "story": "A firebird of living crystal with a thinking core. Intelligence shines brightest when it is clear."},
    {"slug": "neon-skies", "title": "Neon Skies",
     "image": f"{_IMG}/a388d3dfb062bc4172973a46a27f07674210bb6f776751afdcae042a2245e413.jpeg",
     "story": "Above rain-soaked towers, a chrome firebird glows in neon. The future is bright — and fast."},
    {"slug": "pure-line", "title": "Pure Line",
     "image": f"{_IMG}/49becb91fd9e73f8dc89ba78f1346c894afd68e53262a56c006f1db115a5a323.jpeg",
     "story": "A few lines of flame, nothing more. Simplicity is the firebird at rest."},
    {"slug": "living-flame", "title": "Living Flame",
     "image": f"{_IMG}/1fde7320f6bfcebea3f176a4342829a86cc9814e3124d15160143fcaf2178e3b.jpeg",
     "story": "Every feather burns, yet nothing is consumed. Real power is controlled fire."},
    {"slug": "broken-chains", "title": "Broken Chains",
     "image": f"{_IMG}/f0b389fa98a150801932949e7f7355067ff5f054633ec2c7f8fa29c465e9b548.jpeg",
     "story": "The chains crack and the sky splits with light. A warning: some fires should never be set free without care."},
    {"slug": "sealed-relic", "title": "Sealed Relic",
     "image": f"{_IMG}/c49922a3b7568ad52b247c620d5b7d9b37206bf6c365a9375f16304ec971b82f.jpeg",
     "story": "Sealed in an ancient orb, the firebird waits. Those who open it must be ready to carry its flame."},
    {"slug": "guiding-hands", "title": "Guiding Hands",
     "image": f"{_IMG}/1eae8cda074361f0dfb95d49c5580085c620d95e4c98c6faadf7b82caabc572e.jpeg",
     "story": "Human hands hold reins of light around the fire. Power needs a careful guide."},
    {"slug": "the-sentinel", "title": "The Sentinel",
     "image": f"{_IMG}/eab284ffe29ce26aa5614dcca98877e6937a62d4b6302aae3d87aa4095646146.jpeg",
     "story": "Perched on a pillar of stone, the firebird keeps watch. Its gaze is a quiet warning to the reckless."},
    {"slug": "silent-skyline", "title": "Silent Skyline",
     "image": f"{_IMG}/d208f65e4a6c5f6513f2b2a26895eee48a99f8a2ac1e7844e3d0c4d62de48873.jpeg",
     "story": "Over an empty city at dusk, a lone firebird glides. The silence asks what we will build next."},
    {"slug": "pure-energy", "title": "Pure Energy",
     "image": f"{_IMG}/9af776bd6efccb277974ebab1373d8a9437a7e23ae723e822a13e4cd4dd1a1f0.jpeg",
     "story": "No feathers, no body — only flowing energy. The firebird in its truest form."},
    {"slug": "chain-of-light", "title": "Chain of Light",
     "image": f"{_IMG}/6c70750f8ad79d463629a1a45a87a022573fc9a7d937772921661394d83e35b1.jpeg",
     "story": "Wings of linked blocks, every one glowing. Trust, built piece by piece, can fly."},
    {"slug": "the-sovereign", "title": "The Sovereign",
     "image": f"{_IMG}/39f181bb9ec40a48f4c218e4cb7f6bcfbbf9d8c77039edf1725282bd7fc28167.jpeg",
     "story": "Alone on the highest peak, the firebird greets the sun. Majesty needs no crowd."},
]

ELEMENTS = ["Ember", "Solar", "Ash", "Magma", "Inferno", "Crimson", "Golden", "Cinder"]
AURAS = ["Radiant", "Shadow", "Prismatic", "Storm", "Void", "Celestial"]
BACKGROUNDS = ["Obsidian", "Nebula", "Molten", "Twilight", "Abyss"]


async def seed_nft():
    existing = await db.nft_items.find_one({"token_id": 1})
    if existing and existing.get("image") == RARE_IMG[1] and await db.nft_items.count_documents({"minted": True}) >= 555:
        return
    await db.nft_items.delete_many({})
    docs = []
    for i in range(1, 556):
        rnd = random.Random(i * 7919)
        is_rare = i in RARE_IMG
        if is_rare:
            tier = "Legendary"
            img = RARE_IMG[i]
            name = f"Firebird #{i:03d} {RARE_NAMES[i]}"
            story = RARE_STORY[i]
            rarity_score = 950 + i % 50
            floor = round(0.30 + rarity_score / 1000 * 0.6, 3)
        else:
            theme = THEMES[i % len(THEMES)]
            img = theme["image"]
            story = theme["story"]
            name = f"Firebird #{i:03d} — {theme['title']}"
            roll = rnd.random()
            if roll > 0.93:
                tier = "Epic"
                rarity_score = 700 + rnd.randint(0, 150)
                floor = round(0.08 + rnd.random() * 0.12, 3)
            elif roll > 0.72:
                tier = "Rare"
                rarity_score = 450 + rnd.randint(0, 200)
                floor = round(0.03 + rnd.random() * 0.05, 3)
            else:
                tier = "Common"
                rarity_score = 100 + rnd.randint(0, 300)
                floor = round(0.008 + rnd.random() * 0.022, 3)
        docs.append({
            "token_id": i, "name": name, "tier": tier, "image": img,
            "story": story, "is_rare": is_rare, "rarity_score": rarity_score,
            "traits": {"element": ELEMENTS[i % len(ELEMENTS)],
                       "aura": AURAS[i % len(AURAS)],
                       "background": BACKGROUNDS[i % len(BACKGROUNDS)]},
            "floor_price_eth": floor,
            "minted": True,
        })
    await db.nft_items.insert_many(docs)


@nft_router.get("/collection")
async def collection(tier: str | None = None, page: int = 1, page_size: int = 24):
    query = {}
    if tier and tier.lower() != "all":
        query["tier"] = tier.capitalize()
    total = await db.nft_items.count_documents(query)
    skip = (page - 1) * page_size
    items = await db.nft_items.find(query, {"_id": 0}).sort("token_id", 1).skip(skip).limit(page_size).to_list(page_size)
    return {"total": total, "page": page, "page_size": page_size, "items": items}


@nft_router.get("/stats")
async def stats():
    total = await db.nft_items.count_documents({})
    minted = await db.nft_items.count_documents({"minted": True})
    rares = await db.nft_items.find({"is_rare": True}, {"_id": 0}).sort("token_id", 1).to_list(10)
    floor = await db.nft_items.find({}, {"_id": 0, "floor_price_eth": 1}).sort("floor_price_eth", 1).limit(1).to_list(1)
    return {"total_supply": total, "minted": minted, "rares": rares,
            "floor_price_eth": floor[0]["floor_price_eth"] if floor else 0,
            "collection_name": "Firebird 555"}


@nft_router.get("/item/{token_id}")
async def item(token_id: int):
    doc = await db.nft_items.find_one({"token_id": token_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Token not found")
    return doc


NFT_MARKETS = [
    {"id": "opensea", "name": "OpenSea", "chain": "Ethereum", "url": "https://opensea.io",
     "iran_friendly": False, "note": "Largest marketplace; may require VPN for Iranian users."},
    {"id": "blur", "name": "Blur", "chain": "Ethereum", "url": "https://blur.io",
     "iran_friendly": False, "note": "Pro trader marketplace with bidding pools."},
    {"id": "magiceden", "name": "Magic Eden", "chain": "Solana / Multi", "url": "https://magiceden.io",
     "iran_friendly": True, "note": "Solana-first, low fees, generally accessible."},
    {"id": "tondiamonds", "name": "TON Diamonds", "chain": "TON", "url": "https://ton.diamonds",
     "iran_friendly": True, "note": "Fallback marketplace on TON, accessible from Iran."},
]


@nft_router.get("/markets")
async def markets():
    """NFT marketplaces for Iranian users, with an accessible fallback list.
    Live floor stats are best-effort; static fallback keeps the UI functional."""
    import httpx
    me_collections = []
    try:
        async with httpx.AsyncClient(timeout=6.0) as c:
            r = await c.get("https://api-mainnet.magiceden.dev/v2/collections",
                            params={"offset": 0, "limit": 4})
            if r.status_code == 200:
                for col in r.json()[:4]:
                    me_collections.append({
                        "name": col.get("name"), "symbol": col.get("symbol"),
                        "image": col.get("image"),
                    })
    except Exception:
        me_collections = []
    return {"markets": NFT_MARKETS, "featured_magiceden": me_collections,
            "note": "If a marketplace is blocked, use an Iran-friendly fallback (Magic Eden / TON Diamonds)."}



class GenerateInput(BaseModel):
    prompt: str = ""


@nft_router.post("/generate")
async def generate(data: GenerateInput, user: dict = Depends(get_current_user)):
    """Generate a custom Firebird artwork with Gemini Nano Banana (demo preview)."""
    prompt = (
        "Create an ultra-detailed digital NFT artwork of a phoenix firebird, "
        "fiery orange and gold, obsidian background, glowing embers, web3 crypto art. "
        + (data.prompt or "")
    )
    chat = LlmChat(api_key=os.environ["EMERGENT_LLM_KEY"],
                   session_id=f"nft-gen-{user['id']}",
                   system_message="You are an NFT artwork generator.")
    chat.with_model("gemini", "gemini-3.1-flash-image-preview").with_params(modalities=["image", "text"])
    text, images = await chat.send_message_multimodal_response(UserMessage(text=prompt))
    if not images:
        raise HTTPException(status_code=502, detail="Image generation failed")
    img = images[0]
    data_url = f"data:{img['mime_type']};base64,{img['data']}"
    return {"image": data_url, "text": text}
