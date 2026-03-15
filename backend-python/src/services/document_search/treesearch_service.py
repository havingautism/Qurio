from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import shutil
from typing import Any, Callable


@dataclass(frozen=True)
class DocumentPaths:
    root: Path
    original_dir: Path
    original_file: Path
    treesearch_dir: Path
    index_db: Path


class TreeSearchDocumentService:
    def __init__(
        self,
        storage_root: str | Path,
        treesearch_cls: type | None = None,
        load_documents_fn: Callable[[str], list[Any]] | None = None,
        search_fn: Callable[..., Any] | None = None,
        text_to_tree_fn: Callable[..., Any] | None = None,
        fts_index_cls: type | None = None,
    ):
        self.storage_root = Path(storage_root)
        self._treesearch_cls = treesearch_cls
        self._load_documents_fn = load_documents_fn
        self._search_fn = search_fn
        self._text_to_tree_fn = text_to_tree_fn
        self._fts_index_cls = fts_index_cls

    def get_document_paths(self, *, space_id: str, document_id: str, filename: str) -> DocumentPaths:
        root = self.storage_root / "spaces" / str(space_id) / "documents" / str(document_id)
        original_dir = root / "original"
        treesearch_dir = root / "treesearch"
        return DocumentPaths(
            root=root,
            original_dir=original_dir,
            original_file=original_dir / Path(filename).name,
            treesearch_dir=treesearch_dir,
            index_db=treesearch_dir / "index.db",
        )

    def _get_treesearch_cls(self):
        if self._treesearch_cls is not None:
            return self._treesearch_cls
        try:
            from treesearch import TreeSearch
        except ImportError as exc:
            raise RuntimeError("TreeSearch dependency is not installed") from exc
        self._treesearch_cls = TreeSearch
        return self._treesearch_cls

    def _get_load_documents(self):
        if self._load_documents_fn is not None:
            return self._load_documents_fn
        try:
            from treesearch import load_documents
        except ImportError as exc:
            raise RuntimeError("TreeSearch dependency is not installed") from exc
        self._load_documents_fn = load_documents
        return self._load_documents_fn

    def _get_search_fn(self):
        if self._search_fn is not None:
            return self._search_fn
        try:
            from treesearch import search
        except ImportError as exc:
            raise RuntimeError("TreeSearch dependency is not installed") from exc
        self._search_fn = search
        return self._search_fn

    @staticmethod
    def _flatten_nodes(structure: Any) -> list[dict]:
        nodes: list[dict] = []
        if isinstance(structure, dict):
            nodes.append(structure)
            nodes.extend(TreeSearchDocumentService._flatten_nodes(structure.get("nodes", [])))
        elif isinstance(structure, list):
            for item in structure:
                nodes.extend(TreeSearchDocumentService._flatten_nodes(item))
        return nodes

    def _serialize_document_summary(self, document: Any) -> dict[str, Any]:
        nodes = self._flatten_nodes(getattr(document, "structure", []))
        texts = []
        for node in nodes:
            text = str(node.get("text", "")).strip()
            if text:
                texts.append(text)
        content_text = "\n\n".join(texts).strip()
        section_count = sum(1 for node in nodes if node.get("nodes"))
        return {
            "content_text": content_text,
            "character_count": len(content_text),
            "node_count": len(nodes),
            "section_count": section_count,
            "doc_name": getattr(document, "doc_name", ""),
            "source_type": getattr(document, "source_type", ""),
        }

    @staticmethod
    def _needs_doc_name_fallback(value: Any) -> bool:
        text = str(value or "").strip().lower()
        return not text or text == "untitled"

    def _resolve_document_display_name(self, *, space_id: str, document_id: str, fallback: str = "Document") -> str:
        paths = self.get_document_paths(space_id=space_id, document_id=document_id, filename="document")
        if paths.original_dir.exists():
            for candidate in sorted(paths.original_dir.iterdir()):
                if candidate.is_file():
                    return candidate.stem or candidate.name or fallback
        return fallback

    async def index_document(self, *, space_id: str, document_id: str, filename: str, raw_bytes: bytes):
        paths = self.get_document_paths(space_id=space_id, document_id=document_id, filename=filename)
        paths.original_dir.mkdir(parents=True, exist_ok=True)
        paths.treesearch_dir.mkdir(parents=True, exist_ok=True)
        paths.original_file.write_bytes(raw_bytes)

        tree_search_cls = self._get_treesearch_cls()
        tree_search = tree_search_cls(str(paths.original_file), db_path=str(paths.index_db))
        await tree_search.aindex(
            str(paths.original_file),
            force=True,
            if_add_node_text=True,
            if_add_doc_description=True,
        )

        document_summary: dict[str, Any] | None = None
        if paths.index_db.exists():
            try:
                load_documents = self._get_load_documents()
                documents = load_documents(str(paths.index_db))
                if documents:
                    document_summary = self._serialize_document_summary(documents[0])
            except RuntimeError:
                document_summary = None

        result = {
            "document_root": str(paths.root),
            "original_file": str(paths.original_file),
            "index_db": str(paths.index_db),
        }
        if document_summary:
            result.update(document_summary)
        return result

    async def search_documents(
        self,
        *,
        space_id: str,
        document_ids: list[str],
        query_text: str,
        top_k: int = 5,
    ):
        trimmed_query = str(query_text or "").strip()
        normalized_ids = [str(document_id) for document_id in (document_ids or []) if str(document_id)]
        if not trimmed_query or not normalized_ids:
            return {"documents": [], "query": trimmed_query}

        load_documents = self._get_load_documents()
        search_fn = self._get_search_fn()

        documents: list[Any] = []
        for document_id in normalized_ids:
            paths = self.get_document_paths(space_id=space_id, document_id=document_id, filename="document")
            if not paths.index_db.exists():
                continue
            documents.extend(load_documents(str(paths.index_db)))

        if not documents:
            return {"documents": [], "query": trimmed_query}

        raw = await search_fn(
            query=trimmed_query,
            documents=documents,
            top_k_docs=max(len(documents), 1),
            max_nodes_per_doc=max(top_k, 1),
            include_ancestors=True,
            text_mode="full",
            merge_strategy="interleave",
        )
        for item in raw.get("documents", []) if isinstance(raw, dict) else []:
            doc_id = str(item.get("doc_id") or "").strip()
            if not doc_id:
                continue
            if self._needs_doc_name_fallback(item.get("doc_name")):
                item["doc_name"] = self._resolve_document_display_name(
                    space_id=space_id,
                    document_id=doc_id,
                    fallback="Document",
                )
        return raw

    async def delete_document_index(self, *, space_id: str, document_id: str):
        paths = self.get_document_paths(space_id=space_id, document_id=document_id, filename="document")
        if paths.root.exists():
            shutil.rmtree(paths.root)
        return {"deleted": True, "document_root": str(paths.root)}
