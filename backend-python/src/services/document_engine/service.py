from __future__ import annotations

from pathlib import Path

from ...config import get_settings
from .contracts import DocumentEngineConfig
from .engines import StructuredLexicalEngine
from .index_backends import FilesystemIndexBackend, PostgresLexicalBackend
from .parsers import ParserRegistry
from .parsers.docx_parser import DocxDocumentParser
from .parsers.markdown_parser import MarkdownDocumentParser
from .parsers.ocr.noop import NoopOcrProvider
from .parsers.pdf_parser import PdfDocumentParser
from .parsers.text_parser import TextDocumentParser
from .structure import DefaultStructureBuilder
from ..db_registry import get_provider_registry


class DocumentEngineService:
    def __init__(
        self,
        *,
        storage_root: str | Path,
        config: DocumentEngineConfig | None = None,
        parser_registry=None,
        structure_builder=None,
        backend=None,
        engine=None,
    ):
        self.storage_root = Path(storage_root)
        self.config = config or DocumentEngineConfig()
        self._backend_override = backend
        self.parser_registry = parser_registry or ParserRegistry(
            [
                MarkdownDocumentParser(),
                PdfDocumentParser(),
                DocxDocumentParser(),
                TextDocumentParser(),
            ]
        )
        self.structure_builder = structure_builder or DefaultStructureBuilder()
        self.engine = engine or StructuredLexicalEngine()
        self.ocr_provider = NoopOcrProvider()

    def _resolve_backend(self):
        if self._backend_override is not None:
            return self._backend_override
        providers = get_provider_registry().list()
        provider = providers[0] if providers else None
        provider_id = getattr(provider, "id", "default")
        provider_type = getattr(provider, "type", "sqlite")

        if provider and provider_type == "postgres" and getattr(provider, "connection_url", None):
            return PostgresLexicalBackend(
                self.storage_root,
                provider=provider,
            )

        if provider and provider_type == "supabase":
            settings = get_settings()
            if settings.supabase_db_url:
                return PostgresLexicalBackend(
                    self.storage_root,
                    provider=provider,
                )

        return FilesystemIndexBackend(
            self.storage_root,
            provider_id=provider_id,
            provider_type=provider_type,
        )

    def _parse_document(self, *, document_id: str, filename: str, content_type: str, raw_bytes: bytes):
        self.config.ocr.validate()
        if self.config.ocr.enabled:
            return self.ocr_provider.parse(
                document_id=document_id,
                filename=filename,
                raw_bytes=raw_bytes,
                config=self.config.ocr,
            )
        parser = self.parser_registry.resolve(filename=filename, content_type=content_type)
        return parser.parse(document_id=document_id, filename=filename, raw_bytes=raw_bytes)

    def parse_document(
        self,
        *,
        document_id: str,
        filename: str,
        content_type: str,
        raw_bytes: bytes,
    ):
        return self._parse_document(
            document_id=document_id,
            filename=filename,
            content_type=content_type,
            raw_bytes=raw_bytes,
        )

    async def index_document(
        self,
        *,
        space_id: str,
        document_id: str,
        filename: str,
        content_type: str,
        raw_bytes: bytes,
    ):
        backend = self._resolve_backend()
        paths = backend.get_document_paths(space_id=space_id, document_id=document_id, filename=filename)
        paths.original_dir.mkdir(parents=True, exist_ok=True)
        paths.index_dir.mkdir(parents=True, exist_ok=True)
        paths.original_file.write_bytes(raw_bytes)

        parsed_document = self._parse_document(
            document_id=document_id,
            filename=filename,
            content_type=content_type,
            raw_bytes=raw_bytes,
        )
        structured_document = self.structure_builder.build(parsed_document)
        return await self.engine.index_document(
            backend=backend,
            paths=paths,
            document_id=document_id,
            filename=filename,
            raw_bytes=raw_bytes,
            parsed_document=parsed_document,
            structured_document=structured_document,
        )

    async def search_documents(
        self,
        *,
        space_id: str,
        document_ids: list[str],
        query_text: str,
        top_k: int = 5,
    ):
        backend = self._resolve_backend()
        return await self.engine.search_documents(
            backend=backend,
            space_id=space_id,
            document_ids=document_ids,
            query_text=query_text,
            top_k=top_k,
        )

    async def delete_document(self, *, space_id: str, document_id: str):
        backend = self._resolve_backend()
        paths = backend.get_document_paths(space_id=space_id, document_id=document_id, filename="document")
        return await self.engine.delete_document(
            backend=backend,
            space_id=space_id,
            document_id=document_id,
            paths=paths,
        )
