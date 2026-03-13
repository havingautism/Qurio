from __future__ import annotations

from .base import DocumentParserBase


class ParserRegistry:
    def __init__(self, parsers: list[DocumentParserBase] | None = None):
        self._parsers = parsers or []

    def register(self, parser: DocumentParserBase) -> None:
        self._parsers.append(parser)

    def resolve(self, *, filename: str, content_type: str) -> DocumentParserBase:
        for parser in self._parsers:
            if parser.supports(filename=filename, content_type=content_type):
                return parser
        raise ValueError(f"No document parser available for {filename}")
