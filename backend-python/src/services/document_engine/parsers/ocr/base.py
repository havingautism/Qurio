from __future__ import annotations

from abc import ABC, abstractmethod

from ...contracts import OcrConfig, ParsedDocument


class OcrProviderBase(ABC):
    @abstractmethod
    def parse(self, *, document_id: str, filename: str, raw_bytes: bytes, config: OcrConfig) -> ParsedDocument:
        raise NotImplementedError
