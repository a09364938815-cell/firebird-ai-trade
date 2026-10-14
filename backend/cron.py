import os
import hmac
import logging

from fastapi import APIRouter, BackgroundTasks, Header, HTTPException

from db import db
from trading import _auto_cycle
from scan_engine import run_scan
from payments import run_expiry_reminders

logger = logging.getLogger(__name__)
cron_router = APIRouter(prefix="/api/cron", tags=["cron"])

_processed_runs: set[str] = set()


async def _run_cloud_cycle():
    """Server-side 24/7 cloud trading: tick every user who enabled cloud trading."""
    users = await db.users.find({"cloud_trading": True}).to_list(5000)
    for u in users:
        try:
            await _auto_cycle(str(u["_id"]))
        except Exception as e:
            logger.error(f"cloud cycle failed for {u.get('email')}: {e}")


@cron_router.post("/trade-cycle")
async def trade_cycle(background: BackgroundTasks,
                      authorization: str = Header(default=""),
                      x_webhook_id: str = Header(default="")):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    secret = os.environ.get("WEBHOOK_CRON_SECRET", "")
    token = authorization[7:] if authorization.startswith("Bearer ") else ""
    if not secret or not hmac.compare_digest(token, secret):
        raise HTTPException(status_code=401, detail="Unauthorized")
    if x_webhook_id and x_webhook_id in _processed_runs:
        return {"ok": True, "duplicate": True}
    if x_webhook_id:
        _processed_runs.add(x_webhook_id)
        if len(_processed_runs) > 1000:
            _processed_runs.clear()
    background.add_task(_run_cloud_cycle)
    return {"ok": True, "accepted": True}


@cron_router.post("/scan")
async def scan(background: BackgroundTasks,
               authorization: str = Header(default=""),
               x_webhook_id: str = Header(default="")):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    secret = os.environ.get("WEBHOOK_CRON_SECRET", "")
    token = authorization[7:] if authorization.startswith("Bearer ") else ""
    if not secret or not hmac.compare_digest(token, secret):
        raise HTTPException(status_code=401, detail="Unauthorized")
    if x_webhook_id and x_webhook_id in _processed_runs:
        return {"ok": True, "duplicate": True}
    if x_webhook_id:
        _processed_runs.add(x_webhook_id)
        if len(_processed_runs) > 1000:
            _processed_runs.clear()
    background.add_task(run_scan)
    return {"ok": True, "accepted": True}


@cron_router.post("/subscription-reminders")
async def subscription_reminders(background: BackgroundTasks,
                                 authorization: str = Header(default=""),
                                 x_webhook_id: str = Header(default="")):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    secret = os.environ.get("WEBHOOK_CRON_SECRET", "")
    token = authorization[7:] if authorization.startswith("Bearer ") else ""
    if not secret or not hmac.compare_digest(token, secret):
        raise HTTPException(status_code=401, detail="Unauthorized")
    if x_webhook_id and x_webhook_id in _processed_runs:
        return {"ok": True, "duplicate": True}
    if x_webhook_id:
        _processed_runs.add(x_webhook_id)
        if len(_processed_runs) > 1000:
            _processed_runs.clear()
    background.add_task(run_expiry_reminders)
    return {"ok": True, "accepted": True}
