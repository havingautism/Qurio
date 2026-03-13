from __future__ import annotations

from abc import ABC, abstractmethod

from ..contracts import ParsedDocument


class DocumentParserBase(ABC):
    @abstractmethod
    def supports(self, *, filename: str, content_type: str) -> bool:
        raise NotImplementedError

    @abstractmethod
    def parse(self, *, document_id: str, filename: str, raw_bytes: bytes) -> ParsedDocument:
        raise NotImplementedError
