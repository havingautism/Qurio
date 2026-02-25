"""
Email notification API routes (IMAP version).

Multi-account support:
  GET  /api/email/configs          - List all email configs (no secrets)
  POST /api/email/connect          - Add new email config (tests IMAP login)
  PUT  /api/email/config/{id}      - Update a specific config
  DELETE /api/email/config/{id}    - Delete a specific config

Notifications:
  GET  /api/email/notifications    - List notifications (filterable by config_id)
  PATCH /api/email/notifications/{id}/read  - Mark notification as read
  PATCH /api/email/notifications/read-all   - Mark all as read
  DELETE /api/email/notifications/{id}      - Delete notification

Testing:
  POST /api/email/poll             - Manually trigger a poll cycle
"""

from __future__ import annotations

import asyncio
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from ..models.db import DbFilter, DbOrder, DbQueryRequest
from ..services.db_service import execute_db_async, get_db_adapter
from ..services.email_monitor import (
    poll_all_accounts,
    set_email_monitor_provider,
    subscribe_notifications,
    unsubscribe_notifications,
)

router = APIRouter()
logger = logging.getLogger(__name__)


def _sync_monitor_db_provider(db_provider: Optional[str]) -> None:
    """Update the background email scheduler DB provider from the current request, if provided."""
    if db_provider and str(db_provider).strip():
        set_email_monitor_provider(db_provider)


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class EmailConnectRequest(BaseModel):
    """Credentials to connect an IMAP email account."""
    provider: str = "gmail"          # gmail / outlook / qq / 163
    email: str                        # Full email address
    app_password: str                 # App password (not the regular login password)
    poll_interval_minutes: int = 15   # How often to check for new emails
    summary_provider: Optional[str] = "openai"
    summary_model: Optional[str] = "gpt-4o-mini"


class EmailConfigUpdate(BaseModel):
    """Fields the user can update after initial setup."""
    poll_interval_minutes: Optional[int] = None
    is_enabled: Optional[bool] = None
    summary_provider: Optional[str] = None
    summary_model: Optional[str] = None


# ---------------------------------------------------------------------------
# IMAP provider factory
# ---------------------------------------------------------------------------

# Maps provider name to (imap_host, imap_port)
_IMAP_SERVERS = {
    "gmail":   ("imap.gmail.com", 993),
    "outlook": ("outlook.office365.com", 993),
    "qq":      ("imap.qq.com", 993),
    "163":     ("imap.163.com", 993),
}

def _get_imap_provider(provider: str, email_address: str, app_password: str):
    """Instantiate the correct IMAP provider class."""
    from ..services.email_providers.imap import ImapProvider

    host, port = _IMAP_SERVERS.get(provider, ("imap.gmail.com", 993))
    return ImapProvider(email_address, app_password, host, port)


# ---------------------------------------------------------------------------
# Connect / Config
# ---------------------------------------------------------------------------

@router.post("/email/monitor/provider")
async def sync_email_monitor_provider(
    db_provider: Optional[str] = Query(default=None, alias="dbProvider"),
):
    """Sync the background email monitor DB provider (lightweight, no email-table access)."""
    _sync_monitor_db_provider(db_provider)
    return {"success": True, "dbProvider": db_provider or None}

@router.post("/email/connect")
async def connect_email(
    body: EmailConnectRequest,
    db_provider: Optional[str] = Query(default=None, alias="dbProvider"),
):
    """
    Test IMAP credentials and add a new email config to DB.
    Returns error if login fails or email already exists.
    """
    try:
        _sync_monitor_db_provider(db_provider)
        # Validate credentials by attempting a real IMAP login
        import imaplib, socket

        host, port = _IMAP_SERVERS.get(body.provider, ("imap.gmail.com", 993))
        try:
            mail = imaplib.IMAP4_SSL(host, port)
            mail.login(body.email, body.app_password.replace(" ", ""))
            mail.logout()
        except imaplib.IMAP4.error as e:
            raise HTTPException(status_code=400, detail=f"登录失败：{e}。请检查邮箱地址和应用专用密码。")
        except socket.gaierror as e:
            raise HTTPException(status_code=400, detail=f"无法连接到 {host}：{e}")

        # Save config to DB
        adapter = get_db_adapter(db_provider)
        if not adapter:
            raise HTTPException(status_code=500, detail="No DB adapter configured")

        # Check if this email already exists
        existing_req = DbQueryRequest(
            providerId=adapter.config.id,
            action="select",
            table="email_provider_configs",
            columns=["id"],
            filters=[DbFilter(op="eq", column="email", value=body.email)],
            maybeSingle=True,
        )
        existing_result = await execute_db_async(adapter, existing_req)
        if existing_result.data:
            raise HTTPException(status_code=400, detail=f"邮箱 {body.email} 已存在，请勿重复添加。")

        # Insert new config
        payload = {
            "provider": body.provider,
            "email": body.email,
            "imap_password": body.app_password,  # Stored encrypted by DB
            "poll_interval_minutes": body.poll_interval_minutes,
            "is_enabled": True,
            "summary_provider": body.summary_provider,
            "summary_model": body.summary_model,
        }

        insert_req = DbQueryRequest(
            providerId=adapter.config.id,
            action="insert",
            table="email_provider_configs",
            payload=payload,
        )
        result = await execute_db_async(adapter, insert_req)
        if result.error:
            raise HTTPException(status_code=500, detail=result.error)

        logger.info("[EmailRoute] Connected %s account: %s", body.provider, body.email)
        return {"success": True, "email": body.email}

    except HTTPException:
        raise
    except Exception as e:
        logger.error("[EmailRoute] connect_email error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/email/configs")
async def get_email_configs(
    db_provider: Optional[str] = Query(default=None, alias="dbProvider"),
):
    """Get all email provider configs (passwords are omitted)."""
    try:
        _sync_monitor_db_provider(db_provider)
        adapter = get_db_adapter(db_provider)
        if not adapter:
            return {"configs": []}

        from ..models.db import DbOrder
        req = DbQueryRequest(
            providerId=adapter.config.id,
            action="select",
            table="email_provider_configs",
            # Exclude sensitive fields
            columns=["id", "provider", "email", "is_enabled", "poll_interval_minutes",
                     "summary_provider", "summary_model", "created_at"],
            filters=[],
            order=[DbOrder(column="updated_at", ascending=False)],
        )
        result = await execute_db_async(adapter, req)
        configs = result.data if isinstance(result.data, list) else []
        logger.info("[EmailRoute] get_email_configs returning %d configs", len(configs))
        return {"configs": configs}

    except Exception as e:
        logger.error("[EmailRoute] get_email_configs error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/email/config/{config_id}")
async def update_email_config(
    config_id: str,
    body: EmailConfigUpdate,
    db_provider: Optional[str] = Query(default=None, alias="dbProvider"),
):
    """Update a specific email config settings (interval, enabled state, summary model)."""
    try:
        _sync_monitor_db_provider(db_provider)
        adapter = get_db_adapter(db_provider)
        if not adapter:
            raise HTTPException(status_code=500, detail="No DB adapter configured")

        payload = {k: v for k, v in body.model_dump().items() if v is not None}
        if not payload:
            raise HTTPException(status_code=400, detail="No fields to update")

        req = DbQueryRequest(
            providerId=adapter.config.id,
            action="update",
            table="email_provider_configs",
            payload=payload,
            filters=[DbFilter(op="eq", column="id", value=config_id)],
        )
        result = await execute_db_async(adapter, req)
        if result.error:
            raise HTTPException(status_code=500, detail=result.error)

        return {"success": True}

    except HTTPException:
        raise
    except Exception as e:
        logger.error("[EmailRoute] update_email_config error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/email/config/{config_id}")
async def delete_email_config(
    config_id: str,
    db_provider: Optional[str] = Query(default=None, alias="dbProvider"),
):
    """Delete a specific email config and all associated notifications (via CASCADE)."""
    try:
        _sync_monitor_db_provider(db_provider)
        adapter = get_db_adapter(db_provider)
        if not adapter:
            raise HTTPException(status_code=500, detail="No DB adapter configured")

        req = DbQueryRequest(
            providerId=adapter.config.id,
            action="delete",
            table="email_provider_configs",
            filters=[DbFilter(op="eq", column="id", value=config_id)],
        )
        await execute_db_async(adapter, req)
        return {"success": True}

    except Exception as e:
        logger.error("[EmailRoute] delete_email_config error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------

@router.get("/email/notifications")
async def list_notifications(
    config_id: Optional[str] = Query(default=None, alias="configId"),
    unread_only: bool = Query(default=False, alias="unreadOnly"),
    limit: int = Query(default=20, le=100),
    offset: int = Query(default=0),
    db_provider: Optional[str] = Query(default=None, alias="dbProvider"),
):
    """List email notifications, newest first. Optionally filter by config_id."""
    try:
        _sync_monitor_db_provider(db_provider)
        adapter = get_db_adapter(db_provider)
        if not adapter:
            return {"notifications": [], "total": 0}

        filters = []
        if config_id:
            filters.append(DbFilter(op="eq", column="config_id", value=config_id))
        if unread_only:
            filters.append(DbFilter(op="eq", column="is_read", value=False))

        req = DbQueryRequest(
            providerId=adapter.config.id,
            action="select",
            table="email_notifications",
            columns=["id", "config_id", "provider", "message_id", "subject", "sender",
                     "received_at", "summary", "is_read", "created_at"],
            filters=filters,
            order=[DbOrder(column="received_at", ascending=False)],
            limit=limit,
            offset=offset,
        )
        result = await execute_db_async(adapter, req)
        notifications = result.data if isinstance(result.data, list) else []
        return {"notifications": notifications, "count": len(notifications)}

    except Exception as e:
        logger.error("[EmailRoute] list_notifications error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/email/notifications/{notification_id}/read")
async def mark_notification_read(
    notification_id: str,
    db_provider: Optional[str] = Query(default=None, alias="dbProvider"),
):
    """Mark a single notification as read."""
    try:
        _sync_monitor_db_provider(db_provider)
        adapter = get_db_adapter(db_provider)
        if not adapter:
            raise HTTPException(status_code=500, detail="No DB adapter configured")

        req = DbQueryRequest(
            providerId=adapter.config.id,
            action="update",
            table="email_notifications",
            payload={"is_read": True},
            filters=[DbFilter(op="eq", column="id", value=notification_id)],
        )
        result = await execute_db_async(adapter, req)
        if result.error:
            raise HTTPException(status_code=500, detail=result.error)

        return {"success": True}

    except HTTPException:
        raise
    except Exception as e:
        logger.error("[EmailRoute] mark_notification_read error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/email/notifications/read-all")
async def mark_all_notifications_read(
    config_id: Optional[str] = Query(default=None, alias="configId"),
    db_provider: Optional[str] = Query(default=None, alias="dbProvider"),
):
    """Mark all unread notifications as read. Optionally filter by config_id."""
    try:
        _sync_monitor_db_provider(db_provider)
        adapter = get_db_adapter(db_provider)
        if not adapter:
            raise HTTPException(status_code=500, detail="No DB adapter configured")

        filters = [DbFilter(op="eq", column="is_read", value=False)]
        if config_id:
            filters.append(DbFilter(op="eq", column="config_id", value=config_id))

        req = DbQueryRequest(
            providerId=adapter.config.id,
            action="update",
            table="email_notifications",
            payload={"is_read": True},
            filters=filters,
        )
        await execute_db_async(adapter, req)
        return {"success": True}

    except Exception as e:
        logger.error("[EmailRoute] mark_all_read error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/email/notifications/{notification_id}")
async def delete_notification(
    notification_id: str,
    db_provider: Optional[str] = Query(default=None, alias="dbProvider"),
):
    """Delete a single notification."""
    try:
        _sync_monitor_db_provider(db_provider)
        adapter = get_db_adapter(db_provider)
        if not adapter:
            raise HTTPException(status_code=500, detail="Database adapter not available")

        req = DbQueryRequest(
            providerId=adapter.config.id,
            action="delete",
            table="email_notifications",
            filters=[DbFilter(op="eq", column="id", value=notification_id)],
        )
        result = await execute_db_async(adapter, req)
        if result.error:
            raise HTTPException(status_code=500, detail=result.error)

        return {"success": True}

    except Exception as e:
        logger.error("[EmailRoute] delete_notification error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# Manual trigger (for testing)
# ---------------------------------------------------------------------------

@router.post("/email/poll")
async def trigger_poll(
    db_provider: Optional[str] = Query(default=None, alias="dbProvider"),
):
    """Manually trigger an email poll cycle (for testing)."""
    try:
        _sync_monitor_db_provider(db_provider)
        result = await poll_all_accounts(database_provider=db_provider)
        return {"success": True, **result}
    except Exception as e:
        logger.error("[EmailRoute] trigger_poll error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# SSE stream for real-time notification updates
# ---------------------------------------------------------------------------

@router.get("/email/notifications/stream")
async def notification_stream(
    db_provider: Optional[str] = Query(default=None, alias="dbProvider"),
):
    """
    SSE endpoint for real-time notification updates.
    Frontend can connect to receive updates when new emails are polled.
    """
    import json
    _sync_monitor_db_provider(db_provider)

    async def event_generator():
        queue = subscribe_notifications()
        try:
            # Send initial connection message
            yield {"data": json.dumps({"type": "connected"})}

            while True:
                try:
                    # Wait for notification events with timeout
                    event = await asyncio.wait_for(queue.get(), timeout=30.0)
                    yield {"data": json.dumps(event)}
                except asyncio.TimeoutError:
                    # Send keepalive comment
                    yield {"comment": "keepalive"}
        except asyncio.CancelledError:
            pass
        finally:
            unsubscribe_notifications(queue)

    return EventSourceResponse(event_generator(), ping=0)
