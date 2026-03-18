"""
Temporary file download routes.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from ..services.pptx_store import get_pptx_file

router = APIRouter(tags=["files"])


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
