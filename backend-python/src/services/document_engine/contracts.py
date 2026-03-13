from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class OcrConfig:
    enabled: bool = False
    provider: str | None = None
    model: str | None = None

    def validate(self) -> None:
        if self.enabled and (not self.provider or not self.model):
            raise ValueError("OCR enabled requires both ocr_provider and ocr_model")


@dataclass(frozen=True)
class DocumentEngineConfig:
    ocr: OcrConfig = field(default_factory=OcrConfig)


@dataclass(frozen=True)
class ParsedPage:
    page_number: int
    text: str = ""
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ParsedBlock:
    block_id: str
    text: str
    page_number: int | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ParsedDocument:
    document_id: str
    title: str
    source_type: str
    text: str
    pages: list[ParsedPage] = field(default_factory=list)
    blocks: list[ParsedBlock] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)
    ocr_used: bool = False


@dataclass(frozen=True)
class StructuredNode:
    node_id: str
    title: str
    text: str
    summary: str = ""
    parent_id: str | None = None
    title_path: tuple[str, ...] = field(default_factory=tuple)
    line_start: int | None = None
    line_end: int | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class StructuredDocument:
    document_id: str
    title: str
    nodes: list[StructuredNode]
    edges: list[tuple[str, str]] = field(default_factory=list)
    root_node_ids: list[str] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class SearchHit:
    doc_id: str
    doc_name: str
    node_id: str
    title: str
    title_path: tuple[str, ...]
    snippet: str
    score: float
    metadata: dict[str, Any] = field(default_factory=dict)

