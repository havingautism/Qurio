from __future__ import annotations

import shutil
from pathlib import Path

from .base import DocumentEngineBase
from ..search_utils import normalize_text, tokenize_for_search


def _compute_score(*, bm25_score: float, title: str, title_path: str, body: str, depth: int, query_text: str) -> float:
    lexical = max(float(bm25_score or 0.0), 0.0)
    normalized_query = normalize_text(query_text)
    title_text = normalize_text(title)
    path_text = normalize_text(title_path)
    body_text = normalize_text(body)
    query_tokens = tokenize_for_search(query_text)
    title_path_tokens = set(tokenize_for_search(f"{title} {title_path}"))
    body_tokens = set(tokenize_for_search(body))

    title_exact_boost = 0.35 if normalized_query and normalized_query in title_text else 0.0
    path_exact_boost = 0.22 if normalized_query and normalized_query in path_text else 0.0
    body_exact_boost = 0.08 if normalized_query and normalized_query in body_text else 0.0

    title_coverage = (
        sum(1 for token in query_tokens if token in title_path_tokens) / max(len(query_tokens), 1)
        if query_tokens
        else 0.0
    )
    body_coverage = (
        sum(1 for token in query_tokens if token in body_tokens) / max(len(query_tokens), 1)
        if query_tokens
        else 0.0
    )
    coverage_boost = 0.18 * title_coverage + 0.08 * body_coverage
    depth_bonus = max(0.0, 0.14 - (max(depth, 1) - 1) * 0.02)

    return lexical + title_exact_boost + path_exact_boost + body_exact_boost + coverage_boost + depth_bonus


class StructuredLexicalEngine(DocumentEngineBase):
    async def index_document(
        self,
        *,
        backend,
        paths,
        document_id: str,
        filename: str,
        raw_bytes: bytes,
        parsed_document,
        structured_document,
    ):
        if paths.index_db.exists():
            paths.index_db.unlink()
        paths.index_dir.mkdir(parents=True, exist_ok=True)

        doc_name = (parsed_document.title or Path(filename).stem or "Document").strip()
        source_type = (parsed_document.source_type or Path(filename).suffix.lstrip(".") or "file").strip()
        content_text = str(parsed_document.text or "").strip()
        section_count = len({node.title_path[0] for node in structured_document.nodes if node.title_path}) if structured_document.nodes else 0
        node_count = len(structured_document.nodes)
        backend.reset_document_index(paths=paths)
        backend.write_document_index(
            paths=paths,
            document_id=str(document_id),
            doc_name=doc_name,
            source_type=source_type,
            character_count=len(content_text),
            section_count=section_count,
            nodes=[
                {
                    "node_id": node.node_id,
                    "title": node.title,
                    "title_path_text": " > ".join(node.title_path),
                    "text": node.text,
                    "summary": node.summary,
                    "parent_id": node.parent_id,
                    "depth": int(node.metadata.get("depth") or max(len(node.title_path), 1)),
                    "line_start": node.line_start,
                    "line_end": node.line_end,
                }
                for node in structured_document.nodes
            ],
        )

        return {
            "document_root": str(paths.root),
            "original_file": str(paths.original_file),
            "index_db": str(paths.index_db),
            "content_text": content_text,
            "character_count": len(content_text),
            "section_count": section_count,
            "node_count": node_count,
            "doc_name": doc_name,
            "source_type": source_type,
        }

    async def search_documents(
        self,
        *,
        backend,
        space_id: str,
        document_ids: list[str],
        query_text: str,
        top_k: int = 5,
    ):
        trimmed_query = str(query_text or "").strip()
        normalized_ids = [str(document_id) for document_id in (document_ids or []) if str(document_id)]
        if not trimmed_query or not normalized_ids:
            return {"documents": [], "query": trimmed_query}

        document_results: list[dict] = []
        for document_id in normalized_ids:
            paths = backend.get_document_paths(space_id=space_id, document_id=document_id, filename="document")
            meta, rows = backend.lexical_search(
                paths=paths,
                query_text=trimmed_query,
                limit=max(top_k * 4, top_k),
            )
            if meta is None:
                continue

            nodes = []
            for row in rows:
                score = _compute_score(
                    bm25_score=float(row["lexical_rank"] or 0.0),
                    title=str(row["title"] or ""),
                    title_path=str(row["title_path"] or ""),
                    body=str(row["body"] or ""),
                    depth=int(row["depth"] or 1),
                    query_text=trimmed_query,
                )
                title_path = [part.strip() for part in str(row["title_path"] or "").split(">") if part.strip()]
                ancestors = title_path[:-1] if title_path else []
                nodes.append(
                    {
                        "node_id": str(row["node_id"] or ""),
                        "title": str(row["title"] or ""),
                        "score": round(score, 4),
                        "text": str(row["body"] or ""),
                        "summary": str(row["summary"] or ""),
                        "line_start": row["line_start"],
                        "line_end": row["line_end"],
                        "ancestors": ancestors,
                    }
                )

            nodes.sort(key=lambda item: item["score"], reverse=True)
            if not nodes:
                continue

            document_results.append(
                {
                    "doc_id": str(meta["doc_id"]),
                    "doc_name": str(meta["doc_name"]),
                    "source_type": str(meta["source_type"]),
                    "nodes": nodes[: max(top_k, 1)],
                    "_score": nodes[0]["score"],
                }
            )

        document_results.sort(key=lambda item: item["_score"], reverse=True)
        for item in document_results:
            item.pop("_score", None)
        return {"documents": document_results, "query": trimmed_query}

    async def delete_document(self, *, backend, space_id: str, document_id: str, paths):
        if paths.root.exists():
            shutil.rmtree(paths.root)
        if getattr(paths, "legacy_root", None) and paths.legacy_root != paths.root and paths.legacy_root.exists():
            shutil.rmtree(paths.legacy_root)
        backend.delete_document_index(paths=paths, space_id=space_id, document_id=document_id)
        return {"deleted": True, "document_root": str(paths.root)}
