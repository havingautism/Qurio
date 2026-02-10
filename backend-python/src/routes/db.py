"""
Database proxy routes (provider-aware).
"""

from __future__ import annotations

import logging
import threading

from fastapi import APIRouter, Header, HTTPException

from ..config import get_settings
from ..models.db import DbQueryRequest, DbQueryResponse
from ..services.db_adapters import build_adapter
from ..services.db_registry import get_provider_registry

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


@router.get("/db/providers")
def list_db_providers():
    registry = get_provider_registry()
    data = [
        {"id": provider.id, "type": provider.type, "label": provider.label}
        for provider in registry.list()
    ]
    return {"providers": data}


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
