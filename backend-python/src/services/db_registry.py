"""
Database provider registry and client cache.
"""

from __future__ import annotations

import json
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


def _resolve_sqlite_path(raw: str) -> str:
    path = Path(raw)
    if not path.is_absolute():
        backend_dir = Path(__file__).parent.parent
        path = backend_dir / raw
    return str(path.resolve())


def _load_provider_configs() -> list[ProviderConfig]:
    settings = get_settings()
    raw = getattr(settings, "database_providers_json", "") or ""
    if not raw:
        return []
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        logger.error("Failed to parse DATABASE_PROVIDERS JSON: %s", exc)
        return []
    if not isinstance(payload, list):
        logger.error("DATABASE_PROVIDERS must be a JSON array")
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
        if provider_type == "supabase":
            url = entry.get("url") or entry.get("supabase_url")
            key = entry.get("anon_key") or entry.get("supabase_anon_key")
            providers.append(
                ProviderConfig(
                    id=str(provider_id),
                    type="supabase",
                    label=label,
                    supabase_url=str(url) if url else None,
                    supabase_anon_key=str(key) if key else None,
                    access_key=str(entry.get("access_key") or "") or None,
                )
            )
        else:
            raw_path = entry.get("path") or entry.get("sqlite_path")
            if not raw_path:
                continue
            providers.append(
                ProviderConfig(
                    id=str(provider_id),
                    type="sqlite",
                    label=label,
                    sqlite_path=_resolve_sqlite_path(str(raw_path)),
                    access_key=str(entry.get("access_key") or "") or None,
                )
            )
    return providers


class ProviderRegistry:
    def __init__(self) -> None:
        self._providers = {p.id: p for p in _load_provider_configs()}

    def list(self) -> list[ProviderConfig]:
        return list(self._providers.values())

    def get(self, provider_id: str) -> ProviderConfig | None:
        return self._providers.get(provider_id)


_registry: ProviderRegistry | None = None


def get_provider_registry() -> ProviderRegistry:
    global _registry
    if _registry is None:
        _registry = ProviderRegistry()
    return _registry
