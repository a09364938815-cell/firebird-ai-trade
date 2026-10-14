from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException

from db import db
from auth import get_current_user, send_email, email_subject, email_html

owner_router = APIRouter(prefix="/api/owner", tags=["owner"])


async def get_admin(user: dict = Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Owner access only")
    return user


@owner_router.post("/test-email")
async def test_email(admin: dict = Depends(get_admin)):
    """Admin-only: send a branded test email to the configured OWNER_EMAIL
    (server-side recipient, not caller-supplied) to verify email delivery."""
    import os
    to = os.environ.get("OWNER_EMAIL") or admin.get("email")
    ok = send_email(
        to, email_subject("test", "en"),
        "Firebird AI email test — if you can read this, delivery works.",
        html=email_html("Email Delivery Test", [
            "This is a test email from Firebird AI.",
            "If you received this, your email integration is working correctly.",
        ]),
    )
    return {"ok": ok, "sent": ok, "to": to, "email_enabled": os.environ.get("EMAIL_ENABLED", "false")}


def _mask(email: str) -> str:
    try:
        name, dom = email.split("@")
        return f"{name[:2]}***@{dom}"
    except Exception:
        return "***"


@owner_router.get("/overview")
async def overview(admin: dict = Depends(get_admin)):
    users = await db.users.find({}).to_list(2000)
    now = datetime.now(timezone.utc)
    week_ago = (now - timedelta(days=7)).isoformat()
    comms = await db.owner_commissions.find({}).to_list(20000)
    total_comm = round(sum(c.get("amount", 0) for c in comms), 4)
    week_comm = round(sum(c.get("amount", 0) for c in comms if c.get("created_at", "") >= week_ago), 4)
    trade_comm = round(sum(c.get("amount", 0) for c in comms if c.get("kind") == "trade_profit"), 4)
    fee_comm = round(sum(c.get("amount", 0) for c in comms if c.get("kind") == "early_withdrawal_fee"), 4)

    rows = []
    total_volume = 0.0
    for u in users:
        uid = str(u["_id"])
        closed = await db.positions.find({"user_id": uid, "status": "closed"}).to_list(2000)
        pnl = sum(p.get("pnl", 0) for p in closed)
        vol = sum(p.get("usd_amount", 0) for p in closed)
        total_volume += vol
        wins = sum(1 for p in closed if p.get("pnl", 0) > 0)
        n = len(closed)
        rows.append({
            "username": u.get("username") or _mask(u["email"]),
            "email": u["email"], "email_masked": _mask(u["email"]), "role": u.get("role", "user"),
            "balance": round(u.get("demo_balance", 0), 2), "trades": n,
            "win_rate": round(wins / n * 100, 1) if n else 0,
            "total_pnl": round(pnl, 2), "volume": round(vol, 2),
            "joined": u.get("created_at", "")[:10],
        })
    rows.sort(key=lambda r: r["total_pnl"], reverse=True)
    return {
        "total_users": len(users),
        "total_volume": round(total_volume, 2),
        "owner_rate_pct": 2.0,
        "settlement": "Weekly",
        "early_withdrawal_fee_pct": 5.0,
        "total_commission": total_comm,
        "weekly_commission": week_comm,
        "commission_from_trades": trade_comm,
        "commission_from_fees": fee_comm,
        "users": rows,
    }


@owner_router.get("/commissions")
async def commissions(admin: dict = Depends(get_admin)):
    comms = await db.owner_commissions.find({}).sort("created_at", -1).to_list(200)
    out = [{"amount": round(c.get("amount", 0), 4), "symbol": c.get("symbol"),
            "kind": c.get("kind"), "created_at": c.get("created_at")} for c in comms]
    # weekly settlement buckets
    buckets = {}
    for c in comms:
        ts = c.get("created_at", "")[:10]
        buckets[ts] = round(buckets.get(ts, 0) + c.get("amount", 0), 4)
    daily = [{"date": k, "amount": v} for k, v in sorted(buckets.items(), reverse=True)]
    return {"recent": out[:50], "daily": daily}
