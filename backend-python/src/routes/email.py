"""
Email notification API routes (IMAP version).

Endpoints:
  POST /api/email/connect          - Test credentials and save IMAP config
  GET  /api/email/config           - Get current email config (no secrets)
  DELETE /api/email/config         - Delete config and stop monitoring
  GET  /api/email/notifications    - List notifications (with pagination)
  PATCH /api/email/notifications/{id}/read  - Mark notification as read
  PATCH /api/email/notifications/read-all   - Mark all as read
  POST /api/email/poll             - Manually trigger a poll cycle (for testing)
"""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from ..models.db import DbFilter, DbOrder, DbQueryRequest
from ..services.db_service import execute_db_async, get_db_adapter
from ..services.email_monitor import poll_all_accounts

router = APIRouter()
logger = logging.getLogger(__name__)


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
    summary_api_key: Optional[str] = None


class EmailConfigUpdate(BaseModel):
    """Fields the user can update after initial setup."""
    poll_interval_minutes: Optional[int] = None
    is_enabled: Optional[bool] = None
    summary_provider: Optional[str] = None
    summary_model: Optional[str] = None
    summary_api_key: Optional[str] = None


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
    from ..services.email_providers.gmail import GmailProvider

    host, port = _IMAP_SERVERS.get(provider, ("imap.gmail.com", 993))

    # All providers currently use the same IMAP logic; only host/port differ
    # Future: create OutlookProvider, QQProvider etc. with provider-specific quirks
    p = GmailProvider.__new__(GmailProvider)
    p._email = email_address
    p._password = app_password.replace(" ", "")

    import imaplib, socket
    # Override host/port for non-Gmail providers
    p._imap_host = host
    p._imap_port = port

    return p


# ---------------------------------------------------------------------------
# Connect / Config
# ---------------------------------------------------------------------------

@router.post("/email/connect")
async def connect_email(
    body: EmailConnectRequest,
    db_provider: Optional[str] = Query(default=None, alias="dbProvider"),
):
    """
    Test IMAP credentials and save the config to DB.
    Returns error if login fails.
    """
    try:
        # Validate credentials by attempting a real IMAP login
        from ..services.email_providers.gmail import GmailProvider
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

        # Check if config already exists (find ANY existing config to allow switching providers)
        existing_req = DbQueryRequest(
            providerId=adapter.config.id,
            action="select",
            table="email_provider_configs",
            columns=["id"],
            filters=[], # Remove provider filter to allow updating/replacing current config
            limit=1,
        )
        existing_result = await execute_db_async(adapter, existing_req)
        existing_data = existing_result.data
        # data is a list for regular select
        existing_id = None
        if isinstance(existing_data, list) and existing_data:
            existing_id = existing_data[0].get("id")
        elif isinstance(existing_data, dict):
            existing_id = existing_data.get("id")

        payload = {
            "provider": body.provider,
            "email": body.email,
            "imap_password": body.app_password,  # Stored encrypted by DB
            "poll_interval_minutes": body.poll_interval_minutes,
            "is_enabled": True,
            "summary_provider": body.summary_provider,
            "summary_model": body.summary_model,
        }
        if body.summary_api_key:
            payload["summary_api_key"] = body.summary_api_key

        if existing_id:
            update_req = DbQueryRequest(
                providerId=adapter.config.id,
                action="update",
                table="email_provider_configs",
                payload=payload,
                filters=[DbFilter(op="eq", column="id", value=existing_id)],
            )
            await execute_db_async(adapter, update_req)
        else:
            insert_req = DbQueryRequest(
                providerId=adapter.config.id,
                action="insert",
                table="email_provider_configs",
                payload=payload,
            )
            await execute_db_async(adapter, insert_req)

        logger.info("[EmailRoute] Connected %s account: %s", body.provider, body.email)
        return {"success": True, "email": body.email}

    except HTTPException:
        raise
    except Exception as e:
        logger.error("[EmailRoute] connect_email error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/email/config")
async def get_email_config(
    db_provider: Optional[str] = Query(default=None, alias="dbProvider"),
):
    """Get current email provider config (password is omitted)."""
    try:
        adapter = get_db_adapter(db_provider)
        if not adapter:
            return {"config": None}

        from ..models.db import DbOrder
        req = DbQueryRequest(
            providerId=adapter.config.id,
            action="select",
            table="email_provider_configs",
            # Exclude sensitive fields
            columns=["id", "provider", "email", "is_enabled", "poll_interval_minutes",
                     "summary_provider", "summary_model", "summary_base_url", "created_at"],
            filters=[],
            order=[DbOrder(column="updated_at", ascending=False)],
            limit=1,
        )
        result = await execute_db_async(adapter, req)
        # DEBUG: print raw result to diagnose frontend display issue
        logger.info("[EmailRoute] get_email_config raw result: data=%s error=%s", result.data, result.error)
        # Extract single config from list result
        data = result.data
        config = None
        if isinstance(data, list):
            config = data[0] if data else None
        elif isinstance(data, dict):
            config = data
        logger.info("[EmailRoute] get_email_config returning config: %s", config)
        return {"config": config}

    except Exception as e:
        logger.error("[EmailRoute] get_email_config error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/email/config")
async def update_email_config(
    body: EmailConfigUpdate,
    db_provider: Optional[str] = Query(default=None, alias="dbProvider"),
):
    """Update email config settings (interval, enabled state, summary model)."""
    try:
        adapter = get_db_adapter(db_provider)
        if not adapter:
            raise HTTPException(status_code=500, detail="No DB adapter configured")

        payload = {k: v for k, v in body.model_dump().items() if v is not None}
        if not payload:
            raise HTTPException(status_code=400, detail="No fields to update")

        # We need to find the ID to update
        existing_req = DbQueryRequest(
            providerId=adapter.config.id,
            action="select",
            table="email_provider_configs",
            columns=["id"],
            filters=[],
            limit=1,
        )
        existing_result = await execute_db_async(adapter, existing_req)
        existing_id = None
        if isinstance(existing_result.data, list) and existing_result.data:
            existing_id = existing_result.data[0].get("id")
        
        if not existing_id:
            raise HTTPException(status_code=404, detail="Email configuration not found")

        req = DbQueryRequest(
            providerId=adapter.config.id,
            action="update",
            table="email_provider_configs",
            payload=payload,
            filters=[DbFilter(op="eq", column="id", value=existing_id)],
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


@router.delete("/email/config")
async def delete_email_config(
    db_provider: Optional[str] = Query(default=None, alias="dbProvider"),
):
    """Delete the email config and all associated notifications."""
    try:
        adapter = get_db_adapter(db_provider)
        if not adapter:
            raise HTTPException(status_code=500, detail="No DB adapter configured")

        req = DbQueryRequest(
            providerId=adapter.config.id,
            action="delete",
            table="email_provider_configs",
            filters=[],
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
    unread_only: bool = Query(default=False, alias="unreadOnly"),
    limit: int = Query(default=20, le=100),
    offset: int = Query(default=0),
    db_provider: Optional[str] = Query(default=None, alias="dbProvider"),
):
    """List email notifications, newest first."""
    try:
        adapter = get_db_adapter(db_provider)
        if not adapter:
            return {"notifications": [], "total": 0}

        filters = []
        if unread_only:
            filters.append(DbFilter(op="eq", column="is_read", value=False))

        req = DbQueryRequest(
            providerId=adapter.config.id,
            action="select",
            table="email_notifications",
            columns=["id", "provider", "message_id", "subject", "sender",
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
    db_provider: Optional[str] = Query(default=None, alias="dbProvider"),
):
    """Mark all unread notifications as read."""
    try:
        adapter = get_db_adapter(db_provider)
        if not adapter:
            raise HTTPException(status_code=500, detail="No DB adapter configured")

        req = DbQueryRequest(
            providerId=adapter.config.id,
            action="update",
            table="email_notifications",
            payload={"is_read": True},
            filters=[DbFilter(op="eq", column="is_read", value=False)],
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
        result = await poll_all_accounts(database_provider=db_provider)
        return {"success": True, **result}
    except Exception as e:
        logger.error("[EmailRoute] trigger_poll error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))
