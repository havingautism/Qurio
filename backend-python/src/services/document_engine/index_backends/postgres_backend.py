from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import psycopg2
from psycopg2.extras import RealDictCursor, execute_batch

from ....config import get_settings
from ...db_registry import ProviderConfig
from .base import IndexBackendBase
from ..search_utils import build_search_text, tokenize_for_search


@dataclass(frozen=True)
class PostgresDocumentPaths:
    space_id: str
    document_id: str
    root: Path
    original_dir: Path
    original_file: Path
    index_dir: Path
    index_db: Path
    legacy_root: Path
    legacy_original_dir: Path
    legacy_original_file: Path
    legacy_index_dir: Path
    legacy_index_db: Path
    schema_name: str


class PostgresLexicalBackend(IndexBackendBase):
    def __init__(self, storage_root: str | Path, *, provider: ProviderConfig):
        self.storage_root = Path(storage_root)
        self.provider = provider
        self.schema_name = "document_engine"

    def _connection_url(self) -> str:
        if self.provider.type == "postgres":
            if not self.provider.connection_url:
                raise RuntimeError("Postgres provider is missing connection_url")
            return self.provider.connection_url
        if self.provider.type == "supabase":
            settings = get_settings()
            if not settings.supabase_db_url:
                raise RuntimeError("SUPABASE_DB_URL is required for Supabase lexical backend")
            return settings.supabase_db_url
        raise RuntimeError(f"Unsupported provider type for PostgresLexicalBackend: {self.provider.type}")

    def _connect(self):
        return psycopg2.connect(self._connection_url(), cursor_factory=RealDictCursor)

    def _ensure_schema(self, cursor) -> None:
        cursor.execute(f"CREATE SCHEMA IF NOT EXISTS {self.schema_name};")
        cursor.execute(
            f"""
            CREATE TABLE IF NOT EXISTS {self.schema_name}.documents (
                provider_id TEXT NOT NULL,
                space_id TEXT NOT NULL,
                document_id TEXT NOT NULL,
                doc_name TEXT NOT NULL,
                source_type TEXT NOT NULL,
                character_count INTEGER NOT NULL DEFAULT 0,
                section_count INTEGER NOT NULL DEFAULT 0,
                node_count INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (provider_id, space_id, document_id)
            );
            """
        )
        cursor.execute(
            f"""
            CREATE TABLE IF NOT EXISTS {self.schema_name}.nodes (
                provider_id TEXT NOT NULL,
                space_id TEXT NOT NULL,
                document_id TEXT NOT NULL,
                node_id TEXT NOT NULL,
                title TEXT NOT NULL,
                title_path TEXT NOT NULL,
                body TEXT NOT NULL,
                summary TEXT NOT NULL,
                parent_id TEXT,
                depth INTEGER NOT NULL DEFAULT 1,
                line_start INTEGER,
                line_end INTEGER,
                search_text TEXT NOT NULL,
                PRIMARY KEY (provider_id, space_id, document_id, node_id)
            );
            """
        )
        cursor.execute(
            f"""
            CREATE INDEX IF NOT EXISTS document_engine_nodes_search_idx
            ON {self.schema_name}.nodes
            USING GIN (to_tsvector('simple', search_text));
            """
        )

    def get_document_paths(self, *, space_id: str, document_id: str, filename: str) -> PostgresDocumentPaths:
        root = (
            self.storage_root
            / "providers"
            / self.provider.type
            / self.provider.id
            / "spaces"
            / str(space_id)
            / "documents"
            / str(document_id)
        )
        legacy_root = self.storage_root / "spaces" / str(space_id) / "documents" / str(document_id)
        original_dir = root / "original"
        legacy_original_dir = legacy_root / "original"
        index_dir = root / "index"
        legacy_index_dir = legacy_root / "treesearch"
        return PostgresDocumentPaths(
            space_id=str(space_id),
            document_id=str(document_id),
            root=root,
            original_dir=original_dir,
            original_file=original_dir / Path(filename).name,
            index_dir=index_dir,
            index_db=index_dir / "index.db",
            legacy_root=legacy_root,
            legacy_original_dir=legacy_original_dir,
            legacy_original_file=legacy_original_dir / Path(filename).name,
            legacy_index_dir=legacy_index_dir,
            legacy_index_db=legacy_index_dir / "index.db",
            schema_name=self.schema_name,
        )

    def resolve_existing_index_db(self, paths: PostgresDocumentPaths) -> Path:
        if paths.index_db.exists():
            return paths.index_db
        return paths.legacy_index_db

    def reset_document_index(self, *, paths: PostgresDocumentPaths):
        paths.original_dir.mkdir(parents=True, exist_ok=True)

    def write_document_index(
        self,
        *,
        paths: PostgresDocumentPaths,
        document_id: str,
        doc_name: str,
        source_type: str,
        character_count: int,
        section_count: int,
        nodes: list[dict],
    ):
        space_id = paths.space_id
        connection = self._connect()
        try:
            with connection:
                with connection.cursor() as cursor:
                    self._ensure_schema(cursor)
                    cursor.execute(
                        f"DELETE FROM {self.schema_name}.nodes WHERE provider_id=%s AND space_id=%s AND document_id=%s",
                        (self.provider.id, space_id, document_id),
                    )
                    cursor.execute(
                        f"DELETE FROM {self.schema_name}.documents WHERE provider_id=%s AND space_id=%s AND document_id=%s",
                        (self.provider.id, space_id, document_id),
                    )
                    cursor.execute(
                        f"""
                        INSERT INTO {self.schema_name}.documents
                        (provider_id, space_id, document_id, doc_name, source_type, character_count, section_count, node_count)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                        """,
                        (
                            self.provider.id,
                            space_id,
                            document_id,
                            doc_name,
                            source_type,
                            int(character_count),
                            int(section_count),
                            len(nodes),
                        ),
                    )
                    execute_batch(
                        cursor,
                        f"""
                        INSERT INTO {self.schema_name}.nodes
                        (provider_id, space_id, document_id, node_id, title, title_path, body, summary, parent_id, depth, line_start, line_end, search_text)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                        """,
                        [
                            (
                                self.provider.id,
                                space_id,
                                document_id,
                                str(node.get("node_id") or ""),
                                str(node.get("title") or ""),
                                str(node.get("title_path_text") or ""),
                                str(node.get("text") or ""),
                                str(node.get("summary") or ""),
                                node.get("parent_id"),
                                int(node.get("depth") or 1),
                                node.get("line_start"),
                                node.get("line_end"),
                                build_search_text(
                                    str(node.get("title") or ""),
                                    str(node.get("title_path_text") or ""),
                                    str(node.get("summary") or ""),
                                    str(node.get("text") or ""),
                                ),
                            )
                            for node in nodes
                        ],
                    )
        finally:
            connection.close()

    def lexical_search(
        self,
        *,
        paths: PostgresDocumentPaths,
        query_text: str,
        limit: int,
    ):
        space_id = paths.space_id
        query_tokens = tokenize_for_search(query_text)
        ts_query = " | ".join(query_tokens)
        if not ts_query:
            return None, []
        connection = self._connect()
        try:
            with connection.cursor() as cursor:
                self._ensure_schema(cursor)
                cursor.execute(
                    f"""
                    SELECT document_id AS doc_id, doc_name, source_type
                    FROM {self.schema_name}.documents
                    WHERE provider_id=%s AND space_id=%s AND document_id=%s
                    LIMIT 1
                    """,
                    (self.provider.id, space_id, paths.document_id),
                )
                meta = cursor.fetchone()
                if not meta:
                    return None, []
                cursor.execute(
                    f"""
                    SELECT
                        node_id,
                        title,
                        title_path,
                        body,
                        summary,
                        parent_id,
                        depth,
                        line_start,
                        line_end,
                        ts_rank(
                            to_tsvector('simple', search_text),
                            to_tsquery('simple', %s)
                        ) AS lexical_rank
                    FROM {self.schema_name}.nodes
                    WHERE provider_id=%s AND space_id=%s AND document_id=%s
                      AND to_tsvector('simple', search_text) @@ to_tsquery('simple', %s)
                    ORDER BY lexical_rank DESC
                    LIMIT %s
                    """,
                    (
                        ts_query,
                        self.provider.id,
                        space_id,
                        paths.document_id,
                        ts_query,
                        int(limit),
                    ),
                )
                rows = cursor.fetchall()
                return meta, rows
        finally:
            connection.close()

    def delete_document_index(self, *, paths: PostgresDocumentPaths, space_id: str, document_id: str):
        connection = self._connect()
        try:
            with connection:
                with connection.cursor() as cursor:
                    self._ensure_schema(cursor)
                    cursor.execute(
                        f"DELETE FROM {self.schema_name}.nodes WHERE provider_id=%s AND space_id=%s AND document_id=%s",
                        (self.provider.id, space_id, document_id),
                    )
                    cursor.execute(
                        f"DELETE FROM {self.schema_name}.documents WHERE provider_id=%s AND space_id=%s AND document_id=%s",
                        (self.provider.id, space_id, document_id),
                    )
        finally:
            connection.close()
