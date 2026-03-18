"""
Temporary storage for generated PPTX files.
"""

from __future__ import annotations

import os
import secrets
from datetime import UTC, datetime, timedelta
from pathlib import Path
from threading import Lock
from typing import Any

_STORE_LOCK = Lock()
_STORE: dict[str, dict[str, Any]] = {}
_DEFAULT_TTL_SECONDS = 30 * 60


def _runtime_dir() -> Path:
    root = Path(__file__).resolve().parents[2]
    directory = root / ".runtime" / "exports" / "pptx"
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def create_pptx_path() -> Path:
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%S")
    return _runtime_dir() / f"pptx-{stamp}-{secrets.token_hex(6)}.pptx"


def _now() -> datetime:
    return datetime.now(UTC)


def _purge_expired_locked(now: datetime) -> None:
    expired_tokens = [token for token, meta in _STORE.items() if meta.get("expires_at") and meta["expires_at"] <= now]
    for token in expired_tokens:
        meta = _STORE.pop(token, None)
        if not meta:
            continue
        file_path = meta.get("path")
        if file_path and os.path.exists(file_path):
            try:
                os.remove(file_path)
            except OSError:
                pass


def register_pptx_file(file_path: str, filename: str, *, ttl_seconds: int = _DEFAULT_TTL_SECONDS) -> dict[str, Any]:
    token = secrets.token_urlsafe(18)
    now = _now()
    expires_at = now + timedelta(seconds=max(60, int(ttl_seconds)))
    with _STORE_LOCK:
        _purge_expired_locked(now)
        _STORE[token] = {
            "path": file_path,
            "filename": filename,
            "expires_at": expires_at,
        }
    return {
        "token": token,
        "download_url": f"/api/files/pptx/{token}",
        "expires_at": expires_at.isoformat(),
    }


def get_pptx_file(token: str) -> dict[str, Any] | None:
    now = _now()
    with _STORE_LOCK:
        _purge_expired_locked(now)
        meta = _STORE.get(token)
        if not meta:
            return None
        if not os.path.exists(str(meta.get("path") or "")):
            _STORE.pop(token, None)
            return None
        return dict(meta)
