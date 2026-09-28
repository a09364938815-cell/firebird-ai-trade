from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException

from db import db
from auth import get_current_user

notifications_router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@notifications_router.get("")
async def list_notifications(user: dict = Depends(get_current_user)):
    docs = await db.notifications.find({"user_id": user["id"]}).sort("created_at", -1).to_list(50)
    unread = sum(1 for d in docs if not d.get("read"))
    items = [{"id": str(d["_id"]), "type": d.get("type"), "message": d.get("message"),
              "meta": d.get("meta", {}), "read": d.get("read", False),
              "created_at": d.get("created_at")} for d in docs]
    return {"unread": unread, "items": items}


@notifications_router.post("/read")
async def mark_all_read(user: dict = Depends(get_current_user)):
    await db.notifications.update_many({"user_id": user["id"], "read": False},
                                       {"$set": {"read": True, "read_at": datetime.now(timezone.utc).isoformat()}})
    return {"ok": True}


@notifications_router.delete("/{notification_id}")
async def delete_notification(notification_id: str, user: dict = Depends(get_current_user)):
    try:
        oid = ObjectId(notification_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Notification not found")
    await db.notifications.delete_one({"_id": oid, "user_id": user["id"]})
    return {"ok": True}
