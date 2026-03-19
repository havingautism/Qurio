"""
Temporary file download routes.
"""

from __future__ import annotations

import re
from typing import Any

from fastapi import APIRouter, Body, HTTPException
from fastapi.responses import FileResponse

from ..services.pptx_builder import build_pptx_file_async
from ..services.pptx_schema import build_pptx_payload
from ..services.pptx_store import create_pptx_path
from ..services.pptx_store import get_pptx_file
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


@router.get("/files/pptx/{token}")
async def download_pptx_file(token: str):
    if not token or len(token) < 8:
        raise HTTPException(status_code=400, detail="Invalid token")

    meta = get_pptx_file(token)
    if not meta:
        raise HTTPException(status_code=404, detail="File not found or expired")

    return FileResponse(
        path=str(meta["path"]),
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        filename=str(meta.get("filename") or "presentation.pptx"),
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
    registered = register_pptx_file(file_path=str(output_path), filename=file_name)
    return {
        "type": "pptx_file",
        "title": request_payload.get("title") or "Generated Presentation",
        "slide_count": int(render_result.get("slide_count") or 0),
        "filename": file_name,
        "download_url": registered["download_url"],
        "expires_at": registered["expires_at"],
        "preview_html": str(render_result.get("preview_html") or ""),
        "preview_height": int(render_result.get("preview_height") or 560),
        "qa_issues": render_result.get("qa_issues") if isinstance(render_result.get("qa_issues"), list) else [],
        "render_mode_used": str(render_result.get("render_mode_used") or "semantic"),
    }
