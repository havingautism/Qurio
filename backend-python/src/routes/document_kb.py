"""
Filesystem document knowledge-base routes.
"""

from __future__ import annotations

import asyncio
import importlib.util
import re
import time
import zipfile
from io import BytesIO
from pathlib import Path
from threading import Lock
from typing import Any
from uuid import uuid4
from xml.etree import ElementTree

from fastapi import APIRouter, HTTPException, Request, UploadFile, File, Form
from pypdf import PdfReader
from pydantic import BaseModel

from ._request_secrets import get_llm_api_key
from ..services.llm_utils import run_chat_completion, safe_json_parse

router = APIRouter(tags=["document-kb"])
UPLOAD_JOB_TTL_SECONDS = 60 * 60
_upload_jobs: dict[str, dict[str, Any]] = {}
_upload_jobs_lock = Lock()


def _prune_upload_jobs(now: float | None = None) -> None:
    cutoff = (now or time.time()) - UPLOAD_JOB_TTL_SECONDS
    with _upload_jobs_lock:
        expired = [
            job_id
            for job_id, payload in _upload_jobs.items()
            if float(payload.get("updated_at_ts") or 0) < cutoff
        ]
        for job_id in expired:
            _upload_jobs.pop(job_id, None)


def _serialize_upload_job(job: dict[str, Any]) -> dict[str, Any]:
    return {
        "job_id": job["job_id"],
        "status": job["status"],
        "stage": job["stage"],
        "progress": job["progress"],
        "message": job.get("message") or "",
        "file_name": job.get("file_name") or "",
        "document_id": job.get("document_id") or "",
        "result": job.get("result"),
        "error": job.get("error"),
    }


def _create_upload_job(*, file_name: str, document_id: str, space_id: str) -> dict[str, Any]:
    _prune_upload_jobs()
    timestamp = time.time()
    job = {
        "job_id": str(uuid4()),
        "status": "processing",
        "stage": "uploading",
        "progress": 10,
        "message": "Uploading document...",
        "file_name": file_name,
        "document_id": document_id,
        "space_id": space_id,
        "result": None,
        "error": None,
        "updated_at_ts": timestamp,
    }
    with _upload_jobs_lock:
        _upload_jobs[job["job_id"]] = job
    return job


def _get_upload_job(job_id: str) -> dict[str, Any] | None:
    _prune_upload_jobs()
    with _upload_jobs_lock:
        return _upload_jobs.get(job_id)


def _update_upload_job(
    job_id: str,
    *,
    status: str | None = None,
    stage: str | None = None,
    progress: int | None = None,
    message: str | None = None,
    result: dict[str, Any] | None = None,
    error: str | None = None,
) -> dict[str, Any] | None:
    with _upload_jobs_lock:
        job = _upload_jobs.get(job_id)
        if not job:
            return None
        if status is not None:
            job["status"] = status
        if stage is not None:
            job["stage"] = stage
        if progress is not None:
            job["progress"] = progress
        if message is not None:
            job["message"] = message
        if result is not None:
            job["result"] = result
        if error is not None:
            job["error"] = error
        job["updated_at_ts"] = time.time()
        return dict(job)


def _load_document_kb_module():
    skill_root = Path(__file__).parent.parent / "_internal_skills" / "document-kb"
    module_path = skill_root / "scripts" / "kb_cli.py"
    spec = importlib.util.spec_from_file_location("document_kb_cli_runtime", module_path)
    if spec is None or spec.loader is None:
        raise RuntimeError("Unable to load document-kb runtime")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class DocumentKbIngestRequest(BaseModel):
    space_id: str
    doc_id: str
    title: str
    file_type: str
    content_text: str
    provider: str | None = None
    base_url: str | None = None
    model: str | None = None


class DocumentKbLocateRequest(BaseModel):
    space_id: str
    query: str
    limit: int = 3
    document_ids: list[str] | None = None


class DocumentKbReadRequest(BaseModel):
    space_id: str
    doc_id: str
    section_id: str


class DocumentKbDeleteRequest(BaseModel):
    space_id: str
    doc_id: str


def _cleanup_document_knowledge(module: Any, *, space_id: str, document_id: str) -> None:
    try:
        module.delete_document(space_id=space_id, doc_id=document_id)
    except Exception:
        return


def _normalize_extracted_text(text: str) -> str:
    return re.sub(r"\n{3,}", "\n\n", str(text or "").replace("\r\n", "\n").replace("\r", "\n")).strip()


def _extract_text_from_pdf(raw_bytes: bytes) -> str:
    reader = PdfReader(BytesIO(raw_bytes))
    parts = [page.extract_text() or "" for page in reader.pages]
    return _normalize_extracted_text("\n\n".join(part for part in parts if part))


def _extract_text_from_docx(raw_bytes: bytes) -> str:
    with zipfile.ZipFile(BytesIO(raw_bytes)) as archive:
        xml_bytes = archive.read("word/document.xml")
    root = ElementTree.fromstring(xml_bytes)
    namespace = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
    paragraphs: list[str] = []
    for paragraph in root.findall(".//w:p", namespace):
        texts = [node.text or "" for node in paragraph.findall(".//w:t", namespace)]
        combined = "".join(texts).strip()
        if combined:
            paragraphs.append(combined)
    return _normalize_extracted_text("\n\n".join(paragraphs))


def extract_text_from_bytes(*, filename: str, content_type: str | None, raw_bytes: bytes) -> dict[str, str]:
    suffix = Path(filename or "").suffix.lower()
    file_type = suffix.lstrip(".") or "unknown"
    normalized_type = str(content_type or "").lower()
    is_pdf = suffix == ".pdf" or normalized_type == "application/pdf"
    is_docx = suffix == ".docx" or (
        normalized_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )
    is_text = (
        normalized_type.startswith("text/")
        or suffix in {".txt", ".md", ".csv", ".json"}
        or normalized_type in {"application/json", "application/csv"}
    )

    if is_pdf:
        return {"content_text": _extract_text_from_pdf(raw_bytes), "file_type": "pdf"}
    if is_docx:
        return {"content_text": _extract_text_from_docx(raw_bytes), "file_type": "docx"}
    if is_text:
        return {
            "content_text": _normalize_extracted_text(raw_bytes.decode("utf-8", errors="replace")),
            "file_type": file_type,
        }
    raise ValueError("Unsupported file type.")


async def _maybe_structure_with_llm(
    *,
    request: Request,
    provider: str | None,
    base_url: str | None,
    model: str | None,
    title: str,
    file_type: str,
    content_text: str,
) -> dict[str, Any]:
    api_key = get_llm_api_key(request)
    trimmed_text = str(content_text or "").strip()
    if not api_key or not provider or not model or not trimmed_text:
        return {"markdown_text": None, "summary_text": None, "keywords": None, "degraded": True}

    clipped = trimmed_text[:20000]
    prompt = [
        "You are preparing a document for a Markdown filesystem knowledge base.",
        "Return strict JSON only.",
        'Schema: {"markdown_text":"string","summary_text":"string","keywords":["string"]}',
        "Rules:",
        "- Preserve facts from the source text.",
        "- Convert the text into readable Markdown with headings where appropriate.",
        "- Summary must be concise and factual.",
        "- Keywords should be short, retrieval-friendly terms.",
        "- Do not invent content missing from the source.",
        f"Document title: {title}",
        f"File type: {file_type}",
        "Source text:",
        clipped,
    ]
    result = await run_chat_completion(
        provider=provider,
        api_key=api_key,
        base_url=base_url,
        model=model,
        messages=[
            {"role": "system", "content": "Return only valid JSON."},
            {"role": "user", "content": "\n".join(prompt)},
        ],
        response_format={"type": "json_object"},
        temperature=0.2,
    )
    payload = safe_json_parse(result.get("content"))
    if not isinstance(payload, dict):
        return {"markdown_text": None, "summary_text": None, "keywords": None, "degraded": True}
    return {
        "markdown_text": payload.get("markdown_text"),
        "summary_text": payload.get("summary_text"),
        "keywords": payload.get("keywords") if isinstance(payload.get("keywords"), list) else None,
        "degraded": False,
    }


def _validate_section_plan(
    payload: Any,
    *,
    local_chunk_count: int,
    chunk_offset: int = 0,
) -> list[dict[str, Any]]:
    if not isinstance(payload, dict):
        return []
    raw_sections = payload.get("sections")
    if not isinstance(raw_sections, list):
        return []
    sections: list[dict[str, Any]] = []
    max_local_index = max(0, local_chunk_count - 1)
    for raw_section in raw_sections:
        if not isinstance(raw_section, dict):
            continue
        title = str(raw_section.get("title") or "").strip()
        ranges = raw_section.get("chunk_ranges")
        if not title or not isinstance(ranges, list):
            continue
        normalized_ranges: list[list[int]] = []
        for item in ranges:
            if not isinstance(item, list) or len(item) != 2:
                continue
            try:
                start = max(0, min(int(item[0]), max_local_index))
                end = max(0, min(int(item[1]), max_local_index))
            except (TypeError, ValueError):
                continue
            if end < start:
                start, end = end, start
            normalized_ranges.append([start + chunk_offset, end + chunk_offset])
        if normalized_ranges:
            sections.append({"title": title, "chunk_ranges": normalized_ranges})
    return sections


async def _maybe_plan_sections_with_llm(
    *,
    request: Request,
    provider: str | None,
    base_url: str | None,
    model: str | None,
    content_text: str,
    module: Any,
) -> dict[str, Any] | None:
    api_key = get_llm_api_key(request)
    if not api_key or not provider or not model:
        return None

    candidate_chunks = module.build_candidate_chunks(content_text)
    if len(candidate_chunks) <= 1:
        return None

    sections: list[dict[str, Any]] = []
    window_size = 12
    for start in range(0, len(candidate_chunks), window_size):
        window = candidate_chunks[start : start + window_size]
        prompt_lines = [
            "You are defining semantic sections for a document knowledge base.",
            "Return strict JSON only.",
            'Schema: {"sections":[{"title":"string","chunk_ranges":[[start,end]]}]}',
            "Rules:",
            "- Use the provided candidate chunks only.",
            "- chunk_ranges are inclusive and based on the local chunk indices shown below.",
            "- Merge neighboring chunks when they belong to the same topic.",
            "- Keep titles concise and specific.",
            "- Do not rewrite the document text.",
            "- Cover every chunk at least once when possible.",
            "",
            "Candidate chunks:",
        ]
        for local_index, chunk in enumerate(window):
            preview = chunk[: module.MAX_CHUNK_PREVIEW_CHARS].replace("\n", " ").strip()
            prompt_lines.append(f"[{local_index}] {preview}")
        result = await run_chat_completion(
            provider=provider,
            api_key=api_key,
            base_url=base_url,
            model=model,
            messages=[
                {"role": "system", "content": "Return only valid JSON."},
                {"role": "user", "content": "\n".join(prompt_lines)},
            ],
            response_format={"type": "json_object"},
            temperature=0.2,
        )
        payload = safe_json_parse(result.get("content"))
        sections.extend(
            _validate_section_plan(payload, local_chunk_count=len(window), chunk_offset=start)
        )

    if not sections:
        return None
    return {"sections": sections}


async def _run_document_upload_job(
    *,
    job_id: str,
    request: Request,
    space_id: str,
    document_id: str,
    title: str,
    provider: str | None,
    base_url: str | None,
    model: str | None,
    filename: str,
    content_type: str | None,
    raw_bytes: bytes,
) -> None:
    module = None
    try:
        _update_upload_job(
            job_id,
            stage="parsing",
            progress=35,
            message="Extracting and normalizing document text...",
        )
        extracted = extract_text_from_bytes(
            filename=filename,
            content_type=content_type,
            raw_bytes=raw_bytes,
        )
        normalized_text = _normalize_extracted_text(extracted.get("content_text") or "")
        if not normalized_text:
            raise ValueError("No readable text found in this document.")

        job = _get_upload_job(job_id)
        if job and job.get("status") == "cancelled":
            raise RuntimeError("Upload cancelled")

        module = _load_document_kb_module()
        _update_upload_job(
            job_id,
            stage="indexing",
            progress=70,
            message="Building Markdown knowledge files...",
        )
        structured = await _maybe_structure_with_llm(
            request=request,
            provider=provider,
            base_url=base_url,
            model=model,
            title=title,
            file_type=extracted["file_type"],
            content_text=normalized_text,
        )
        section_plan = await _maybe_plan_sections_with_llm(
            request=request,
            provider=provider,
            base_url=base_url,
            model=model,
            content_text=normalized_text,
            module=module,
        )
        job = _get_upload_job(job_id)
        if job and job.get("status") == "cancelled":
            raise RuntimeError("Upload cancelled")

        ingest_result = module.ingest_document(
            space_id=space_id,
            doc_id=document_id,
            title=title,
            file_type=extracted["file_type"],
            content_text=normalized_text,
            markdown_text=structured.get("markdown_text"),
            summary_text=structured.get("summary_text"),
            keywords=structured.get("keywords"),
            section_plan=section_plan,
            degraded=bool(structured.get("degraded")),
        )
        job = _get_upload_job(job_id)
        if job and job.get("status") == "cancelled":
            _cleanup_document_knowledge(module, space_id=space_id, document_id=document_id)
            return
        _update_upload_job(
            job_id,
            status="completed",
            stage="completed",
            progress=100,
            message="Document stored.",
            result={
                "document_id": document_id,
                "title": title,
                "file_type": extracted["file_type"],
                "content_text": normalized_text,
                "character_count": len(normalized_text),
                "section_count": ingest_result.get("section_count", 0),
                "chunk_count": ingest_result.get("chunk_count", 0),
            },
            error=None,
        )
    except Exception as exc:
        if module is None:
            module = _load_document_kb_module()
        _cleanup_document_knowledge(module, space_id=space_id, document_id=document_id)
        _update_upload_job(
            job_id,
            status="cancelled" if str(exc) == "Upload cancelled" else "failed",
            stage="cancelled" if str(exc) == "Upload cancelled" else "failed",
            progress=100,
            message=str(exc),
            error=str(exc),
        )


@router.post("/document-kb/ingest")
async def ingest_document_kb(body: DocumentKbIngestRequest, request: Request):
    module = _load_document_kb_module()
    try:
        structured = await _maybe_structure_with_llm(
            request=request,
            provider=body.provider,
            base_url=body.base_url,
            model=body.model,
            title=body.title,
            file_type=body.file_type,
            content_text=body.content_text,
        )
        section_plan = await _maybe_plan_sections_with_llm(
            request=request,
            provider=body.provider,
            base_url=body.base_url,
            model=body.model,
            content_text=body.content_text,
            module=module,
        )
        result = module.ingest_document(
            space_id=body.space_id,
            doc_id=body.doc_id,
            title=body.title,
            file_type=body.file_type,
            content_text=body.content_text,
            markdown_text=structured.get("markdown_text"),
            summary_text=structured.get("summary_text"),
            keywords=structured.get("keywords"),
            section_plan=section_plan,
            degraded=bool(structured.get("degraded")),
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    return result


@router.post("/document-kb/upload-jobs")
async def create_document_upload_job(
    request: Request,
    file: UploadFile = File(...),
    space_id: str = Form(...),
    title: str | None = Form(None),
    provider: str | None = Form(None),
    base_url: str | None = Form(None),
    model: str | None = Form(None),
):
    try:
        raw_bytes = await file.read()
        if not raw_bytes:
            raise ValueError("Document content is empty")
        document_id = str(uuid4())
        final_title = str(title or file.filename or "Document").strip() or "Document"
        job = _create_upload_job(
            file_name=file.filename or final_title,
            document_id=document_id,
            space_id=space_id,
        )
        asyncio.create_task(
            _run_document_upload_job(
                job_id=job["job_id"],
                request=request,
                space_id=space_id,
                document_id=document_id,
                title=final_title,
                provider=provider,
                base_url=base_url,
                model=model,
                filename=file.filename or final_title,
                content_type=file.content_type,
                raw_bytes=raw_bytes,
            )
        )
        return _serialize_upload_job(job)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/document-kb/upload-jobs/{job_id}")
async def get_document_upload_job(job_id: str):
    job = _get_upload_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Upload job not found.")
    return _serialize_upload_job(job)


@router.post("/document-kb/upload-jobs/{job_id}/cancel")
async def cancel_document_upload_job(job_id: str):
    job = _get_upload_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Upload job not found.")

    module = _load_document_kb_module()
    _cleanup_document_knowledge(
        module,
        space_id=str(job.get("result", {}).get("space_id") or job.get("space_id") or ""),
        document_id=str(job.get("document_id") or ""),
    )
    updated = _update_upload_job(
        job_id,
        status="cancelled",
        stage="cancelled",
        progress=100,
        message="Upload cancelled",
        error="Upload cancelled",
    )
    return _serialize_upload_job(updated or job)


@router.post("/document-kb/extract")
async def extract_document_kb(file: UploadFile = File(...)):
    try:
        raw_bytes = await file.read()
        if not raw_bytes:
            raise ValueError("Document content is empty")
        result = extract_text_from_bytes(
            filename=file.filename or "upload",
            content_type=file.content_type,
            raw_bytes=raw_bytes,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    if not str(result.get("content_text") or "").strip():
        raise HTTPException(status_code=400, detail="No readable text found in this document.")
    return result


@router.post("/document-kb/locate")
async def locate_document_kb(body: DocumentKbLocateRequest):
    module = _load_document_kb_module()
    try:
        return module.locate_document_sections(
            space_id=body.space_id,
            query=body.query,
            limit=body.limit,
            document_ids=body.document_ids,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/document-kb/read")
async def read_document_kb(body: DocumentKbReadRequest):
    module = _load_document_kb_module()
    try:
        return module.read_document_section(
            space_id=body.space_id,
            doc_id=body.doc_id,
            section_id=body.section_id,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/document-kb/delete")
async def delete_document_kb(body: DocumentKbDeleteRequest):
    module = _load_document_kb_module()
    try:
        return module.delete_document(space_id=body.space_id, doc_id=body.doc_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
