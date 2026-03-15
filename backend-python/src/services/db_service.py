"""
Database service for resolving adapters and executing queries.

The backend now uses one active database configuration at a time.
"""

from __future__ import annotations

import asyncio
import logging
import threading
from typing import Any, Union
from pathlib import Path
import sqlite3

import psycopg2

from .db_adapters import SQLAlchemyAdapter, SQLiteAdapter, SupabaseAdapter, build_adapter
from .db_registry import ProviderConfig, get_provider_registry, normalize_provider_type
from ..config import get_settings

logger = logging.getLogger(__name__)

DbAdapter = Union[SQLiteAdapter, SupabaseAdapter, SQLAlchemyAdapter]

_adapter_cache: dict[str, DbAdapter] = {}
_adapter_cache_lock = threading.Lock()

APP_TABLES: list[str] = [
    "conversation_documents",
    "space_agents",
    "attachments",
    "conversation_events",
    "conversation_messages",
    "space_documents",
    "conversations",
    "agents",
    "spaces",
    "home_shortcuts",
    "home_notes",
    "user_settings",
    "memory_summaries",
    "memory_domains",
    "user_tools",
    "pending_form_runs",
    "scrapbook",
]

LEGACY_DROP_TABLES: list[str] = [
    "document_chunks",
    "document_sections",
]


def _resolve_provider(provider_id_or_type: str | None) -> ProviderConfig | None:
    registry = get_provider_registry()
    providers = registry.list()
    if not providers:
        return None

    active = providers[0]
    if not provider_id_or_type:
        return active

    raw = str(provider_id_or_type).strip()
    if not raw:
        return active

    by_id = registry.get(raw)
    if by_id:
        return by_id

    provider_type = normalize_provider_type(raw)
    if provider_type == active.type:
        return active
    return None


def get_db_adapter(provider_id_or_type: str | None = None) -> DbAdapter | None:
    """
    Get a database adapter for the specified provider (or default).
    """
    provider = _resolve_provider(provider_id_or_type)
    if not provider:
        # Only warn if explicitly requested but not found, or if no providers at all
        if provider_id_or_type or not get_provider_registry().list():
             logger.warning("[DB] No database provider found for: %s", provider_id_or_type)
        return None

    with _adapter_cache_lock:
        if provider.id in _adapter_cache:
            return _adapter_cache[provider.id]

        try:
            adapter = build_adapter(provider)
            _adapter_cache[provider.id] = adapter
            logger.info("[DB] Built adapter for provider: %s (%s)", provider.id, provider.type)
            return adapter
        except Exception as e:
            logger.error("[DB] Failed to build adapter for %s: %s", provider.id, e)
            return None


def invalidate_db_adapter_cache(provider_id: str | None = None) -> None:
    with _adapter_cache_lock:
        if provider_id is None:
            _adapter_cache.clear()
            return
        _adapter_cache.pop(provider_id, None)


async def execute_db_async(adapter: DbAdapter, request: Any) -> Any:
    """
    Execute a synchronous adapter query in a worker thread to avoid blocking the event loop.
    """
    return await asyncio.to_thread(adapter.execute, request)


def initialize_provider_schema(provider: ProviderConfig) -> dict[str, Any]:
    """
    Initialize required database schema for provider.
    - SQLite: schema is auto-created by adapter constructor.
    - Supabase/Postgres: execute supabase/schema.sql when SUPABASE_DB_URL is configured.
    """
    if provider.type == "sqlite":
        if not provider.sqlite_path:
            return {"success": False, "message": "SQLite path is missing."}
        # Ensure we don't reuse a stale adapter/connection after reset.
        invalidate_db_adapter_cache(provider.id)
        conn = None
        try:
            conn = sqlite3.connect(provider.sqlite_path)
            cursor = conn.cursor()
            cursor.execute("PRAGMA foreign_keys=OFF;")
            for table in APP_TABLES + LEGACY_DROP_TABLES:
                cursor.execute(f"DROP TABLE IF EXISTS {table};")
            conn.commit()
        except Exception as exc:
            logger.exception("[DB] SQLite reset failed: %s", exc)
            return {"success": False, "message": f"SQLite reset failed: {exc}"}
        finally:
            if conn:
                conn.close()

        invalidate_db_adapter_cache(provider.id)
        adapter = get_db_adapter(provider.id)
        if not adapter:
            return {"success": False, "message": "Failed to initialize SQLite adapter."}
        return {"success": True, "message": "SQLite schema reset and initialized."}

    if provider.type in {"postgres", "mysql", "mariadb"}:
        return {
            "success": False,
            "message": (
                f"Automatic schema initialization is not implemented for provider type '{provider.type}'. "
                "Create the schema externally and use /db/query test to validate connectivity."
            ),
        }

    if provider.type != "supabase":
        return {"success": False, "message": f"Unsupported provider type: {provider.type}"}

    settings = get_settings()
    db_url = (settings.supabase_db_url or "").strip()
    if not db_url:
        return {
            "success": False,
            "message": "SUPABASE_DB_URL is required for automatic Supabase initialization.",
        }

    schema_path = Path(__file__).resolve().parents[3] / "supabase" / "schema.sql"
    if not schema_path.exists():
        return {"success": False, "message": f"Schema file not found: {schema_path}"}

    schema_sql = schema_path.read_text(encoding="utf-8")
    if not schema_sql.strip():
        return {"success": False, "message": "Schema SQL file is empty."}

    conn = None
    try:
        conn = psycopg2.connect(db_url)
        conn.autocommit = True
        with conn.cursor() as cursor:
            for table in APP_TABLES + LEGACY_DROP_TABLES:
                cursor.execute(f"DROP TABLE IF EXISTS public.{table} CASCADE;")
            cursor.execute(schema_sql)
        return {"success": True, "message": "Supabase schema reset and initialized."}
    except Exception as exc:
        logger.exception("[DB] Supabase initialization failed: %s", exc)
        return {"success": False, "message": f"Supabase initialization failed: {exc}"}
    finally:
        if conn:
            conn.close()
