"""
Database provider registry and persistence.
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

ProviderType = Literal["supabase", "sqlite"]


@dataclass(frozen=True)
class ProviderConfig:
    id: str
    type: ProviderType
    label: str | None = None
    supabase_url: str | None = None
    supabase_anon_key: str | None = None
    sqlite_path: str | None = None
    access_key: str | None = None


def _is_electron_runtime() -> bool:
    return os.getenv("QURIO_ELECTRON", "0") == "1"


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
    return base_dir / "db_providers.json"


def _build_provider_configs(raw: str) -> list[ProviderConfig]:
    if not raw:
        return []
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        logger.error("Failed to parse provider JSON: %s", exc)
        return []
    if not isinstance(payload, list):
        logger.error("Provider JSON must be an array")
        return []

    providers: list[ProviderConfig] = []
    for entry in payload:
        if not isinstance(entry, dict):
            continue
        provider_type = entry.get("type")
        provider_id = entry.get("id")
        if not provider_type or not provider_id:
            continue
        if provider_type not in {"supabase", "sqlite"}:
            continue
        label = entry.get("label") or None
        access_key = str(entry.get("access_key") or "").strip() or None
        if provider_type == "supabase":
            url = str(entry.get("url") or entry.get("supabase_url") or "").strip() or None
            key = str(entry.get("anon_key") or entry.get("supabase_anon_key") or "").strip() or None
            if not url or not key:
                continue
            providers.append(
                ProviderConfig(
                    id=str(provider_id),
                    type="supabase",
                    label=label,
                    supabase_url=url,
                    supabase_anon_key=key,
                    access_key=access_key,
                )
            )
        else:
            raw_path = str(entry.get("path") or entry.get("sqlite_path") or "").strip()
            if not raw_path:
                continue
            providers.append(
                ProviderConfig(
                    id=str(provider_id),
                    type="sqlite",
                    label=label,
                    sqlite_path=_resolve_sqlite_path(raw_path),
                    access_key=access_key,
                )
            )
    return providers


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
    else:
        payload["path"] = provider.sqlite_path
    return payload


def _load_provider_configs() -> list[ProviderConfig]:
    if _is_electron_runtime():
        store_path = _provider_store_path()
        if store_path.exists():
            try:
                return _build_provider_configs(store_path.read_text(encoding="utf-8"))
            except Exception as exc:
                logger.error("Failed to read provider store file: %s", exc)
        return []

    settings = get_settings()
    raw = getattr(settings, "database_providers_json", "") or ""
    return _build_provider_configs(raw)


class ProviderRegistry:
    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._providers = {p.id: p for p in _load_provider_configs()}

    def list(self) -> list[ProviderConfig]:
        with self._lock:
            return list(self._providers.values())

    def get(self, provider_id: str) -> ProviderConfig | None:
        with self._lock:
            return self._providers.get(provider_id)

    def is_mutable(self) -> bool:
        return _is_electron_runtime()

    def _persist_electron_store(self) -> None:
        if not self.is_mutable():
            return
        store_path = _provider_store_path()
        payload = [_serialize_provider(provider) for provider in self._providers.values()]
        store_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    def upsert(self, provider: ProviderConfig) -> ProviderConfig:
        if not self.is_mutable():
            raise RuntimeError("Provider registry is read-only in non-Electron mode")
        with self._lock:
            self._providers[provider.id] = provider
            self._persist_electron_store()
            return provider

    def remove(self, provider_id: str) -> bool:
        if not self.is_mutable():
            raise RuntimeError("Provider registry is read-only in non-Electron mode")
        with self._lock:
            existed = provider_id in self._providers
            if existed:
                self._providers.pop(provider_id, None)
                self._persist_electron_store()
            return existed


_registry: ProviderRegistry | None = None


def get_provider_registry() -> ProviderRegistry:
    global _registry
    if _registry is None:
        _registry = ProviderRegistry()
    return _registry
