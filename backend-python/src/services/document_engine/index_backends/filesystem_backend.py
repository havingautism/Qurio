from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import sqlite3

from .base import IndexBackendBase
from ..search_utils import build_search_text, build_sqlite_match_query


@dataclass(frozen=True)
class FilesystemDocumentPaths:
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


class FilesystemIndexBackend(IndexBackendBase):
    def __init__(self, storage_root: str | Path, *, provider_id: str = "default", provider_type: str = "sqlite"):
        self.storage_root = Path(storage_root)
        self.provider_id = str(provider_id or "default").strip() or "default"
        self.provider_type = str(provider_type or "sqlite").strip() or "sqlite"

    def _ensure_schema(self, connection: sqlite3.Connection) -> None:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS document_meta (
                doc_id TEXT PRIMARY KEY,
                doc_name TEXT NOT NULL,
                source_type TEXT NOT NULL,
                character_count INTEGER NOT NULL DEFAULT 0,
                section_count INTEGER NOT NULL DEFAULT 0,
                node_count INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS nodes (
                rowid INTEGER PRIMARY KEY AUTOINCREMENT,
                node_id TEXT NOT NULL UNIQUE,
                title TEXT NOT NULL,
                title_path TEXT NOT NULL,
                body TEXT NOT NULL,
                summary TEXT NOT NULL,
                parent_id TEXT,
                depth INTEGER NOT NULL DEFAULT 1,
                line_start INTEGER,
                line_end INTEGER,
                search_text TEXT NOT NULL
            );

            CREATE VIRTUAL TABLE IF NOT EXISTS nodes_fts USING fts5(
                node_id UNINDEXED,
                title,
                title_path,
                body,
                search_text,
                tokenize = 'unicode61'
            );
            """
        )

    def _connect(self, db_path: Path) -> sqlite3.Connection:
        connection = sqlite3.connect(str(db_path))
        connection.row_factory = sqlite3.Row
        self._ensure_schema(connection)
        return connection

    def get_document_paths(self, *, space_id: str, document_id: str, filename: str) -> FilesystemDocumentPaths:
        root = (
            self.storage_root
            / "providers"
            / self.provider_type
            / self.provider_id
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
        return FilesystemDocumentPaths(
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
        )

    def resolve_existing_index_db(self, paths: FilesystemDocumentPaths) -> Path:
        if paths.index_db.exists():
            return paths.index_db
        return paths.legacy_index_db

    def reset_document_index(self, *, paths: FilesystemDocumentPaths):
        if paths.index_db.exists():
            paths.index_db.unlink()
        paths.index_dir.mkdir(parents=True, exist_ok=True)
        paths.original_dir.mkdir(parents=True, exist_ok=True)

    def write_document_index(
        self,
        *,
        paths: FilesystemDocumentPaths,
        document_id: str,
        doc_name: str,
        source_type: str,
        character_count: int,
        section_count: int,
        nodes: list[dict],
    ):
        connection = self._connect(paths.index_db)
        try:
            connection.execute(
                """
                INSERT OR REPLACE INTO document_meta(doc_id, doc_name, source_type, character_count, section_count, node_count)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (str(document_id), doc_name, source_type, int(character_count), int(section_count), len(nodes)),
            )

            for node in nodes:
                title = str(node.get("title") or "")
                title_path_text = str(node.get("title_path_text") or "")
                body = str(node.get("text") or "")
                summary = str(node.get("summary") or "")
                search_text = build_search_text(title, title_path_text, summary, body)
                cursor = connection.execute(
                    """
                    INSERT INTO nodes(node_id, title, title_path, body, summary, parent_id, depth, line_start, line_end, search_text)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        str(node.get("node_id") or ""),
                        title,
                        title_path_text,
                        body,
                        summary,
                        node.get("parent_id"),
                        int(node.get("depth") or 1),
                        node.get("line_start"),
                        node.get("line_end"),
                        search_text,
                    ),
                )
                connection.execute(
                    """
                    INSERT INTO nodes_fts(rowid, node_id, title, title_path, body, search_text)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (
                        cursor.lastrowid,
                        str(node.get("node_id") or ""),
                        title,
                        title_path_text,
                        body,
                        search_text,
                    ),
                )

            connection.commit()
        finally:
            connection.close()

    def lexical_search(
        self,
        *,
        paths: FilesystemDocumentPaths,
        query_text: str,
        limit: int,
    ):
        db_path = self.resolve_existing_index_db(paths)
        if not db_path.exists():
            return None, []

        match_query = build_sqlite_match_query(query_text)
        if not match_query:
            return None, []

        connection = self._connect(db_path)
        try:
            meta = connection.execute(
                "SELECT doc_id, doc_name, source_type FROM document_meta LIMIT 1"
            ).fetchone()
            if meta is None:
                return None, []

            rows = connection.execute(
                """
                SELECT
                    nodes.node_id,
                    nodes.title,
                    nodes.title_path,
                    nodes.body,
                    nodes.summary,
                    nodes.parent_id,
                    nodes.depth,
                    nodes.line_start,
                    nodes.line_end,
                    (1.0 / (1.0 + abs(bm25(nodes_fts, 8.0, 5.0, 1.0, 3.0)))) AS lexical_rank
                FROM nodes_fts
                JOIN nodes ON nodes.rowid = nodes_fts.rowid
                WHERE nodes_fts MATCH ?
                ORDER BY lexical_rank DESC
                LIMIT ?
                """,
                (match_query, int(limit)),
            ).fetchall()
            return meta, rows
        finally:
            connection.close()

    def delete_document_index(self, *, paths: FilesystemDocumentPaths, space_id: str, document_id: str):
        return None
