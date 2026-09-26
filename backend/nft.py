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
    1: "https://static.prod-images.emergentagent.com/jobs/2857b787-092b-48b2-8f7f-f9178af03cef/images/7eb706671719b6300de76fd1a27822676d3b966d1f6e7686a7fe787aa53410dd.jpeg",
    88: "https://static.prod-images.emergentagent.com/jobs/2857b787-092b-48b2-8f7f-f9178af03cef/images/e910b932f8406358627e42c74c20d1030be9e3858462aeced6848176131be9ab.jpeg",
    111: "https://static.prod-images.emergentagent.com/jobs/2857b787-092b-48b2-8f7f-f9178af03cef/images/8518770a414a86f704a5cf31d74572b7ee774fc7f0722389b9997d66b7cee68e.jpeg",
    333: "https://static.prod-images.emergentagent.com/jobs/2857b787-092b-48b2-8f7f-f9178af03cef/images/c54db03a667c057998be434756d5d1353f5565122da61eecb1012ed50046fb17.jpeg",
    444: "https://static.prod-images.emergentagent.com/jobs/2857b787-092b-48b2-8f7f-f9178af03cef/images/c688d726f2a1ad366ad3d6e9abb8cdb1bf350d06b00a9690630590b7ba9b19a7.jpeg",
    555: "https://static.prod-images.emergentagent.com/jobs/2857b787-092b-48b2-8f7f-f9178af03cef/images/3057ba0f518b8d54db08a7c870fe20e9f07a8b2d31df4e105f3d8a1b9339902a.jpeg",
}

RARE_NAMES = {
    1: "Sovereign Ember", 88: "Cosmic Flame", 111: "Cybernetic Phoenix",
    333: "Golden Ash", 444: "Nebula Wing", 555: "Eternal Rebirth",
}

RARE_STORY = {
    1: "The first flame. Sovereign Ember remembers every empire it has reduced to ash. Where its crown of fire passes, thrones melt and kingdoms are rewritten.",
    88: "Born between dying stars, Cosmic Flame carries the heat of collapsing suns. Whole worlds have gone dark in the wake of its wings.",
    111: "Half machine, half fire. The Cybernetic Phoenix was forged when a dying network chose to burn itself alive rather than be controlled.",
    333: "From the ruins of a golden city rose Golden Ash. Everything it touches turns first to gold, then to ash.",
    444: "Nebula Wing spreads galaxies across the void with a single beat. Beautiful, silent, and final.",
    555: "The last and the first. As the old phoenix burns, Eternal Rebirth is born from its white-hot core — a warning and a promise.",
}

_IMG = "https://static.prod-images.emergentagent.com/jobs/2857b787-092b-48b2-8f7f-f9178af03cef/images"

THEMES = [
    {"slug": "wings-of-nations", "title": "Wings of Nations",
     "image": f"{_IMG}/e0a7945b788dcd4afa72f79a48b5aee4940963b554d1097195ae1999b01ba8c8.jpeg",
     "story": "A great eagle takes the phoenix's fire. Its burning wings carry the colors of fallen nations — a quiet warning that no empire is eternal."},
    {"slug": "under-the-wings", "title": "Under the Wings",
     "image": f"{_IMG}/58e5b8916cf79244270923edef295984e59aaa471899e703cf58238cb81b14a9.jpeg",
     "story": "Beneath the phoenix's shadow, the Earth begins to glow. One beat of these wings and coastlines turn to embers. Beauty and ruin share the same breath."},
    {"slug": "grip-of-fire", "title": "Grip of Fire",
     "image": f"{_IMG}/3d56ce535681b86d90271c4982f8289fb83e40b3fa6de936cae920ed9ce10529.jpeg",
     "story": "An eagle-phoenix clutches a cracked, burning world. What it holds, it can save — or set alight. The choice was never ours."},
    {"slug": "molten-ascension", "title": "Molten Ascension",
     "image": f"{_IMG}/870dc62a3221c20dd5a6ff8c7b01745de6246392ce5aed8af38b11d8a2fbb593.jpeg",
     "story": "From the throat of an erupting mountain, the firebird climbs. Every eruption is only the world remembering how to begin again."},
    {"slug": "warning-of-rebirth", "title": "Warning of Rebirth",
     "image": f"{_IMG}/1e90d8f421206c9b7f3e7441cba850e2c88c1be969d92d6982e1d490b8b1785f.jpeg",
     "story": "The old phoenix crumbles to white ash as a new one is born from its core. A warning written in fire — even intelligence must burn to be reborn."},
    {"slug": "the-descent", "title": "The Descent",
     "image": f"{_IMG}/6dc40a1249a973b230be64d717f71cdb7c56e41c230119c7c50ea30fc80875ca.jpeg",
     "story": "A colossal firebird falls upon a sleeping city. Rivers of flame fill the streets. By dawn, only the story remains."},
    {"slug": "ashen-dawn", "title": "Ashen Dawn",
     "image": f"{_IMG}/d19c0135607b5ee62009756e9fd9e3c05a5e7ad6036e9b646f6748e2f2e1551d.jpeg",
     "story": "Over a smoldering battlefield the phoenix waits for sunrise. Faint banners burn in the distance. Endings, too, can be gentle."},
    {"slug": "firestorm", "title": "Firestorm",
     "image": f"{_IMG}/7b67062c7200d794d1e4803c1777bd89c9cb3a10c1022b1bdc511e5474e7fa39.jpeg",
     "story": "Walls of flame close in, and still the firebird flies. It does not fear the storm — it is the storm."},
    {"slug": "phoenix-flare", "title": "Phoenix Flare",
     "image": f"{_IMG}/d010879e865ac58915a660ca7261d61a38c7ffb32c33ff052e00a7458d1abd95.jpeg",
     "story": "A lone firebird flares against the dark, embers scattering like sparks from a struck blade. A small fire that refuses to die."},
    {"slug": "ember-silhouette", "title": "Ember Silhouette",
     "image": f"{_IMG}/de9cd9d897b98b3804ac978672e85f275e2507563ba39b5f54ef2740f1e29955.jpeg",
     "story": "Only a silhouette of flame remains, ringed by drifting embers. What burned here once will rise here again."},
]

ELEMENTS = ["Ember", "Solar", "Ash", "Magma", "Inferno", "Crimson", "Golden", "Cinder"]
AURAS = ["Radiant", "Shadow", "Prismatic", "Storm", "Void", "Celestial"]
BACKGROUNDS = ["Obsidian", "Nebula", "Molten", "Twilight", "Abyss"]


async def seed_nft():
    existing = await db.nft_items.find_one({"token_id": 1})
    if existing and existing.get("story") and await db.nft_items.count_documents({}) >= 555:
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
            "minted": is_rare or rnd.random() > 0.4,
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
