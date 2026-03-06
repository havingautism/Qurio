"""
Database provider registry and persistence.

Qurio now keeps exactly one active backend database configuration.
The registry API remains list/get/upsert/remove for compatibility with the
rest of the codebase, but `list()` returns at most one provider.
"""

from __future__ import annotations

import json
import os
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from agno.utils.log import logger

from ..config import get_settings

ProviderType = Literal["supabase", "sqlite", "postgres", "mysql", "mariadb"]
DEFAULT_PROVIDER_ID = "default"


@dataclass(frozen=True)
class ProviderConfig:
    id: str
    type: ProviderType
    label: str | None = None
    supabase_url: str | None = None
    supabase_anon_key: str | None = None
    sqlite_path: str | None = None
    connection_url: str | None = None
    access_key: str | None = None


def _is_electron_runtime() -> bool:
    return os.getenv("QURIO_ELECTRON", "0") == "1"


def normalize_provider_type(raw: str | None) -> ProviderType | None:
    normalized = str(raw or "").strip().lower()
    if not normalized:
        return None
    aliases = {
        "supabase": "supabase",
        "sqlite": "sqlite",
        "sqlite local": "sqlite",
        "sqlite-local": "sqlite",
        "postgres": "postgres",
        "postgresql": "postgres",
        "pgsql": "postgres",
        "pg": "postgres",
        "mysql": "mysql",
        "mariadb": "mariadb",
        "maria": "mariadb",
    }
    return aliases.get(normalized)


def _resolve_sqlite_path(raw: str) -> str:
    path = Path(raw)
    if not path.is_absolute():
        backend_dir = Path(__file__).parent.parent
        path = backend_dir / raw
    return str(path.resolve())


def _provider_store_path() -> Path:
    config_dir = os.getenv("QURIO_CONFIG_DIR", "").strip()
    if config_dir:
        base_dir = Path(config_dir)
    else:
        backend_dir = Path(__file__).parent.parent.parent
        base_dir = backend_dir / "data"
    base_dir.mkdir(parents=True, exist_ok=True)
    return base_dir / "db_provider.json"


def _build_provider_from_entry(entry: dict) -> ProviderConfig | None:
    if not isinstance(entry, dict):
        return None
    provider_type = normalize_provider_type(entry.get("type"))
    if not provider_type:
        return None

    provider_id = str(entry.get("id") or DEFAULT_PROVIDER_ID).strip() or DEFAULT_PROVIDER_ID
    label = str(entry.get("label") or provider_type).strip() or provider_type
    access_key = str(entry.get("access_key") or "").strip() or None

    if provider_type == "supabase":
        url = str(entry.get("url") or entry.get("supabase_url") or "").strip() or None
        key = str(entry.get("anon_key") or entry.get("supabase_anon_key") or "").strip() or None
        if not url or not key:
            return None
        return ProviderConfig(
            id=provider_id,
            type="supabase",
            label=label,
            supabase_url=url,
            supabase_anon_key=key,
            access_key=access_key,
        )

    if provider_type == "sqlite":
        raw_path = str(entry.get("path") or entry.get("sqlite_path") or "").strip()
        if not raw_path:
            return None
        return ProviderConfig(
            id=provider_id,
            type="sqlite",
            label=label,
            sqlite_path=_resolve_sqlite_path(raw_path),
            access_key=access_key,
        )

    url = str(entry.get("url") or entry.get("connection_url") or entry.get("database_url") or "").strip()
    if not url:
        return None
    return ProviderConfig(
        id=provider_id,
        type=provider_type,
        label=label,
        connection_url=url,
        access_key=access_key,
    )


def _serialize_provider(provider: ProviderConfig) -> dict:
    payload: dict = {
        "id": provider.id,
        "type": provider.type,
        "label": provider.label,
        "access_key": provider.access_key,
    }
    if provider.type == "supabase":
        payload["url"] = provider.supabase_url
        payload["anon_key"] = provider.supabase_anon_key
    elif provider.type == "sqlite":
        payload["path"] = provider.sqlite_path
    else:
        payload["url"] = provider.connection_url
    return payload


def _parse_legacy_provider_list(raw: str) -> ProviderConfig | None:
    if not raw:
        return None
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        logger.error("Failed to parse provider JSON: %s", exc)
        return None

    entries: list[dict] = []
    if isinstance(payload, list):
        entries = [item for item in payload if isinstance(item, dict)]
    elif isinstance(payload, dict):
        entries = [payload]
    else:
        logger.error("Provider JSON must be an object or array")
        return None

    providers = [provider for provider in (_build_provider_from_entry(entry) for entry in entries) if provider]
    if len(providers) > 1:
        logger.warning(
            "Multiple database providers are configured, but only one backend database is supported now. Using the first entry: %s",
            providers[0].type,
        )
    return providers[0] if providers else None


def _build_provider_from_settings() -> ProviderConfig | None:
    settings = get_settings()

    configured_type = normalize_provider_type(settings.database_provider)
    if configured_type:
        provider_id = DEFAULT_PROVIDER_ID
        label = (settings.database_label or configured_type).strip() or configured_type
        access_key = (settings.db_access_key or "").strip() or None
        if configured_type == "supabase":
            if settings.supabase_url and settings.supabase_password:
                return ProviderConfig(
                    id=provider_id,
                    type="supabase",
                    label=label,
                    supabase_url=settings.supabase_url,
                    supabase_anon_key=settings.supabase_password,
                    access_key=access_key,
                )
            if settings.supabase_url and settings.supabase_service_role_key:
                return ProviderConfig(
                    id=provider_id,
                    type="supabase",
                    label=label,
                    supabase_url=settings.supabase_url,
                    supabase_anon_key=settings.supabase_service_role_key,
                    access_key=access_key,
                )
            return None
        if configured_type == "sqlite":
            if not settings.database_path:
                return None
            return ProviderConfig(
                id=provider_id,
                type="sqlite",
                label=label,
                sqlite_path=_resolve_sqlite_path(settings.database_path),
                access_key=access_key,
            )
        if not settings.database_url:
            return None
        return ProviderConfig(
            id=provider_id,
            type=configured_type,
            label=label,
            connection_url=settings.database_url,
            access_key=access_key,
        )

    return _parse_legacy_provider_list(getattr(settings, "database_providers_json", "") or "")


def _load_provider_config() -> ProviderConfig | None:
    if _is_electron_runtime():
        store_path = _provider_store_path()
        if store_path.exists():
            try:
                payload = json.loads(store_path.read_text(encoding="utf-8"))
                if isinstance(payload, dict):
                    return _build_provider_from_entry(payload)
                if isinstance(payload, list):
                    provider = _parse_legacy_provider_list(json.dumps(payload, ensure_ascii=False))
                    if provider:
                        return provider
            except Exception as exc:
                logger.error("Failed to read provider store file: %s", exc)
        return None

    return _build_provider_from_settings()


class ProviderRegistry:
    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._provider = _load_provider_config()

    def list(self) -> list[ProviderConfig]:
        with self._lock:
            return [self._provider] if self._provider else []

    def get(self, provider_id: str) -> ProviderConfig | None:
        with self._lock:
            if not self._provider:
                return None
            normalized = str(provider_id or "").strip()
            if not normalized:
                return self._provider
            provider_type = normalize_provider_type(normalized)
            if normalized == self._provider.id or provider_type == self._provider.type:
                return self._provider
            return None

    def is_mutable(self) -> bool:
        return _is_electron_runtime()

    def _persist_electron_store(self) -> None:
        if not self.is_mutable():
            return
        store_path = _provider_store_path()
        payload = _serialize_provider(self._provider) if self._provider else {}
        store_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    def upsert(self, provider: ProviderConfig) -> ProviderConfig:
        if not self.is_mutable():
            raise RuntimeError("Provider registry is read-only in non-Electron mode")
        with self._lock:
            normalized_id = provider.id.strip() or DEFAULT_PROVIDER_ID
            self._provider = ProviderConfig(
                id=normalized_id,
                type=provider.type,
                label=provider.label,
                supabase_url=provider.supabase_url,
                supabase_anon_key=provider.supabase_anon_key,
                sqlite_path=provider.sqlite_path,
                connection_url=provider.connection_url,
                access_key=provider.access_key,
            )
            self._persist_electron_store()
            return self._provider

    def remove(self, provider_id: str) -> bool:
        if not self.is_mutable():
            raise RuntimeError("Provider registry is read-only in non-Electron mode")
        with self._lock:
            if not self._provider:
                return False
            normalized = str(provider_id or "").strip()
            provider_type = normalize_provider_type(normalized)
            matched = (
                not normalized
                or normalized == self._provider.id
                or provider_type == self._provider.type
            )
            if not matched:
                return False
            self._provider = None
            self._persist_electron_store()
            return True


_registry: ProviderRegistry | None = None


def get_provider_registry() -> ProviderRegistry:
    global _registry
    if _registry is None:
        _registry = ProviderRegistry()
    return _registry
