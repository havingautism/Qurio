from __future__ import annotations

from io import BytesIO
from pathlib import Path

from pypdf import PdfReader

from ..contracts import ParsedDocument, ParsedPage
from .base import DocumentParserBase


class PdfDocumentParser(DocumentParserBase):
    def supports(self, *, filename: str, content_type: str) -> bool:
        return Path(filename).suffix.lower() == ".pdf" or content_type == "application/pdf"

    def parse(self, *, document_id: str, filename: str, raw_bytes: bytes) -> ParsedDocument:
        reader = PdfReader(BytesIO(raw_bytes))
        pages: list[ParsedPage] = []
        parts: list[str] = []
        for index, page in enumerate(reader.pages, start=1):
            text = (page.extract_text() or "").strip()
            if text:
                parts.append(text)
            pages.append(ParsedPage(page_number=index, text=text))
        return ParsedDocument(
            document_id=document_id,
            title=Path(filename).stem or filename,
            source_type="pdf",
            text="\n\n".join(part for part in parts if part).strip(),
            pages=pages,
        )
