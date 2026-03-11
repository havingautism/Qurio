from __future__ import annotations

from io import BytesIO
from pathlib import Path
from zipfile import ZipFile

from fastapi import APIRouter, File, HTTPException, UploadFile
from pypdf import PdfReader
from xml.etree import ElementTree as ET

router = APIRouter(tags=["documents"])

DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
WORD_NAMESPACE = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}


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
