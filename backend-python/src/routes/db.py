"""
Database proxy routes.

The backend exposes one active database configuration at a time.
"""

from __future__ import annotations

import logging
import threading
from pathlib import Path

from fastapi import APIRouter, Header, HTTPException

from ..config import get_settings
from ..models.db import DbProviderUpsertRequest, DbQueryRequest, DbQueryResponse
from ..services.db_adapters import build_adapter
from ..services.db_registry import ProviderConfig, get_provider_registry, normalize_provider_type
from ..services.db_service import initialize_provider_schema, invalidate_db_adapter_cache

router = APIRouter()
logger = logging.getLogger(__name__)

_adapters = {}
_adapters_lock = threading.Lock()


def _get_adapter(provider_id: str):
    registry = get_provider_registry()
    provider = registry.get(provider_id)
    if not provider:
        raise HTTPException(status_code=400, detail="Unknown providerId")
    with _adapters_lock:
        if provider_id not in _adapters:
            _adapters[provider_id] = build_adapter(provider)
        return _adapters[provider_id]


def _invalidate_adapter_cache(provider_id: str | None = None):
    with _adapters_lock:
        if provider_id is None:
            _adapters.clear()
        else:
            _adapters.pop(provider_id, None)
    invalidate_db_adapter_cache(provider_id)


@router.get("/db/providers")
def list_db_providers():
    registry = get_provider_registry()
    settings = get_settings()
    global_requires_key = bool((settings.db_access_key or "").strip())
    include_details = registry.is_mutable()
    data = [
        {
            "id": provider.id,
            "type": provider.type,
            "label": provider.label,
            "requiresAccessKey": bool(provider.access_key) or global_requires_key,
            "url": provider.supabase_url if include_details and provider.type == "supabase" else None,
            "anonKey": (
                provider.supabase_anon_key if include_details and provider.type == "supabase" else None
            ),
            "path": provider.sqlite_path if include_details and provider.type == "sqlite" else None,
            "connectionUrl": (
                provider.connection_url
                if include_details and provider.type not in {"supabase", "sqlite"}
                else None
            ),
        }
        for provider in registry.list()
    ]
    return {"providers": data, "provider": data[0] if data else None, "mutable": registry.is_mutable()}


@router.post("/db/providers")
def upsert_db_provider(request: DbProviderUpsertRequest):
    registry = get_provider_registry()
    if not registry.is_mutable():
        raise HTTPException(status_code=403, detail="Provider changes are only allowed in Electron mode")

    provider_id = request.id.strip() or "default"
    provider_type = normalize_provider_type(request.type)
    if not provider_type:
        raise HTTPException(status_code=400, detail="Unsupported database provider type")

    label = (request.label or provider_type).strip()
    access_key = (request.access_key or "").strip() or None

    if provider_type == "supabase":
        url = (request.url or "").strip()
        anon_key = (request.anon_key or "").strip()
        if not url or not anon_key:
            raise HTTPException(status_code=400, detail="Supabase url and anonKey are required")
        provider = ProviderConfig(
            id=provider_id,
            type="supabase",
            label=label,
            supabase_url=url,
            supabase_anon_key=anon_key,
            access_key=access_key,
        )
    elif provider_type == "sqlite":
        raw_path = (request.path or "").strip()
        if not raw_path:
            raise HTTPException(status_code=400, detail="SQLite path is required")
        sqlite_path = Path(raw_path)
        if not sqlite_path.is_absolute():
            sqlite_path = (Path(__file__).resolve().parents[2] / raw_path).resolve()
        provider = ProviderConfig(
            id=provider_id,
            type="sqlite",
            label=label,
            sqlite_path=str(sqlite_path),
            access_key=access_key,
        )
    else:
        url = (request.url or "").strip()
        if not url:
            raise HTTPException(status_code=400, detail="Database url is required")
        provider = ProviderConfig(
            id=provider_id,
            type=provider_type,
            label=label,
            connection_url=url,
            access_key=access_key,
        )

    saved = registry.upsert(provider)
    _invalidate_adapter_cache(saved.id)
    return {
        "provider": {
            "id": saved.id,
            "type": saved.type,
            "label": saved.label,
            "requiresAccessKey": bool(saved.access_key),
            "url": saved.supabase_url if saved.type == "supabase" else None,
            "anonKey": saved.supabase_anon_key if saved.type == "supabase" else None,
            "path": saved.sqlite_path if saved.type == "sqlite" else None,
            "connectionUrl": saved.connection_url if saved.type not in {"supabase", "sqlite"} else None,
        }
    }


@router.delete("/db/providers/{provider_id}")
def delete_db_provider(provider_id: str):
    registry = get_provider_registry()
    if not registry.is_mutable():
        raise HTTPException(status_code=403, detail="Provider changes are only allowed in Electron mode")

    trimmed = provider_id.strip()
    if not trimmed:
        raise HTTPException(status_code=400, detail="Provider id is required")

    deleted = registry.remove(trimmed)
    _invalidate_adapter_cache(trimmed)
    return {"deleted": deleted}


@router.post("/db/providers/{provider_id}/initialize")
def initialize_db_provider(provider_id: str):
    registry = get_provider_registry()
    provider = registry.get(provider_id.strip())
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")

    _invalidate_adapter_cache(provider.id)
    result = initialize_provider_schema(provider)
    return result


@router.post("/db/query", response_model=DbQueryResponse)
def db_query(request: DbQueryRequest, x_db_access_key: str | None = Header(default=None)):
    try:
        registry = get_provider_registry()
        provider = registry.get(request.provider_id)
        if not provider:
            raise HTTPException(status_code=400, detail="Unknown providerId")

        # Prefer per-provider access key; fallback to global key if set.
        settings = get_settings()
        expected_key = provider.access_key or settings.db_access_key
        if expected_key and x_db_access_key != expected_key:
            raise HTTPException(status_code=401, detail="Invalid database access key")

        adapter = _get_adapter(request.provider_id)
        return adapter.execute(request)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("[DB] Unhandled db_query error: %s", exc)
        return DbQueryResponse(error=f"Internal db proxy error: {exc}")
