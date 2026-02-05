"""
Database service for resolving adapters and executing queries.
Unifies access to Supabase and SQLite providers.
"""

from __future__ import annotations

import logging
from typing import Optional, Union

from .db_adapters import SQLiteAdapter, SupabaseAdapter, build_adapter
from .db_registry import ProviderConfig, get_provider_registry

logger = logging.getLogger(__name__)

DbAdapter = Union[SQLiteAdapter, SupabaseAdapter]

_adapter_cache: dict[str, DbAdapter] = {}


def _resolve_provider(provider_id_or_type: str | None) -> ProviderConfig | None:
    """
    Resolve a provider config by ID or type alias.
    """
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
    
    # Defaults: Supabase > SQLite
    for provider in providers:
        if provider.type == "supabase":
            return provider
    for provider in providers:
        if provider.type == "sqlite":
            return provider
    return None


def get_db_adapter(provider_id_or_type: str | None = None) -> Optional[DbAdapter]:
    """
    Get a database adapter for the specified provider (or default).
    """
    provider = _resolve_provider(provider_id_or_type)
    if not provider:
        # Only warn if explicitly requested but not found, or if no providers at all
        if provider_id_or_type or not get_provider_registry().list():
             logger.warning("[DB] No database provider found for: %s", provider_id_or_type)
        return None
    
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
