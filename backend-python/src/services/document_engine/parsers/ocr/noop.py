from __future__ import annotations

from .base import OcrProviderBase


class NoopOcrProvider(OcrProviderBase):
    def parse(self, *, document_id: str, filename: str, raw_bytes: bytes, config):
        raise RuntimeError("OCR provider is not configured")
