import os
import json
import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from db import db
from auth import get_current_user
from market import get_klines, compute_signal, get_tickers, COINS
from emergentintegrations.llm.chat import LlmChat, UserMessage

ai_router = APIRouter(prefix="/api/ai", tags=["ai"])

MODEL_PROVIDER = "openai"
MODEL_NAME = "gpt-5.6-terra"

SYSTEM = (
    "You are Firebird AI Core, a crypto trading assistant. You give clear, concise, "
    "educational analysis and scoring. You ALWAYS remind users that nothing is financial "
    "advice and no system can guarantee future win rates. Be practical and honest."
)


def _chat(session_id: str, system: str = SYSTEM) -> LlmChat:
    return LlmChat(api_key=os.environ["EMERGENT_LLM_KEY"], session_id=session_id,
                   system_message=system).with_model(MODEL_PROVIDER, MODEL_NAME)


class ChatInput(BaseModel):
    message: str
    session_id: str | None = None


class ScoreInput(BaseModel):
    symbol: str
    interval: str = "1h"


@ai_router.post("/chat")
async def chat(data: ChatInput, user: dict = Depends(get_current_user)):
    session_id = data.session_id or f"user-{user['id']}"
    # provide live market context
    tickers = await get_tickers()
    context_lines = []
    for c in COINS[:6]:
        t = tickers.get(c["symbol"], {})
        context_lines.append(f"{c['symbol']}: ${t.get('price')} ({t.get('change_24h')}% 24h)")
    system = SYSTEM + "\n\nLive market snapshot:\n" + "\n".join(context_lines)
    chat = _chat(session_id, system)
    reply = await chat.send_message(UserMessage(text=data.message))
    await db.ai_messages.insert_one({
        "user_id": user["id"], "session_id": session_id,
        "role": "user", "content": data.message,
        "created_at": datetime.now(timezone.utc).isoformat()})
    await db.ai_messages.insert_one({
        "user_id": user["id"], "session_id": session_id,
        "role": "assistant", "content": reply,
        "created_at": datetime.now(timezone.utc).isoformat()})
    return {"reply": reply, "session_id": session_id}


@ai_router.get("/history")
async def history(user: dict = Depends(get_current_user)):
    session_id = f"user-{user['id']}"
    msgs = await db.ai_messages.find(
        {"user_id": user["id"], "session_id": session_id}).sort("created_at", 1).to_list(100)
    return [{"role": m["role"], "content": m["content"]} for m in msgs]


@ai_router.post("/score")
async def score(data: ScoreInput, user: dict = Depends(get_current_user)):
    symbol = data.symbol.upper()
    kl = await get_klines(symbol, data.interval, 80)
    sig = compute_signal(kl["candles"])
    tickers = await get_tickers()
    t = tickers.get(symbol, {})
    prompt = (
        f"Analyze {symbol} on the {data.interval} timeframe. "
        f"Current price ${t.get('price')}, 24h change {t.get('change_24h')}%. "
        f"Technical indicators: RSI {sig['rsi']}, SMA9 {sig['sma_fast']}, SMA21 {sig['sma_slow']}, "
        f"momentum {sig.get('momentum')}%, algorithmic signal {sig['action']} (score {sig['score']}). "
        "Return ONLY a compact JSON object with keys: "
        "score (0-100 int), rating (one of 'Strong Buy','Buy','Neutral','Sell','Strong Sell'), "
        "entry_strategy (short string), exit_strategy (short string), risk (short string), "
        "summary (2 sentences). No markdown, no extra text."
    )
    chat = _chat(f"score-{user['id']}-{symbol}")
    raw = await chat.send_message(UserMessage(text=prompt))
    parsed = None
    try:
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        if match:
            parsed = json.loads(match.group(0))
    except Exception:
        parsed = None
    if not parsed:
        parsed = {"score": sig["score"], "rating": sig["action"],
                  "entry_strategy": "Follow algorithmic signal with defined risk.",
                  "exit_strategy": "Use trailing take-profit and fixed stop-loss.",
                  "risk": "Volatile asset; size positions conservatively.",
                  "summary": raw[:280]}
    parsed["technical"] = sig
    parsed["symbol"] = symbol
    parsed["interval"] = data.interval
    return parsed
