"""
Temporary file download routes.
"""

from __future__ import annotations

import re
from typing import Any

from fastapi import APIRouter, Body, HTTPException, Query
from fastapi.responses import FileResponse

from ..services.pptx_builder import build_pptx_file_async
from ..services.excel_builder import build_excel_file
from ..services.excel_schema import build_excel_payload
from ..services.excel_store import create_excel_path
from ..services.excel_store import delete_excel_file
from ..services.excel_store import get_excel_file
from ..services.excel_store import list_excel_files
from ..services.excel_store import register_excel_file
from ..services.pptx_schema import build_pptx_payload
from ..services.pptx_store import create_pptx_path
from ..services.pptx_store import delete_pptx_file
from ..services.pptx_store import get_pptx_file
from ..services.pptx_store import list_pptx_files
from ..services.pptx_store import register_pptx_file

router = APIRouter(tags=["files"])


def _sanitize_pptx_filename(raw_title: Any) -> str:
    title = str(raw_title or "Generated Presentation").strip()
    if not title:
        title = "Generated Presentation"
    title = re.sub(r"[\\/:*?\"<>|]+", " ", title)
    title = re.sub(r"\s+", " ", title).strip()
    if not title.lower().endswith(".pptx"):
        title = f"{title}.pptx"
    return title


def _sanitize_excel_filename(raw_title: Any) -> str:
    title = str(raw_title or "Generated Workbook").strip()
    if not title:
        title = "Generated Workbook"
    title = re.sub(r"[\\/:*?\"<>|]+", " ", title)
    title = re.sub(r"\s+", " ", title).strip()
    if not title.lower().endswith(".xlsx"):
        title = f"{title}.xlsx"
    return title


def _normalize_generated_file_item(raw: dict[str, Any]) -> dict[str, Any]:
    kind = str(raw.get("kind") or "").strip().lower()
    file_id = str(raw.get("file_id") or "").strip()
    filename = str(raw.get("filename") or "").strip()
    title = str(raw.get("title") or "").strip()
    created_at = str(raw.get("created_at") or "").strip()
    source_tool = str(raw.get("source_tool") or "").strip()
    mime_type = str(raw.get("mime_type") or "").strip()
    return {
        "file_id": file_id,
        "kind": kind,
        "filename": filename,
        "title": title,
        "created_at": created_at,
        "source_tool": source_tool,
        "mime_type": mime_type,
        "download_url": f"/api/files/{kind}/{file_id}" if kind and file_id else "",
    }


def _normalize_generated_file_detail(raw: dict[str, Any]) -> dict[str, Any]:
    item = _normalize_generated_file_item(raw)
    if item["kind"] == "pptx":
        item.update(
            {
                "slide_count": int(raw.get("slide_count") or 0),
                "preview_html": str(raw.get("preview_html") or ""),
                "preview_height": int(raw.get("preview_height") or 560),
                "qa_issues": raw.get("qa_issues") if isinstance(raw.get("qa_issues"), list) else [],
                "render_mode_used": str(raw.get("render_mode_used") or ""),
            }
        )
    if item["kind"] == "excel":
        item.update(
            {
                "sheet_count": int(raw.get("sheet_count") or 0),
                "preview": raw.get("preview") if isinstance(raw.get("preview"), dict) else {"sheets": []},
            }
        )
    return item


@router.get("/files/generated")
async def list_generated_files(
    kind: str | None = Query(default=None),
    q: str | None = Query(default=None),
    sort: str = Query(default="desc"),
):
    normalized_kind = str(kind or "").strip().lower()
    if normalized_kind not in {"", "pptx", "excel"}:
        raise HTTPException(status_code=400, detail="Unsupported file kind")

    items: list[dict[str, Any]] = []
    if not normalized_kind or normalized_kind == "pptx":
        items.extend(_normalize_generated_file_item(item) for item in list_pptx_files())
    if not normalized_kind or normalized_kind == "excel":
        items.extend(_normalize_generated_file_item(item) for item in list_excel_files())

    search_query = str(q or "").strip().lower()
    if search_query:
        items = [
            item
            for item in items
            if search_query in str(item.get("filename") or "").lower()
            or search_query in str(item.get("title") or "").lower()
        ]

    reverse = str(sort or "desc").strip().lower() != "asc"
    items.sort(key=lambda item: str(item.get("created_at") or ""), reverse=reverse)

    return {
        "items": items,
        "count": len(items),
    }


@router.delete("/files/generated/{kind}/{file_id}")
async def delete_generated_file_route(kind: str, file_id: str):
    normalized_kind = str(kind or "").strip().lower()
    normalized_id = str(file_id or "").strip()
    if normalized_kind not in {"pptx", "excel"}:
        raise HTTPException(status_code=400, detail="Unsupported file kind")
    if not normalized_id or len(normalized_id) < 8:
        raise HTTPException(status_code=400, detail="Invalid file id")

    deleted = delete_pptx_file(normalized_id) if normalized_kind == "pptx" else delete_excel_file(normalized_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="File not found")

    return {
        "ok": True,
        "file_id": normalized_id,
        "kind": normalized_kind,
    }


@router.get("/files/generated/{kind}/{file_id}")
async def get_generated_file_detail_route(kind: str, file_id: str):
    normalized_kind = str(kind or "").strip().lower()
    normalized_id = str(file_id or "").strip()
    if normalized_kind not in {"pptx", "excel"}:
        raise HTTPException(status_code=400, detail="Unsupported file kind")
    if not normalized_id or len(normalized_id) < 8:
        raise HTTPException(status_code=400, detail="Invalid file id")

    meta = get_pptx_file(normalized_id) if normalized_kind == "pptx" else get_excel_file(normalized_id)
    if not meta:
        raise HTTPException(status_code=404, detail="File not found")

    return _normalize_generated_file_detail(meta)


@router.get("/files/pptx/{file_id}")
async def download_pptx_file(file_id: str):
    if not file_id or len(file_id) < 8:
        raise HTTPException(status_code=400, detail="Invalid file id")

    meta = get_pptx_file(file_id)
    if not meta:
        raise HTTPException(status_code=404, detail="File not found")

    return FileResponse(
        path=str(meta["path"]),
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        filename=str(meta.get("filename") or "presentation.pptx"),
    )


@router.get("/files/excel/{file_id}")
async def download_excel_file(file_id: str):
    if not file_id or len(file_id) < 8:
        raise HTTPException(status_code=400, detail="Invalid file id")

    meta = get_excel_file(file_id)
    if not meta:
        raise HTTPException(status_code=404, detail="File not found")

    return FileResponse(
        path=str(meta["path"]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename=str(meta.get("filename") or "workbook.xlsx"),
    )


@router.post("/files/pptx/rebuild")
async def rebuild_pptx_file(payload: dict[str, Any] = Body(...)):
    request_payload = build_pptx_payload(payload or {})
    if request_payload.get("type") == "pptx_error":
        return request_payload

    output_path = create_pptx_path()
    render_result = await build_pptx_file_async(request_payload, str(output_path))
    if render_result.get("type") == "pptx_error":
        return render_result

    file_name = _sanitize_pptx_filename(request_payload.get("title"))
    registered = register_pptx_file(
        file_path=str(output_path),
        filename=file_name,
        extra_metadata={
            "slide_count": int(render_result.get("slide_count") or 0),
            "preview_html": str(render_result.get("preview_html") or ""),
            "preview_height": int(render_result.get("preview_height") or 560),
            "qa_issues": render_result.get("qa_issues") if isinstance(render_result.get("qa_issues"), list) else [],
            "render_mode_used": str(render_result.get("render_mode_used") or "semantic"),
        },
    )
    return {
        "type": "pptx_file",
        "title": request_payload.get("title") or "Generated Presentation",
        "slide_count": int(render_result.get("slide_count") or 0),
        "filename": file_name,
        "download_url": registered["download_url"],
        "preview_html": str(render_result.get("preview_html") or ""),
        "preview_height": int(render_result.get("preview_height") or 560),
        "qa_issues": render_result.get("qa_issues") if isinstance(render_result.get("qa_issues"), list) else [],
        "render_mode_used": str(render_result.get("render_mode_used") or "semantic"),
    }


@router.post("/files/excel/rebuild")
async def rebuild_excel_file(payload: dict[str, Any] = Body(...)):
    request_payload = build_excel_payload(payload or {})
    if request_payload.get("type") == "excel_error":
        return request_payload

    output_path = create_excel_path()
    render_result = build_excel_file(request_payload, str(output_path))
    if render_result.get("type") == "excel_error":
        return render_result

    file_name = _sanitize_excel_filename(request_payload.get("title"))
    registered = register_excel_file(
        file_path=str(output_path),
        filename=file_name,
        extra_metadata={
            "sheet_count": int(render_result.get("sheet_count") or 0),
            "preview": render_result.get("preview") if isinstance(render_result.get("preview"), dict) else {"sheets": []},
        },
    )
    return {
        "type": "excel_file",
        "title": request_payload.get("title") or "Generated Workbook",
        "sheet_count": int(render_result.get("sheet_count") or 0),
        "filename": file_name,
        "download_url": registered["download_url"],
        "preview": render_result.get("preview") if isinstance(render_result.get("preview"), dict) else {"sheets": []},
    }
