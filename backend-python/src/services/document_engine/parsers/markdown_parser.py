from __future__ import annotations

from pathlib import Path

from ..contracts import ParsedDocument
from .base import DocumentParserBase


class MarkdownDocumentParser(DocumentParserBase):
    def supports(self, *, filename: str, content_type: str) -> bool:
        suffix = Path(filename).suffix.lower()
        return suffix == ".md" or content_type == "text/markdown"

    def parse(self, *, document_id: str, filename: str, raw_bytes: bytes) -> ParsedDocument:
        text = raw_bytes.decode("utf-8", errors="ignore").strip()
        return ParsedDocument(
            document_id=document_id,
            title=Path(filename).stem or filename,
            source_type="md",
            text=text,
        )
