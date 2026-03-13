"""Qurio document retrieval kernel.

Internal module name:
    document_engine

Long-term product direction:
    provider-agnostic structured retrieval engine

This package defines the stable contracts and orchestration layer for
document parsing, structure building, indexing, and retrieval.
"""

from .contracts import (
    DocumentEngineConfig,
    ParsedBlock,
    ParsedDocument,
    ParsedPage,
    SearchHit,
    StructuredDocument,
    StructuredNode,
)
from .service import DocumentEngineService

__all__ = [
    "DocumentEngineConfig",
    "DocumentEngineService",
    "ParsedBlock",
    "ParsedDocument",
    "ParsedPage",
    "SearchHit",
    "StructuredDocument",
    "StructuredNode",
]
