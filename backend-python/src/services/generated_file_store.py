"""
Persistent generated file storage with sidecar metadata.
"""

from __future__ import annotations

import json
import secrets
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

_SUPPORTED_KINDS = {
    "pptx": ".pptx",
    "excel": ".xlsx",
}


def _generated_root() -> Path:
    root = Path(__file__).resolve().parents[2]
    directory = root / ".documents" / "generated"
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def _kind_directory(kind: str) -> Path:
    normalized_kind = str(kind or "").strip().lower()
    if normalized_kind not in _SUPPORTED_KINDS:
        raise ValueError(f"Unsupported generated file kind: {kind}")
    directory = _generated_root() / normalized_kind
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def _utc_now() -> datetime:
    return datetime.now(UTC)


def _sidecar_path(file_path: Path) -> Path:
    return file_path.with_suffix(".meta.json")


def create_generated_file_path(kind: str) -> Path:
    normalized_kind = str(kind or "").strip().lower()
    extension = _SUPPORTED_KINDS[normalized_kind]
    stamp = _utc_now().strftime("%Y%m%dT%H%M%S")
    file_id = f"{normalized_kind}-{stamp}-{secrets.token_hex(6)}"
    return _kind_directory(normalized_kind) / f"{file_id}{extension}"


def register_generated_file(
    *,
    kind: str,
    file_path: str | Path,
    filename: str,
    title: str | None = None,
    source_tool: str | None = None,
    mime_type: str | None = None,
    extra_metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    normalized_kind = str(kind or "").strip().lower()
    if normalized_kind not in _SUPPORTED_KINDS:
        raise ValueError(f"Unsupported generated file kind: {kind}")

    path = Path(file_path).resolve()
    if not path.exists():
        raise FileNotFoundError(path)

    created_at = _utc_now().isoformat()
    file_id = path.stem
    metadata = {
        "file_id": file_id,
        "kind": normalized_kind,
        "filename": str(filename or path.name),
        "title": str(title or "").strip(),
        "source_tool": str(source_tool or "").strip(),
        "mime_type": str(mime_type or "").strip(),
        "created_at": created_at,
        "path": str(path),
        "relative_path": str(path.relative_to(_generated_root())),
    }
    if isinstance(extra_metadata, dict):
        metadata.update(extra_metadata)
    _sidecar_path(path).write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return {
        "file_id": file_id,
        "download_url": f"/api/files/{normalized_kind}/{file_id}",
        "created_at": created_at,
    }


def get_generated_file(kind: str, file_id: str) -> dict[str, Any] | None:
    normalized_kind = str(kind or "").strip().lower()
    if normalized_kind not in _SUPPORTED_KINDS:
        return None
    normalized_id = str(file_id or "").strip()
    if not normalized_id:
        return None

    file_path = _kind_directory(normalized_kind) / f"{normalized_id}{_SUPPORTED_KINDS[normalized_kind]}"
    sidecar_path = _sidecar_path(file_path)
    if not file_path.exists() or not sidecar_path.exists():
        return None

    try:
        raw = json.loads(sidecar_path.read_text(encoding="utf-8"))
    except Exception:
        return None
    if not isinstance(raw, dict):
        return None

    raw["path"] = str(file_path)
    raw["file_id"] = normalized_id
    raw["kind"] = normalized_kind
    return raw


def list_generated_files(kind: str | None = None) -> list[dict[str, Any]]:
    candidate_kinds = [str(kind).strip().lower()] if kind else list(_SUPPORTED_KINDS.keys())
    items: list[dict[str, Any]] = []
    for candidate_kind in candidate_kinds:
        if candidate_kind not in _SUPPORTED_KINDS:
            continue
        for sidecar_path in sorted(_kind_directory(candidate_kind).glob("*.meta.json"), reverse=True):
            try:
                raw = json.loads(sidecar_path.read_text(encoding="utf-8"))
            except Exception:
                continue
            if not isinstance(raw, dict):
                continue
            file_id = str(raw.get("file_id") or sidecar_path.name.replace(".meta.json", "")).strip()
            file_path = _kind_directory(candidate_kind) / f"{file_id}{_SUPPORTED_KINDS[candidate_kind]}"
            if not file_path.exists():
                continue
            raw["path"] = str(file_path)
            raw["file_id"] = file_id
            raw["kind"] = candidate_kind
            items.append(raw)

    items.sort(key=lambda item: str(item.get("created_at") or ""), reverse=True)
    return items


def delete_generated_file(kind: str, file_id: str) -> bool:
    normalized_kind = str(kind or "").strip().lower()
    if normalized_kind not in _SUPPORTED_KINDS:
        return False
    normalized_id = str(file_id or "").strip()
    if not normalized_id:
        return False

    file_path = _kind_directory(normalized_kind) / f"{normalized_id}{_SUPPORTED_KINDS[normalized_kind]}"
    sidecar_path = _sidecar_path(file_path)
    existed = False

    if sidecar_path.exists():
        sidecar_path.unlink()
        existed = True
    if file_path.exists():
        file_path.unlink()
        existed = True

    return existed
