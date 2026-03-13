from __future__ import annotations

from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from ..services.document_engine import DocumentEngineService

router = APIRouter(tags=["documents"])

DOCUMENT_ENGINE_STORAGE_ROOT = Path(__file__).resolve().parents[2] / "data" / "document_index"
_document_engine = DocumentEngineService(storage_root=DOCUMENT_ENGINE_STORAGE_ROOT)


@router.post("/documents/extract")
async def extract_document(file: UploadFile = File(...)):
    filename = file.filename or "document"
    raw_bytes = await file.read()
    if not raw_bytes:
        raise HTTPException(status_code=400, detail="Uploaded document is empty")

    try:
        parsed = _document_engine.parse_document(
            document_id="preview",
            filename=filename,
            content_type=file.content_type or "",
            raw_bytes=raw_bytes,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Document extraction failed: {exc}") from exc

    if not parsed.text.strip():
        raise HTTPException(status_code=400, detail="Document extraction produced empty text")

    return {
        "file_name": filename,
        "file_type": parsed.source_type,
        "content_text": parsed.text,
    }


@router.post("/documents/index")
async def index_document(
    space_id: str = Form(...),
    document_id: str | None = Form(default=None),
    file: UploadFile = File(...),
):
    filename = file.filename or "document"
    raw_bytes = await file.read()
    if not raw_bytes:
        raise HTTPException(status_code=400, detail="Uploaded document is empty")

    resolved_document_id = str(document_id or uuid4())

    try:
        result = await _document_engine.index_document(
            space_id=str(space_id),
            document_id=resolved_document_id,
            filename=filename,
            content_type=file.content_type or "",
            raw_bytes=raw_bytes,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Document indexing failed: {exc}") from exc

    file_type = Path(filename).suffix.lower().lstrip(".") or "file"

    return {
        "document_id": resolved_document_id,
        "file_name": filename,
        "file_type": file_type,
        "content_text": result.get("content_text", ""),
        "character_count": result.get("character_count", 0),
        "section_count": result.get("section_count", 0),
        "node_count": result.get("node_count", 0),
        "index_db": result.get("index_db"),
    }


@router.post("/documents/search")
async def search_documents(
    payload: dict,
):
    space_id = str(payload.get("space_id") or "").strip()
    query_text = str(payload.get("query_text") or "").strip()
    document_ids = payload.get("document_ids") or []
    top_k = int(payload.get("top_k") or 5)

    if not space_id:
        raise HTTPException(status_code=400, detail="space_id is required")
    if not query_text:
        return {"documents": [], "query": ""}

    try:
        result = await _document_engine.search_documents(
            space_id=space_id,
            document_ids=document_ids,
            query_text=query_text,
            top_k=top_k,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Document search failed: {exc}") from exc

    return result


@router.delete("/documents/index/{space_id}/{document_id}")
async def delete_document_index(space_id: str, document_id: str):
    try:
        result = await _document_engine.delete_document(
            space_id=space_id,
            document_id=document_id,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Document index deletion failed: {exc}") from exc
    return result
