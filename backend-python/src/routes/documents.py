from __future__ import annotations

from io import BytesIO
from pathlib import Path
import time
from uuid import uuid4
from zipfile import ZipFile

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pypdf import PdfReader
from xml.etree import ElementTree as ET

from ..services.document_search import TreeSearchDocumentService

router = APIRouter(tags=["documents"])

DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
WORD_NAMESPACE = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
TREESEARCH_STORAGE_ROOT = Path(__file__).resolve().parents[2] / "data" / "document_index"
_treesearch_service = TreeSearchDocumentService(storage_root=TREESEARCH_STORAGE_ROOT)
_document_index_status: dict[str, dict] = {}


def _make_status_key(space_id: str, document_id: str) -> str:
    return f"{space_id}:{document_id}"


def _set_index_status(space_id: str, document_id: str, payload: dict | None):
    key = _make_status_key(space_id, document_id)
    if payload is None:
        _document_index_status.pop(key, None)
        return
    next_payload = dict(payload)
    next_payload["updated_at"] = time.time()
    _document_index_status[key] = next_payload


def _extract_pdf_text(raw_bytes: bytes) -> str:
    reader = PdfReader(BytesIO(raw_bytes))
    parts: list[str] = []
    for page in reader.pages:
      text = page.extract_text() or ""
      trimmed = text.strip()
      if trimmed:
          parts.append(trimmed)
    return "\n\n".join(parts).strip()


def _extract_docx_text(raw_bytes: bytes) -> str:
    with ZipFile(BytesIO(raw_bytes)) as archive:
        with archive.open("word/document.xml") as document_xml:
            tree = ET.parse(document_xml)
    paragraphs: list[str] = []
    for paragraph in tree.findall(".//w:p", WORD_NAMESPACE):
        runs = [node.text or "" for node in paragraph.findall(".//w:t", WORD_NAMESPACE)]
        text = "".join(runs).strip()
        if text:
            paragraphs.append(text)
    return "\n\n".join(paragraphs).strip()


def extract_text_from_bytes(filename: str, content_type: str, raw_bytes: bytes) -> dict[str, str]:
    suffix = Path(filename or "").suffix.lower()
    is_pdf = suffix == ".pdf" or content_type == "application/pdf"
    is_docx = suffix == ".docx" or content_type == DOCX_MIME

    if is_pdf:
        content_text = _extract_pdf_text(raw_bytes)
        return {"content_text": content_text, "file_type": "pdf"}

    if is_docx:
        content_text = _extract_docx_text(raw_bytes)
        return {"content_text": content_text, "file_type": "docx"}

    raise HTTPException(status_code=400, detail="Unsupported document type for backend extraction")


@router.post("/documents/extract")
async def extract_document(file: UploadFile = File(...)):
    filename = file.filename or "document"
    raw_bytes = await file.read()
    if not raw_bytes:
        raise HTTPException(status_code=400, detail="Uploaded document is empty")

    try:
        extracted = extract_text_from_bytes(
            filename=filename,
            content_type=file.content_type or "",
            raw_bytes=raw_bytes,
        )
    except HTTPException:
        raise
    except KeyError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid DOCX structure: {exc}") from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Document extraction failed: {exc}") from exc

    if not extracted["content_text"].strip():
        raise HTTPException(status_code=400, detail="Document extraction produced empty text")

    return {
        "file_name": filename,
        "file_type": extracted["file_type"],
        "content_text": extracted["content_text"],
    }


@router.post("/documents/index")
async def index_document(
    space_id: str = Form(...),
    document_id: str | None = Form(default=None),
    enable_pdf_ocr: bool = Form(default=False),
    ocr_provider: str | None = Form(default=None),
    ocr_model: str | None = Form(default=None),
    ocr_api_key: str | None = Form(default=None),
    ocr_base_url: str | None = Form(default=None),
    file: UploadFile = File(...),
):
    filename = file.filename or "document"
    raw_bytes = await file.read()
    if not raw_bytes:
        raise HTTPException(status_code=400, detail="Uploaded document is empty")

    resolved_document_id = str(document_id or uuid4())
    resolved_ocr_provider = str(ocr_provider or "").strip()
    resolved_ocr_model = str(ocr_model or "").strip()
    resolved_ocr_api_key = str(ocr_api_key or "").strip()
    resolved_ocr_base_url = str(ocr_base_url or "").strip()
    suffix = Path(filename).suffix.lower()
    if enable_pdf_ocr and suffix == ".pdf":
        if not resolved_ocr_provider or not resolved_ocr_model:
            raise HTTPException(
                status_code=400,
                detail="PDF OCR is enabled, but OCR provider/model is missing",
            )
        if not resolved_ocr_api_key:
            raise HTTPException(
                status_code=400,
                detail="PDF OCR is enabled, but OCR API key is missing",
            )

    _set_index_status(
        str(space_id),
        resolved_document_id,
        {
            "status": "loading",
            "stage": "preparing",
            "message": "Preparing document...",
            "current": 0,
            "total": 0,
            "progress": 0,
        },
    )

    def _handle_ocr_progress(current: int, total: int):
        ratio = 0 if total <= 0 else min(max(current / total, 0), 1)
        _set_index_status(
            str(space_id),
            resolved_document_id,
            {
                "status": "loading",
                "stage": "ocr",
                "message": f"OCR in progress ({current}/{total})",
                "current": current,
                "total": total,
                "progress": ratio,
            },
        )

    try:
        result = await _treesearch_service.index_document(
            space_id=str(space_id),
            document_id=resolved_document_id,
            filename=filename,
            raw_bytes=raw_bytes,
            enable_pdf_ocr=enable_pdf_ocr,
            ocr_provider=resolved_ocr_provider,
            ocr_model=resolved_ocr_model,
            ocr_api_key=resolved_ocr_api_key,
            ocr_base_url=resolved_ocr_base_url,
            progress_callback=_handle_ocr_progress if enable_pdf_ocr and suffix == ".pdf" else None,
        )
    except RuntimeError as exc:
        _set_index_status(
            str(space_id),
            resolved_document_id,
            {
                "status": "error",
                "stage": "",
                "message": str(exc),
                "current": 0,
                "total": 0,
                "progress": 0,
            },
        )
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        _set_index_status(
            str(space_id),
            resolved_document_id,
            {
                "status": "error",
                "stage": "",
                "message": f"Document indexing failed: {exc}",
                "current": 0,
                "total": 0,
                "progress": 0,
            },
        )
        raise HTTPException(status_code=400, detail=f"Document indexing failed: {exc}") from exc

    _set_index_status(
        str(space_id),
        resolved_document_id,
        {
            "status": "success",
            "stage": "",
            "message": "Document indexed",
            "current": result.get("ocr_debug", {}).get("total_pages", 0),
            "total": result.get("ocr_debug", {}).get("total_pages", 0),
            "progress": 1,
        },
    )

    file_type = Path(filename).suffix.lower().lstrip(".") or "file"

    return {
        "document_id": resolved_document_id,
        "file_name": filename,
        "file_type": file_type,
        "content_text": result.get("content_text", ""),
        "character_count": result.get("character_count", 0),
        "section_count": result.get("section_count", 0),
        "node_count": result.get("node_count", 0),
        "parse_mode": result.get("parse_mode", "native"),
        "ocr_debug": result.get("ocr_debug", {}),
        "index_db": result.get("index_db"),
    }


@router.get("/documents/index/status/{space_id}/{document_id}")
async def get_document_index_status(space_id: str, document_id: str):
    status = _document_index_status.get(_make_status_key(space_id, document_id))
    if not status:
        return {
            "status": "idle",
            "stage": "",
            "message": "",
            "current": 0,
            "total": 0,
            "progress": 0,
        }
    return status


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
        result = await _treesearch_service.search_documents(
            space_id=space_id,
            document_ids=document_ids,
            query_text=query_text,
            top_k=top_k,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Document search failed: {exc}") from exc

    return result


@router.delete("/documents/index/{space_id}/{document_id}")
async def delete_document_index(space_id: str, document_id: str):
    try:
        result = await _treesearch_service.delete_document_index(
            space_id=space_id,
            document_id=document_id,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Document index deletion failed: {exc}") from exc
    return result
