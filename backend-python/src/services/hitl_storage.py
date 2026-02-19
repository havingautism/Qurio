"""
HITL pending run storage.

Supports persistent DB-backed storage (Supabase/SQLite provider) with in-memory fallback.
"""

from __future__ import annotations

import json
import logging
import re
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from ..models.db import DbFilter, DbQueryRequest
from .db_adapters import build_adapter
from .db_registry import ProviderConfig, get_provider_registry
from .db_service import execute_db_async
from .hitl_serializer import deserialize_requirements, serialize_requirements

logger = logging.getLogger(__name__)


def _utc_now() -> datetime:
    return datetime.now(UTC)


def _utc_now_iso() -> str:
    return _utc_now().replace(microsecond=0).isoformat()


def _is_missing_pending_form_table_error(error: Any) -> bool:
    text = str(error or "").lower()
    return "pending_form_runs" in text and (
        "pgrst205" in text
        or "pgrst204" in text
        or "could not find the table" in text
        or "could not find the" in text
        or "not found" in text
        or "does not exist" in text
    )


def _to_uuid_or_none(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    try:
        return str(UUID(text))
    except Exception:
        return None


def _normalize_stored_messages(raw_messages: Any) -> tuple[Any, Any]:
    """
    Backward/adapter compatibility for pending_form_runs.messages.

    messages may come back as:
    - list (legacy history-only)
    - dict {"history": [...], "run_output": {...}} (current)
    - JSON string for either of the above (provider/adapter dependent)
    """
    parsed = raw_messages
    if isinstance(parsed, str):
        text = parsed.strip()
        if text:
            try:
                parsed = json.loads(text)
            except Exception:
                parsed = raw_messages

    saved_messages = parsed
    saved_run_output = None
    if isinstance(parsed, dict):
        if "history" in parsed:
            saved_messages = parsed.get("history")
        if "run_output" in parsed:
            saved_run_output = parsed.get("run_output")
    return saved_messages, saved_run_output


def _extract_missing_column_from_error(error: Any) -> str | None:
    text = str(error or "")
    # Supabase/PostgREST PGRST204 example:
    # "Could not find the 'agent_model' column of 'pending_form_runs' in the schema cache"
    match = re.search(r"Could not find the '([^']+)' column", text, re.IGNORECASE)
    if match:
        return match.group(1)
    return None


class InMemoryHITLStorage:
    """In-memory storage for HITL pending runs."""

    def __init__(self) -> None:
        self._store: dict[str, dict[str, Any]] = {}

    async def save_pending_run(
        self,
        run_id: str,
        requirements: list[Any],
        conversation_id: str | None = None,
        user_id: str | None = None,
        agent_model: str | None = None,
        ttl_minutes: int = 30,
        messages: list[dict[str, Any]] | None = None,
        run_output: dict[str, Any] | None = None,
    ) -> dict[str, Any] | None:
        requirements_data = serialize_requirements(requirements)
        expires_at = (_utc_now() + timedelta(minutes=ttl_minutes)).isoformat()
        stored_messages: Any = messages
        if run_output is not None:
            stored_messages = {
                "history": messages,
                "run_output": run_output,
            }
        record = {
            "run_id": run_id,
            "requirements_data": requirements_data,
            "expires_at": expires_at,
            "status": "pending",
            "conversation_id": conversation_id,
            "user_id": user_id,
            "agent_model": agent_model,
            "messages": stored_messages,
            "created_at": _utc_now_iso(),
        }
        self._store[run_id] = record
        logger.info("[HITL] Stored pending run in memory: %s", run_id)
        return record

    async def get_pending_run(self, run_id: str) -> dict[str, Any] | None:
        record = self._store.get(run_id)
        if not record:
            logger.warning("[HITL] Pending run %s not found in memory", run_id)
            return None
        requirements_data = record.get("requirements_data") or []
        requirements = deserialize_requirements(requirements_data)
        saved_messages, saved_run_output = _normalize_stored_messages(record.get("messages"))

        # If provider record exists but lacks rich continuation payload
        # (e.g., older schema or messages column dropped during compatibility retry),
        # hydrate from global in-memory shadow copy written at pause time.
        if saved_run_output is None or saved_messages is None:
            shadow_pending = await _ensure_global_memory_storage().get_pending_run(run_id)
            if isinstance(shadow_pending, dict):
                if saved_messages is None:
                    saved_messages = shadow_pending.get("messages")
                if saved_run_output is None:
                    saved_run_output = shadow_pending.get("run_output")
        return {
            "requirements": requirements,
            "messages": saved_messages,
            "run_output": saved_run_output,
            "record": record,
        }

    async def delete_pending_run(self, run_id: str) -> bool:
        if run_id in self._store:
            self._store.pop(run_id, None)
            return True
        return False

    async def mark_as_submitted(self, run_id: str) -> bool:
        record = self._store.get(run_id)
        if not record:
            return False
        record["status"] = "submitted"
        record["submitted_at"] = _utc_now_iso()
        self._store[run_id] = record
        return True

    async def cleanup_expired_runs(self) -> int:
        # Expiration cleanup disabled by design:
        # keep pending HITL runs until submit completes or conversation is removed.
        return 0


class DbHITLStorage:
    """Database-backed HITL storage via provider adapter (supabase/sqlite)."""

    TABLE_NAME = "pending_form_runs"

    def __init__(self, provider: ProviderConfig) -> None:
        self.provider = provider
        self.adapter = build_adapter(provider)
        self._memory_fallback = InMemoryHITLStorage()
        self._use_memory_fallback = False

    async def save_pending_run(
        self,
        run_id: str,
        requirements: list[Any],
        conversation_id: str | None = None,
        user_id: str | None = None,
        agent_model: str | None = None,
        ttl_minutes: int = 30,
        messages: list[dict[str, Any]] | None = None,
        run_output: dict[str, Any] | None = None,
    ) -> dict[str, Any] | None:
        # Global shadow copy: protects against provider-id mismatch between
        # pause and submit when provider-backed storage fell back to memory.
        await _ensure_global_memory_storage().save_pending_run(
            run_id=run_id,
            requirements=requirements,
            conversation_id=conversation_id,
            user_id=user_id,
            agent_model=agent_model,
            ttl_minutes=ttl_minutes,
            messages=messages,
            run_output=run_output,
        )

        if self._use_memory_fallback:
            return await self._memory_fallback.save_pending_run(
                run_id=run_id,
                requirements=requirements,
                conversation_id=conversation_id,
                user_id=user_id,
                agent_model=agent_model,
                ttl_minutes=ttl_minutes,
                messages=messages,
                run_output=run_output,
            )

        requirements_data = serialize_requirements(requirements)
        now = _utc_now()
        expires_at = (now + timedelta(minutes=ttl_minutes)).replace(microsecond=0).isoformat()
        normalized_conversation_id = conversation_id
        normalized_user_id = user_id
        if self.provider.type == "supabase":
            # Supabase schema often defines these columns as UUID.
            normalized_conversation_id = _to_uuid_or_none(conversation_id)
            normalized_user_id = _to_uuid_or_none(user_id)
        payload: dict[str, Any] = {
            "run_id": run_id,
            "requirements_data": requirements_data,
            "expires_at": expires_at,
            "status": "pending",
            "conversation_id": normalized_conversation_id,
            "user_id": normalized_user_id,
            "agent_model": agent_model,
            "submitted_at": None,
        }
        if messages is not None or run_output is not None:
            payload["messages"] = {
                "history": messages,
                "run_output": run_output,
            }

        req = DbQueryRequest(
            providerId=self.provider.id,
            action="upsert",
            table=self.TABLE_NAME,
            values=payload,
            onConflict=["run_id"],
        )
        result = await execute_db_async(self.adapter, req)
        if result.error:
            # Retry with progressively reduced payload for older schemas.
            # Drop explicitly missing columns reported by provider error.
            for _ in range(4):
                if not result.error:
                    break
                missing_col = _extract_missing_column_from_error(result.error)
                if missing_col and missing_col in payload:
                    payload.pop(missing_col, None)
                elif "messages" in payload:
                    # Older deployments may still miss messages json column.
                    payload.pop("messages", None)
                else:
                    break

                req = DbQueryRequest(
                    providerId=self.provider.id,
                    action="upsert",
                    table=self.TABLE_NAME,
                    values=payload,
                    onConflict=["run_id"],
                )
                result = await execute_db_async(self.adapter, req)

            if result.error:
                error_text = str(result.error or "").lower()
                if _is_missing_pending_form_table_error(result.error) or "42p10" in error_text:
                    self._use_memory_fallback = True
                    logger.warning(
                        "[HITL] Table pending_form_runs missing/incompatible in provider=%s (error=%s); switched to in-memory fallback",
                        self.provider.id,
                        error_text,
                    )
                    return await self._memory_fallback.save_pending_run(
                        run_id=run_id,
                        requirements=requirements,
                        conversation_id=conversation_id,
                        user_id=user_id,
                        agent_model=agent_model,
                        ttl_minutes=ttl_minutes,
                        messages=messages,
                        run_output=run_output,
                    )
                logger.error(
                    "[HITL] Failed to persist pending run %s in provider=%s: %s",
                    run_id,
                    self.provider.id,
                    result.error,
                )
                return None
        logger.info("[HITL] Stored pending run in provider=%s: %s", self.provider.id, run_id)
        return payload

    async def get_pending_run(self, run_id: str) -> dict[str, Any] | None:
        if self._use_memory_fallback:
            local_pending = await self._memory_fallback.get_pending_run(run_id)
            if local_pending:
                return local_pending
            return await _ensure_global_memory_storage().get_pending_run(run_id)

        req = DbQueryRequest(
            providerId=self.provider.id,
            action="select",
            table=self.TABLE_NAME,
            filters=[DbFilter(op="eq", column="run_id", value=run_id)],
            limit=1,
            maybeSingle=True,
        )
        result = await execute_db_async(self.adapter, req)
        if result.error:
            if _is_missing_pending_form_table_error(result.error):
                self._use_memory_fallback = True
                logger.warning(
                    "[HITL] Table pending_form_runs missing in provider=%s; switched to in-memory fallback",
                    self.provider.id,
                )
                return await self._memory_fallback.get_pending_run(run_id)
            logger.error(
                "[HITL] Failed to load pending run %s from provider=%s: %s",
                run_id,
                self.provider.id,
                result.error,
            )
            return None
        record = result.data if isinstance(result.data, dict) else None
        if not record:
            logger.warning("[HITL] Pending run %s not found in provider=%s", run_id, self.provider.id)
            return await _ensure_global_memory_storage().get_pending_run(run_id)

        requirements_data = record.get("requirements_data") or []
        requirements = deserialize_requirements(requirements_data)
        saved_messages, saved_run_output = _normalize_stored_messages(record.get("messages"))
        return {
            "requirements": requirements,
            "messages": saved_messages,
            "run_output": saved_run_output,
            "record": record,
        }

    async def delete_pending_run(self, run_id: str) -> bool:
        global_deleted = await _ensure_global_memory_storage().delete_pending_run(run_id)

        if self._use_memory_fallback:
            local_deleted = await self._memory_fallback.delete_pending_run(run_id)
            return local_deleted or global_deleted

        req = DbQueryRequest(
            providerId=self.provider.id,
            action="delete",
            table=self.TABLE_NAME,
            filters=[DbFilter(op="eq", column="run_id", value=run_id)],
        )
        result = await execute_db_async(self.adapter, req)
        if result.error:
            if _is_missing_pending_form_table_error(result.error):
                self._use_memory_fallback = True
                logger.warning(
                    "[HITL] Table pending_form_runs missing in provider=%s; switched to in-memory fallback",
                    self.provider.id,
                )
                local_deleted = await self._memory_fallback.delete_pending_run(run_id)
                return local_deleted or global_deleted
            logger.error(
                "[HITL] Failed to delete pending run %s in provider=%s: %s",
                run_id,
                self.provider.id,
                result.error,
            )
            return global_deleted
        return True

    async def mark_as_submitted(self, run_id: str) -> bool:
        await _ensure_global_memory_storage().mark_as_submitted(run_id)

        if self._use_memory_fallback:
            return await self._memory_fallback.mark_as_submitted(run_id)

        req = DbQueryRequest(
            providerId=self.provider.id,
            action="update",
            table=self.TABLE_NAME,
            payload={"status": "submitted", "submitted_at": _utc_now_iso()},
            filters=[DbFilter(op="eq", column="run_id", value=run_id)],
        )
        result = await execute_db_async(self.adapter, req)
        if result.error:
            # Backward compatibility: some deployments do not have submitted_at.
            missing_col = _extract_missing_column_from_error(result.error)
            if missing_col == "submitted_at":
                req = DbQueryRequest(
                    providerId=self.provider.id,
                    action="update",
                    table=self.TABLE_NAME,
                    payload={"status": "submitted"},
                    filters=[DbFilter(op="eq", column="run_id", value=run_id)],
                )
                result = await execute_db_async(self.adapter, req)

        if result.error:
            if _is_missing_pending_form_table_error(result.error):
                self._use_memory_fallback = True
                logger.warning(
                    "[HITL] Table pending_form_runs missing in provider=%s; switched to in-memory fallback",
                    self.provider.id,
                )
                return await self._memory_fallback.mark_as_submitted(run_id)
            logger.error(
                "[HITL] Failed to mark submitted run %s in provider=%s: %s",
                run_id,
                self.provider.id,
                result.error,
            )
            return False
        return True

    async def cleanup_expired_runs(self) -> int:
        if self._use_memory_fallback:
            return await self._memory_fallback.cleanup_expired_runs()
        # Expiration cleanup disabled by design:
        # keep pending HITL runs until submit completes or conversation is removed.
        return 0


_memory_storage: InMemoryHITLStorage | None = None
_provider_storages: dict[str, DbHITLStorage] = {}


def _ensure_global_memory_storage() -> InMemoryHITLStorage:
    global _memory_storage
    if _memory_storage is None:
        _memory_storage = InMemoryHITLStorage()
    return _memory_storage


def _resolve_provider(provider_id_or_type: str | None) -> ProviderConfig | None:
    registry = get_provider_registry()
    providers = registry.list()
    if not providers:
        return None

    if provider_id_or_type:
        raw = str(provider_id_or_type).strip()
        if raw:
            by_id = registry.get(raw)
            if by_id:
                return by_id
            normalized = raw.lower().replace("_", " ").strip()
            if normalized in {"supabase", "sqlite", "sqlite local", "sqlite-local"}:
                target = "supabase" if normalized == "supabase" else "sqlite"
                for provider in providers:
                    if provider.type == target:
                        return provider
    for provider in providers:
        if provider.type == "supabase":
            return provider
    for provider in providers:
        if provider.type == "sqlite":
            return provider
    return None


def get_hitl_storage(provider_id_or_type: str | None = None) -> DbHITLStorage | InMemoryHITLStorage:
    """
    Return HITL storage based on provider.

    Priority:
    1) Explicit provider id
    2) Provider type alias ("supabase"/"sqlite"/"sqlite local")
    3) First available configured provider (supabase > sqlite)
    4) In-memory fallback
    """
    provider = _resolve_provider(provider_id_or_type)
    if provider is None:
        logger.warning("[HITL] No DB provider configured; using in-memory storage")
        return _ensure_global_memory_storage()

    storage = _provider_storages.get(provider.id)
    if storage is None:
        try:
            storage = DbHITLStorage(provider)
            _provider_storages[provider.id] = storage
            logger.info("[HITL] Using provider-backed storage: %s (%s)", provider.id, provider.type)
        except Exception as exc:
            logger.error(
                "[HITL] Failed to initialize provider storage (%s): %s; fallback to memory",
                provider.id,
                exc,
            )
            return _ensure_global_memory_storage()
    return storage
