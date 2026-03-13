from __future__ import annotations

from io import BytesIO
from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree as ET

from ..contracts import ParsedDocument
from .base import DocumentParserBase


WORD_NAMESPACE = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}


class DocxDocumentParser(DocumentParserBase):
    DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

    def supports(self, *, filename: str, content_type: str) -> bool:
        return Path(filename).suffix.lower() == ".docx" or content_type == self.DOCX_MIME

    def parse(self, *, document_id: str, filename: str, raw_bytes: bytes) -> ParsedDocument:
        with ZipFile(BytesIO(raw_bytes)) as archive:
            with archive.open("word/document.xml") as document_xml:
                tree = ET.parse(document_xml)
        paragraphs: list[str] = []
        for paragraph in tree.findall(".//w:p", WORD_NAMESPACE):
            runs = [node.text or "" for node in paragraph.findall(".//w:t", WORD_NAMESPACE)]
            text = "".join(runs).strip()
            if text:
                paragraphs.append(text)
        return ParsedDocument(
            document_id=document_id,
            title=Path(filename).stem or filename,
            source_type="docx",
            text="\n\n".join(paragraphs).strip(),
        )
