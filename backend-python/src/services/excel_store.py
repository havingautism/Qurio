"""
Persistent storage wrappers for generated Excel files.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from .generated_file_store import create_generated_file_path
from .generated_file_store import delete_generated_file
from .generated_file_store import get_generated_file
from .generated_file_store import list_generated_files
from .generated_file_store import register_generated_file


def create_excel_path() -> Path:
    return create_generated_file_path("excel")


def register_excel_file(
    file_path: str,
    filename: str,
    *,
    ttl_seconds: int | None = None,
    extra_metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    del ttl_seconds
    return register_generated_file(
        kind="excel",
        file_path=file_path,
        filename=filename,
        title=Path(filename).stem,
        source_tool="excel_generator",
        mime_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        extra_metadata=extra_metadata,
    )


def get_excel_file(token: str) -> dict[str, Any] | None:
    return get_generated_file("excel", token)


def list_excel_files() -> list[dict[str, Any]]:
    return list_generated_files("excel")


def delete_excel_file(file_id: str) -> bool:
    return delete_generated_file("excel", file_id)
