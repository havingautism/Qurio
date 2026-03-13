from __future__ import annotations

from abc import ABC, abstractmethod

from ..contracts import ParsedDocument, StructuredDocument


class StructureBuilderBase(ABC):
    @abstractmethod
    def build(self, parsed_document: ParsedDocument) -> StructuredDocument:
        raise NotImplementedError
