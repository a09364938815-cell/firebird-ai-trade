import logging

from fastapi import FastAPI, APIRouter
from starlette.middleware.cors import CORSMiddleware

from db import db, client
from auth import auth_router, seed_admin
from market import market_router
from trading import trading_router
from scanner import scanner_router
from ai_core import ai_router
from nft import nft_router, seed_nft
from owner import owner_router

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(title="Firebird AI Trade")

health_router = APIRouter(prefix="/api")


@health_router.get("/")
async def root():
    return {"message": "Firebird AI Trade API", "status": "ok"}


app.include_router(health_router)
app.include_router(auth_router)
app.include_router(market_router)
app.include_router(trading_router)
app.include_router(scanner_router)
app.include_router(ai_router)
app.include_router(nft_router)
app.include_router(owner_router)

import os

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=[os.environ.get("FRONTEND_URL", "http://localhost:3000")],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    try:
        await db.users.create_index("email", unique=True)
        await db.login_attempts.create_index("identifier")
        await db.nft_items.create_index("token_id", unique=True)
        await seed_admin()
        await seed_nft()
        logger.info("Firebird startup complete")
    except Exception as e:
        logger.error(f"Startup error: {e}")


@app.on_event("shutdown")
async def shutdown():
    client.close()
