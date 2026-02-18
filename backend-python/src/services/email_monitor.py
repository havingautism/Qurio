"""
Email monitor service: scheduled polling + AI summarization.

Lifecycle:
  - start_email_monitor() is called once at FastAPI startup (lifespan).
  - APScheduler runs poll_all_accounts() every N minutes (default 15).
  - stop_email_monitor() is called at FastAPI shutdown.

Flow per poll cycle:
  1. Load all enabled email_provider_configs from DB.
  2. For each config, build the appropriate provider (currently Gmail).
  3. Fetch new emails; skip any message_id already in email_notifications.
  4. For each new email, call Agno Agent to generate a summary.
  5. Insert the summary into email_notifications.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from types import SimpleNamespace

import os
from agno.agent import Agent
from agno.utils.log import logger as agno_logger

from ..config import get_settings
from ..services.agent_registry import _build_model
from ..services.db_service import execute_db_async, get_db_adapter
from ..models.db import DbFilter, DbQueryRequest
from .email_providers.base import EmailMessage
from .email_providers.imap import ImapProvider

logger = logging.getLogger(__name__)

# Maximum characters of email body sent to the summarization model
_MAX_BODY_CHARS = 2000

# Maximum notifications to keep per email account (sliding window)
_MAX_NOTIFICATIONS_PER_ACCOUNT = 5

# Global scheduler instance (APScheduler)
_scheduler = None

# SSE broadcast: list of queues for connected clients
_sse_subscribers: list[asyncio.Queue] = []


def subscribe_notifications() -> asyncio.Queue:
    """Subscribe to notification updates. Returns a queue that will receive events."""
    q = asyncio.Queue()
    _sse_subscribers.append(q)
    return q


def unsubscribe_notifications(q: asyncio.Queue) -> None:
    """Unsubscribe from notification updates."""
    if q in _sse_subscribers:
        _sse_subscribers.remove(q)


async def _broadcast_notification(event: dict) -> None:
    """Broadcast a notification event to all connected SSE clients."""
    for q in _sse_subscribers:
        try:
            q.put_nowait(event)
        except Exception:
            pass  # Queue full or closed, ignore


async def _get_unread_count(database_provider: str | None) -> int:
    """Get total unread notification count."""
    try:
        adapter = get_db_adapter(database_provider)
        if not adapter:
            return 0
        req = DbQueryRequest(
            providerId=adapter.config.id,
            action="select",
            table="email_notifications",
            columns=["id"],
            filters=[DbFilter(op="eq", column="is_read", value=False)],
        )
        result = await execute_db_async(adapter, req)
        notifications = result.data if isinstance(result.data, list) else []
        return len(notifications)
    except Exception:
        return 0


# ---------------------------------------------------------------------------
# Summarization
# ---------------------------------------------------------------------------

async def _summarize_email(
    email: EmailMessage,
    summary_provider: str,
    summary_model: str,
    database_provider: str | None = None,
) -> str:
    """
    Use Agno Agent to generate a concise summary of an email.

    Returns a plain-text summary string (2-4 sentences).
    Falls back to a simple excerpt if the model call fails.
    API key is resolved from global settings (DB user_settings -> Env).
    """
    try:
        # Resolve API key from global settings
        summary_api_key = await _resolve_provider_api_key(summary_provider, database_provider)
        model = _build_model(summary_provider, summary_api_key, None, summary_model)
        agent = Agent(
            model=model,
            description="You are an email summarizer. Output concise plain text only.",
            instructions="Summarize the email in 2-4 sentences. Focus on key points and action items.",
        )

        body_excerpt = (email.body_text or "")[:_MAX_BODY_CHARS]
        prompt = (
            f"Subject: {email.subject}\n"
            f"From: {email.sender}\n"
            f"Body:\n{body_excerpt}\n\n"
            "Please summarize this email in 2-4 sentences."
        )

        response = await agent.arun(prompt)
        summary = (response.content or "").strip()
        logger.info("[EmailMonitor] Summarized email '%s'", email.subject)
        return summary

    except Exception as e:
        logger.warning("[EmailMonitor] Summarization failed for '%s': %s", email.subject, e)
        # Fallback: return first 200 chars of body as the summary
        return (email.body_text or "")[:200].strip() or "(No summary available)"


# ---------------------------------------------------------------------------
# Core poll logic
# ---------------------------------------------------------------------------



async def _save_notification(
    config_id: str,
    provider: str,
    email: EmailMessage,
    summary: str,
    database_provider: str | None,
) -> None:
    """Insert a new email notification record into Supabase."""
    try:
        adapter = get_db_adapter(database_provider)
        if not adapter:
            logger.warning("[EmailMonitor] No DB adapter; cannot save notification.")
            return

        req = DbQueryRequest(
            providerId=adapter.config.id,
            action="insert",
            table="email_notifications",
            payload={
                "config_id": config_id,
                "provider": provider,
                "message_id": email.message_id,
                "subject": email.subject,
                "sender": email.sender,
                "received_at": email.received_at.isoformat() if email.received_at else None,
                "summary": summary,
                "is_read": False,
            },
        )
        result = await execute_db_async(adapter, req)
        if result.error:
            logger.error("[EmailMonitor] Failed to save notification: %s", result.error)
        else:
            logger.info("[EmailMonitor] Saved notification for '%s'", email.subject)
    except Exception as e:
        logger.error("[EmailMonitor] _save_notification error: %s", e)




async def _resolve_db_setting(key: str, database_provider: str | None, default: str = "") -> str:
    """Helper to fetch a single value from user_settings table."""
    try:
        adapter = get_db_adapter(database_provider)
        if not adapter:
            return default
        req = DbQueryRequest(
            providerId=adapter.config.id,
            action="select",
            table="user_settings",
            filters=[DbFilter(op="eq", column="key", value=key)],
            maybeSingle=True,
        )
        result = await execute_db_async(adapter, req)
        if result.data and isinstance(result.data, dict):
            return result.data.get("value") or default
    except Exception as e:
        logger.debug("[EmailMonitor] Failed to resolve DB setting '%s': %s", key, e)
    return default


async def _resolve_provider_api_key(provider: str, database_provider: str | None) -> str:
    """
    Resolve the API key for a model provider.
    Priority: Environment variable (via get_settings) -> DB user_settings table.
    """
    settings = get_settings()
    
    # Mapping of summary provider to DB key in user_settings
    db_key_map = {
        "gemini": "googleApiKey",
        "openai": "OpenAICompatibilityKey",
        "openai_compatibility": "OpenAICompatibilityKey",
        "siliconflow": "SiliconFlowKey",
        "glm": "GlmKey",
        "modelscope": "ModelScopeKey",
        "kimi": "KimiKey",
        "nvidia": "NvidiaKey",
        "minimax": "MinimaxKey",
    }
    
    # 1. Check DB first (most specific to user UI)
    db_key = db_key_map.get(provider)
    if db_key:
        val = await _resolve_db_setting(db_key, database_provider, "")
        if val:
            return val
            
    # 2. Fallback to settings / env
    # Note: summary_agent_api_key is usually mapped to OPENAI_API_KEY in get_settings()
    if provider in ["openai", "openai_compatibility"]:
        return settings.summary_agent_api_key or os.getenv("OPENAI_API_KEY", "")
    elif provider == "gemini":
        return os.getenv("GOOGLE_API_KEY", "")
    elif provider == "siliconflow":
        return os.getenv("SILICONFLOW_API_KEY", "")
    
    return os.getenv("OPENAI_API_KEY", "")


async def _poll_single_config(config: dict, database_provider: str | None) -> None:
    """
    Poll one email account config: fetch new emails, summarize, and save.

    Sliding window logic:
      1. Fetch the latest N unread emails from IMAP.
      2. Compare with existing DB notifications for this config.
      3. New emails (not in DB) → summarize and save.
         Overlapping emails (already in DB) → skip.
         Old emails (in DB but not in new fetch) → delete.
    Result: DB always mirrors the current latest N unread emails.
    """
    config_id = config.get("id", "")
    provider = config.get("provider", "gmail")
    email_addr = config.get("email", "")
    imap_password = config.get("imap_password", "")

    logger.info("[EmailMonitor] Polling %s (%s)...", email_addr, provider)

    if not email_addr or not imap_password:
        logger.warning("[EmailMonitor] Missing email or password for config %s; skipping.", config_id)
        return

    # Build IMAP provider — all providers use ImapProvider logic, only host differs
    _IMAP_SERVERS = {
        "gmail":   ("imap.gmail.com", 993),
        "outlook": ("outlook.office365.com", 993),
        "qq":      ("imap.qq.com", 993),
        "163":     ("imap.163.com", 993),
    }
    imap_host, imap_port = _IMAP_SERVERS.get(provider, ("imap.gmail.com", 993))
    email_provider = ImapProvider(email_addr, imap_password, imap_host, imap_port)

    # Summarization model config — each account must have its own provider/model
    summary_provider = config.get("summary_provider")
    summary_model    = config.get("summary_model")

    # Skip if provider/model not configured
    if not summary_provider or not summary_model:
        logger.warning(
            "[EmailMonitor] Missing summary_provider or summary_model for %s; skipping.",
            email_addr
        )
        return

    # Step 1: Fetch latest N unread emails from IMAP (blocking I/O → thread pool)
    loop = asyncio.get_event_loop()
    email_tuples: list[tuple[str, EmailMessage]] = await loop.run_in_executor(
        None, lambda: email_provider.fetch_new_emails(max_results=_MAX_NOTIFICATIONS_PER_ACCOUNT)
    )

    # Build a set of message_ids from the current fetch
    fetched_message_ids: set[str] = {msg.message_id for _, msg in email_tuples}

    # Step 2: Load all existing DB notifications for this config
    adapter = get_db_adapter(database_provider)
    if not adapter:
        logger.warning("[EmailMonitor] No DB adapter; skipping poll for %s.", email_addr)
        return

    existing_req = DbQueryRequest(
        providerId=adapter.config.id,
        action="select",
        table="email_notifications",
        columns=["id", "message_id"],
        filters=[DbFilter(op="eq", column="config_id", value=config_id)],
    )
    existing_result = await execute_db_async(adapter, existing_req)
    existing_notifications = existing_result.data if isinstance(existing_result.data, list) else []
    existing_message_ids: set[str] = {n["message_id"] for n in existing_notifications if n.get("message_id")}

    # Step 3: Save new emails (in fetch but not in DB)
    new_count = 0
    for _, msg in email_tuples:
        if msg.message_id in existing_message_ids:
            continue  # Already in DB — skip

        summary = await _summarize_email(msg, summary_provider, summary_model, database_provider)
        await _save_notification(config_id, provider, msg, summary, database_provider)
        new_count += 1

    # Step 4: Delete old notifications (in DB but not in current fetch)
    deleted_count = 0
    for notif in existing_notifications:
        if notif.get("message_id") not in fetched_message_ids:
            delete_req = DbQueryRequest(
                providerId=adapter.config.id,
                action="delete",
                table="email_notifications",
                filters=[DbFilter(op="eq", column="id", value=notif["id"])],
            )
            await execute_db_async(adapter, delete_req)
            deleted_count += 1

    logger.info(
        "[EmailMonitor] %s: %d new saved, %d old deleted.",
        email_addr, new_count, deleted_count,
    )


async def poll_all_accounts(database_provider: str | None = None) -> dict:
    """
    Poll all enabled email accounts and generate summaries.
    Called by the scheduler every N minutes, and also by the manual trigger endpoint.

    Returns:
        Dict with counts of accounts polled and notifications created.
    """
    logger.info("[EmailMonitor] Starting poll cycle...")
    try:
        adapter = get_db_adapter(database_provider)
        if not adapter:
            logger.warning("[EmailMonitor] No DB adapter available; skipping poll.")
            return {"polled": 0, "error": "No DB adapter"}

        # Load all enabled configs
        req = DbQueryRequest(
            providerId=adapter.config.id,
            action="select",
            table="email_provider_configs",
            filters=[DbFilter(op="eq", column="is_enabled", value=True)],
        )
        result = await execute_db_async(adapter, req)
        configs = result.data if isinstance(result.data, list) else []

        if not configs:
            logger.info("[EmailMonitor] No enabled email configs found.")
            return {"polled": 0}

        # Poll each account
        tasks = [_poll_single_config(cfg, database_provider) for cfg in configs]
        await asyncio.gather(*tasks, return_exceptions=True)

        logger.info("[EmailMonitor] Poll cycle complete. Accounts: %d", len(configs))

        # Broadcast update to SSE subscribers
        try:
            unread_count = await _get_unread_count(database_provider)
            await _broadcast_notification({
                "type": "notifications_updated",
                "unread_count": unread_count,
            })
        except Exception as e:
            logger.warning("[EmailMonitor] Failed to broadcast notification: %s", e)

        return {"polled": len(configs)}

    except Exception as e:
        logger.error("[EmailMonitor] poll_all_accounts error: %s", e)
        return {"polled": 0, "error": str(e)}


# ---------------------------------------------------------------------------
# Scheduler lifecycle
# ---------------------------------------------------------------------------

def start_email_monitor(database_provider: str | None = None) -> None:
    """
    Start the APScheduler background scheduler for email polling.
    Called once at FastAPI startup via lifespan.
    """
    global _scheduler
    try:
        from apscheduler.schedulers.asyncio import AsyncIOScheduler

        _scheduler = AsyncIOScheduler()

        # Schedule poll_all_accounts to run every 15 minutes
        # The interval is fixed here; per-account intervals could be added later.
        _scheduler.add_job(
            poll_all_accounts,
            trigger="interval",
            minutes=15,
            id="email_poll",
            replace_existing=True,
            kwargs={"database_provider": database_provider},
        )

        _scheduler.start()
        logger.info("[EmailMonitor] Scheduler started (interval: 15 minutes).")
    except Exception as e:
        logger.error("[EmailMonitor] Failed to start scheduler: %s", e)


def stop_email_monitor() -> None:
    """
    Stop the APScheduler scheduler.
    Called at FastAPI shutdown via lifespan.
    """
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("[EmailMonitor] Scheduler stopped.")
    _scheduler = None
