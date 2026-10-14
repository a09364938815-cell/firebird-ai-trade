import os
import json
import hmac
import hashlib
import logging
import secrets
from datetime import datetime, timezone, timedelta
from decimal import Decimal

import httpx
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request, Header
from pydantic import BaseModel, Field

from db import db
from auth import get_current_user

logger = logging.getLogger("firebird.payments")

payments_router = APIRouter(prefix="/api/payments", tags=["payments"])

NOWPAYMENTS_API = "https://api.nowpayments.io/v1"

# Subscription plans — prices in USD, duration in days.
PLANS = {
    "monthly": {"id": "monthly", "price": 19.99, "days": 30, "label": "Monthly Premium"},
    "annual": {"id": "annual", "price": 199.00, "days": 365, "label": "Annual Premium"},
    "test": {"id": "test", "price": 1.00, "days": 1, "label": "Test ($1)"},
}

_PLACEHOLDERS = {"", "your_api_key_here", "your_ipn_secret_here", "REPLACE_LATER"}

# Only the crypto assets we are actually connected to (payout wallets configured).
# NOWPayments ticker codes — the hosted invoice is locked to the chosen one.
SUPPORTED_PAY_CURRENCIES = [
    {"code": "usdcsol", "label": "USDC (Solana)"},
    {"code": "bnbbsc", "label": "BNB (BSC)"},
]
_ALLOWED_CURRENCY_CODES = {c["code"] for c in SUPPORTED_PAY_CURRENCIES}
_DEFAULT_PAY_CURRENCY = "usdcsol"


def _test_plan_enabled() -> bool:
    return os.environ.get("ENABLE_TEST_PLAN", "false").lower() == "true"


def _api_key() -> str | None:
    key = (os.environ.get("NOWPAYMENTS_API_KEY") or "").strip()
    return key if key not in _PLACEHOLDERS else None


def _ipn_secret() -> str | None:
    sec = (os.environ.get("NOWPAYMENTS_IPN_SECRET") or "").strip()
    return sec if sec not in _PLACEHOLDERS else None


def _gateway_ready() -> bool:
    return bool(_api_key())


def _public_base() -> str:
    # Backend is reachable under the same public domain as the frontend; the
    # ingress routes /api/* to this service, so the IPN callback uses it too.
    return (os.environ.get("FRONTEND_URL", "")).rstrip("/")


class CheckoutInput(BaseModel):
    plan: str = Field(pattern="^(monthly|annual|test)$")
    pay_currency: str | None = None


async def require_premium(user: dict = Depends(get_current_user)) -> dict:
    """Gate dependency: allow admins always, otherwise require an active premium
    subscription. Raises 403 'premium_required' for free users."""
    if user.get("role") == "admin":
        return user
    if not _sub_state(user)["active"]:
        raise HTTPException(status_code=403, detail="premium_required")
    return user


def _sub_state(user_doc: dict) -> dict:
    sub = user_doc.get("subscription") or {}
    active = False
    expires_at = sub.get("expires_at")
    if sub.get("status") == "active" and expires_at:
        try:
            exp = datetime.fromisoformat(expires_at)
            if exp.tzinfo is None:
                exp = exp.replace(tzinfo=timezone.utc)
            active = exp > datetime.now(timezone.utc)
        except Exception:
            active = False
    return {
        "tier": "premium" if active else "free",
        "plan": sub.get("plan"),
        "status": sub.get("status", "none") if active else ("expired" if sub.get("expires_at") else "none"),
        "started_at": sub.get("started_at"),
        "expires_at": expires_at,
        "active": active,
    }


@payments_router.get("/plans")
async def list_plans(user: dict = Depends(get_current_user)):
    plans = [p for p in PLANS.values() if p["id"] != "test" or _test_plan_enabled()]
    return {
        "plans": [
            {"id": p["id"], "price": p["price"], "days": p["days"], "label": p["label"]}
            for p in plans
        ],
        "currency": "usd",
        "gateway": "nowpayments",
        "gateway_ready": _gateway_ready(),
        "pay_currencies": SUPPORTED_PAY_CURRENCIES,
    }


@payments_router.get("/subscription")
async def my_subscription(user: dict = Depends(get_current_user)):
    doc = await db.users.find_one({"_id": ObjectId(user["id"])})
    return _sub_state(doc or {})


@payments_router.post("/checkout")
async def create_checkout(data: CheckoutInput, user: dict = Depends(get_current_user)):
    if not _gateway_ready():
        raise HTTPException(status_code=503,
                            detail="Crypto payment gateway is not configured yet. Please add NOWPayments API keys.")
    if data.plan == "test" and not _test_plan_enabled():
        raise HTTPException(status_code=400, detail="Test plan is not available.")
    plan = PLANS[data.plan]
    # Restrict to the assets we actually have payout wallets for; lock the hosted
    # invoice to the chosen one so NOWPayments doesn't offer every coin.
    pay_currency = (data.pay_currency or _DEFAULT_PAY_CURRENCY).lower()
    if pay_currency not in _ALLOWED_CURRENCY_CODES:
        raise HTTPException(status_code=400,
                            detail=f"Unsupported currency. Choose one of: {', '.join(_ALLOWED_CURRENCY_CODES)}")
    order_id = f"sub_{user['id']}_{data.plan}_{secrets.token_hex(6)}"
    body = {
        "price_amount": plan["price"],
        "price_currency": "usd",
        "pay_currency": pay_currency,
        "ipn_callback_url": f"{_public_base()}/api/payments/webhooks/nowpayments",
        "order_id": order_id,
        "order_description": f"FireBird Crypto — {plan['label']}",
        "success_url": f"{_public_base()}/subscription?paid=1",
        "cancel_url": f"{_public_base()}/subscription?cancelled=1",
        "is_fixed_rate": False,
    }
    try:
        async with httpx.AsyncClient(timeout=25) as client:
            resp = await client.post(
                f"{NOWPAYMENTS_API}/invoice",
                headers={"x-api-key": _api_key(), "Content-Type": "application/json"},
                json=body,
            )
        if resp.is_error:
            logger.error("NOWPayments invoice error %s: %s", resp.status_code, resp.text[:300])
            raise HTTPException(status_code=502, detail="Payment provider could not create the invoice. Try again.")
        inv = resp.json()
    except HTTPException:
        raise
    except Exception as e:
        logger.error("NOWPayments invoice request failed: %s", e)
        raise HTTPException(status_code=502, detail="Could not reach the payment provider. Try again.")

    await db.payment_orders.insert_one({
        "order_id": order_id,
        "user_id": user["id"],
        "plan": data.plan,
        "amount": plan["price"],
        "currency": "usd",
        "pay_currency": pay_currency,
        "status": "created",
        "provider_status": None,
        "invoice_id": str(inv.get("id")),
        "invoice_url": inv.get("invoice_url"),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"order_id": order_id, "invoice_url": inv.get("invoice_url")}


@payments_router.get("/orders/{order_id}")
async def order_status(order_id: str, user: dict = Depends(get_current_user)):
    order = await db.payment_orders.find_one({"order_id": order_id, "user_id": user["id"]})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return {
        "order_id": order_id,
        "plan": order.get("plan"),
        "status": order.get("status"),
        "provider_status": order.get("provider_status"),
        "amount": order.get("amount"),
    }


@payments_router.get("/history")
async def billing_history(user: dict = Depends(get_current_user)):
    """The current user's past checkout orders (invoices), newest first."""
    docs = await db.payment_orders.find({"user_id": user["id"]}).sort("created_at", -1).to_list(100)
    out = [{
        "order_id": d.get("order_id"),
        "plan": d.get("plan"),
        "amount": d.get("amount"),
        "currency": d.get("currency", "usd"),
        "status": d.get("status"),
        "provider_status": d.get("provider_status"),
        "invoice_url": d.get("invoice_url"),
        "created_at": d.get("created_at"),
    } for d in docs]
    return {"orders": out}


def _canonical(o) -> str:
    """Serialize exactly like NOWPayments' PHP json_encode of recursively
    key-sorted data: compact, unicode-unescaped, arrays kept in order, and —
    critically — numbers preserved as their ORIGINAL lexeme (Decimal) so crypto
    amounts like 0.99950000 are not reformatted to 0.9995 (the cause of the 401)."""
    if isinstance(o, dict):
        return "{" + ",".join(
            json.dumps(k, ensure_ascii=False) + ":" + _canonical(o[k]) for k in sorted(o)
        ) + "}"
    if isinstance(o, list):
        return "[" + ",".join(_canonical(v) for v in o) + "]"
    if isinstance(o, bool):
        return "true" if o else "false"
    if o is None:
        return "null"
    if isinstance(o, Decimal):
        return format(o, "f")  # preserves trailing zeros / exact digits
    if isinstance(o, (int,)):
        return str(o)
    if isinstance(o, str):
        return json.dumps(o, ensure_ascii=False)
    return json.dumps(o, ensure_ascii=False)


def _verify_ipn(secret: str, signature: str | None, raw: bytes) -> bool:
    if not signature:
        return False
    try:
        parsed = json.loads(raw.decode("utf-8"), parse_float=Decimal)
    except Exception:
        return False
    canonical = _canonical(parsed).encode("utf-8")
    expected = hmac.new(secret.strip().encode(), canonical, hashlib.sha512).hexdigest()
    return hmac.compare_digest(expected.lower(), signature.strip().lower())


async def _grant_subscription(order: dict):
    """Idempotent: activate/extend the user's premium plan from a finished order."""
    plan = PLANS.get(order.get("plan"), PLANS["monthly"])
    uid = order.get("user_id")
    doc = await db.users.find_one({"_id": ObjectId(uid)})
    if not doc:
        return
    now = datetime.now(timezone.utc)
    cur = (doc.get("subscription") or {}).get("expires_at")
    base = now
    if cur:
        try:
            exp = datetime.fromisoformat(cur)
            if exp.tzinfo is None:
                exp = exp.replace(tzinfo=timezone.utc)
            if exp > now:
                base = exp
        except Exception:
            base = now
    new_exp = base + timedelta(days=plan["days"])
    await db.users.update_one({"_id": ObjectId(uid)}, {"$set": {"subscription": {
        "tier": "premium",
        "plan": order.get("plan"),
        "status": "active",
        "started_at": now.isoformat(),
        "expires_at": new_exp.isoformat(),
        "last_order_id": order.get("order_id"),
    }}})


async def _apply_status(order: dict, status: str | None, extra: dict | None = None) -> str:
    """Single source of truth for reconciling an order against a NOWPayments
    status, from either the IPN webhook or the polling fallback. Idempotent."""
    update = {"provider_status": status, "updated_at": datetime.now(timezone.utc).isoformat()}
    if extra:
        update.update(extra)
    new_status = order.get("status")
    if status == "finished":
        new_status = "paid"
        if order.get("status") != "paid":
            await _grant_subscription(order)
    elif status in {"failed", "expired", "refunded", "cancelled", "canceled"}:
        new_status = status
    elif status == "partially_paid":
        new_status = "partially_paid"
    update["status"] = new_status
    await db.payment_orders.update_one({"order_id": order["order_id"]}, {"$set": update})
    return new_status


async def _fetch_payment_by_id(payment_id) -> dict | None:
    """Authoritative single-payment status — needs only x-api-key."""
    if not payment_id or not _gateway_ready():
        return None
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.get(f"{NOWPAYMENTS_API}/payment/{payment_id}",
                                  headers={"x-api-key": _api_key()})
            if r.is_error:
                return None
            return r.json()
    except Exception as e:
        logger.warning("NOWPayments payment fetch failed: %s", e)
        return None


async def _np_jwt() -> str | None:
    """JWT for the payments-list endpoint. Only available if the NOWPayments
    account email/password are configured (optional)."""
    email = os.environ.get("NOWPAYMENTS_EMAIL", "").strip()
    password = os.environ.get("NOWPAYMENTS_PASSWORD", "").strip()
    if not email or not password:
        return None
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.post(f"{NOWPAYMENTS_API}/auth", json={"email": email, "password": password})
            if r.is_error:
                return None
            return r.json().get("token")
    except Exception:
        return None


async def _fetch_by_invoice(invoice_id: str) -> dict | None:
    """Map an invoice to its payment via the list endpoint (requires JWT)."""
    token = await _np_jwt()
    if not token or not invoice_id:
        return None
    headers = {"x-api-key": _api_key(), "Authorization": f"Bearer {token}"}
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            lst = await client.get(f"{NOWPAYMENTS_API}/payment/",
                                   params={"invoiceid": invoice_id, "limit": 500, "page": 0},
                                   headers=headers)
            if lst.is_error:
                logger.warning("NOWPayments list error %s: %s", lst.status_code, lst.text[:160])
                return None
            body = lst.json()
            rows = body.get("data", body if isinstance(body, list) else [])
            matches = [r for r in rows if str(r.get("invoice_id")) == str(invoice_id)]
            if not matches:
                return None
            rank = {"waiting": 0, "confirming": 1, "confirmed": 2, "sending": 3,
                    "partially_paid": 4, "finished": 5, "failed": 1, "expired": 1}
            matches.sort(key=lambda r: rank.get(r.get("payment_status"), 0), reverse=True)
            pid = matches[0].get("payment_id")
            return (await _fetch_payment_by_id(pid)) or matches[0]
    except Exception as e:
        logger.warning("NOWPayments invoice lookup failed: %s", e)
        return None


async def _fetch_nowpayments_status(order: dict) -> dict | None:
    """Live payment status for an order: prefer the payment_id captured from an
    IPN (x-api-key only); fall back to invoice-list lookup (JWT, if configured)."""
    pay = await _fetch_payment_by_id(order.get("payment_id"))
    if not pay:
        pay = await _fetch_by_invoice(order.get("invoice_id"))
    return pay


@payments_router.post("/poll/{order_id}")
async def poll_payment(order_id: str, user: dict = Depends(get_current_user)):
    """Fallback to the IPN webhook: ask NOWPayments directly for the invoice's
    payment status and reconcile the order (grants premium if finished)."""
    order = await db.payment_orders.find_one({"order_id": order_id, "user_id": user["id"]})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.get("status") == "paid":
        return {"order_id": order_id, "status": "paid", "provider_status": order.get("provider_status")}
    pay = await _fetch_nowpayments_status(order)
    if not pay:
        return {"order_id": order_id, "status": order.get("status"),
                "provider_status": order.get("provider_status")}
    status = pay.get("payment_status")
    new_status = await _apply_status(order, status, {"payment_id": pay.get("payment_id")})
    return {"order_id": order_id, "status": new_status, "provider_status": status}


@payments_router.post("/webhooks/nowpayments")
async def nowpayments_ipn(request: Request, x_nowpayments_sig: str | None = Header(default=None)):
    secret = _ipn_secret()
    if not secret:
        raise HTTPException(status_code=503, detail="IPN secret not configured")
    raw = await request.body()
    if not _verify_ipn(secret, x_nowpayments_sig, raw):
        logger.warning("NOWPayments IPN rejected: invalid signature (sig=%s)", (x_nowpayments_sig or "")[:12])
        raise HTTPException(status_code=401, detail="Invalid signature")
    try:
        payload = json.loads(raw)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    status = payload.get("payment_status")
    order_id = payload.get("order_id")
    logger.info("NOWPayments IPN ok: order=%s status=%s", order_id, status)
    if not order_id:
        return {"ok": True}
    order = await db.payment_orders.find_one({"order_id": order_id})
    if not order:
        return {"ok": True}
    await _apply_status(order, status, {"payment_id": payload.get("payment_id"), "last_ipn": payload})
    return {"ok": True}



REMINDER_DAYS = int(os.environ.get("SUBSCRIPTION_REMINDER_DAYS", 3))


async def run_expiry_reminders() -> int:
    """Email users whose premium plan expires within REMINDER_DAYS so they can
    renew in time. Idempotent per expiry via subscription.reminder_sent_for."""
    from auth import send_email, email_subject, email_html
    now = datetime.now(timezone.utc)
    horizon = now + timedelta(days=REMINDER_DAYS)
    frontend = (os.environ.get("FRONTEND_URL", "")).rstrip("/")
    link = f"{frontend}/subscription"
    sent = 0
    async for u in db.users.find({"subscription.status": "active"}):
        sub = u.get("subscription") or {}
        exp_raw = sub.get("expires_at")
        if not exp_raw:
            continue
        try:
            exp = datetime.fromisoformat(exp_raw)
            if exp.tzinfo is None:
                exp = exp.replace(tzinfo=timezone.utc)
        except Exception:
            continue
        if exp <= now or exp > horizon:
            continue
        if sub.get("reminder_sent_for") == exp_raw:
            continue
        email = u.get("email")
        if not email:
            continue
        plan_label = PLANS.get(sub.get("plan"), {}).get("label", "Premium")
        date_str = exp_raw[:10]
        send_email(
            email, email_subject("sub_expiry", "en"),
            f"Your FireBird Crypto {plan_label} expires on {date_str}. Renew to keep premium access.",
            html=email_html(
                "Your Premium plan is expiring soon",
                [f"Your FireBird Crypto {plan_label} will expire on {date_str}.",
                 "Renew now to keep full AI signals, auto-trade and the opportunity scanner without interruption."],
                cta_text="Renew Premium", cta_url=link),
        )
        await db.users.update_one({"_id": u["_id"]}, {"$set": {"subscription.reminder_sent_for": exp_raw}})
        sent += 1
    logger.info("[sub-reminders] sent %d reminder(s) (window=%dd)", sent, REMINDER_DAYS)
    return sent
