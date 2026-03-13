from __future__ import annotations

from pathlib import Path

from ..contracts import ParsedDocument
from .base import DocumentParserBase


class TextDocumentParser(DocumentParserBase):
    SUPPORTED_SUFFIXES = {".txt", ".csv", ".json"}

    def supports(self, *, filename: str, content_type: str) -> bool:
        return Path(filename).suffix.lower() in self.SUPPORTED_SUFFIXES

    def parse(self, *, document_id: str, filename: str, raw_bytes: bytes) -> ParsedDocument:
        text = raw_bytes.decode("utf-8", errors="ignore").strip()
        return ParsedDocument(
            document_id=document_id,
            title=Path(filename).stem or filename,
            source_type=Path(filename).suffix.lower().lstrip(".") or "text",
            text=text,
        )
