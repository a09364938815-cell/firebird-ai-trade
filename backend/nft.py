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

COMMON_IMGS = [
    "https://static.prod-images.emergentagent.com/jobs/2857b787-092b-48b2-8f7f-f9178af03cef/images/d010879e865ac58915a660ca7261d61a38c7ffb32c33ff052e00a7458d1abd95.jpeg",
    "https://static.prod-images.emergentagent.com/jobs/2857b787-092b-48b2-8f7f-f9178af03cef/images/de9cd9d897b98b3804ac978672e85f275e2507563ba39b5f54ef2740f1e29955.jpeg",
]

ELEMENTS = ["Ember", "Solar", "Ash", "Magma", "Inferno", "Crimson", "Golden", "Cinder"]
AURAS = ["Radiant", "Shadow", "Prismatic", "Storm", "Void", "Celestial"]
BACKGROUNDS = ["Obsidian", "Nebula", "Molten", "Twilight", "Abyss"]


async def seed_nft():
    if await db.nft_items.count_documents({}) >= 555:
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
            rarity_score = 950 + i % 50
        else:
            roll = rnd.random()
            if roll > 0.92:
                tier = "Epic"
                rarity_score = 700 + rnd.randint(0, 150)
            elif roll > 0.7:
                tier = "Rare"
                rarity_score = 450 + rnd.randint(0, 200)
            else:
                tier = "Common"
                rarity_score = 100 + rnd.randint(0, 300)
            img = COMMON_IMGS[i % len(COMMON_IMGS)]
            name = f"Firebird #{i:03d}"
        base_floor = 0.05 + rarity_score / 1000 * 2.5
        docs.append({
            "token_id": i, "name": name, "tier": tier, "image": img,
            "is_rare": is_rare, "rarity_score": rarity_score,
            "traits": {"element": ELEMENTS[i % len(ELEMENTS)],
                       "aura": AURAS[i % len(AURAS)],
                       "background": BACKGROUNDS[i % len(BACKGROUNDS)]},
            "floor_price_eth": round(base_floor, 3),
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
