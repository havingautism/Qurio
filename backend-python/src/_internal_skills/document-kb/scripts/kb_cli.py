from __future__ import annotations

import argparse
import json
import re
import shutil
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

TARGET_CHUNK_CHARS = 3500
MAX_CHUNK_PREVIEW_CHARS = 500


def _default_knowledge_root() -> Path:
    return Path(__file__).resolve().parents[1] / "knowledge"


def _utc_now() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat()


def _slugify(value: str, fallback: str = "section") -> str:
    cleaned = re.sub(r"[^a-z0-9]+", "-", str(value or "").strip().lower()).strip("-")
    return cleaned or fallback


def _read_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def _write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def normalize_markdown(content_text: str) -> str:
    text = str(content_text or "").replace("\r\n", "\n").replace("\r", "\n").strip()
    text = re.sub(r"\n{3,}", "\n\n", text)
    if not text:
        return ""
    if re.search(r"^\s*#", text, flags=re.MULTILINE):
        return text
    return f"# Document\n\n{text}\n"


def _split_large_paragraph(paragraph: str, target_chars: int = TARGET_CHUNK_CHARS) -> list[str]:
    text = str(paragraph or "").strip()
    if not text:
        return []
    if len(text) <= target_chars:
        return [text]

    sentences = re.split(r"(?<=[。！？.!?])\s+|\n", text)
    segments: list[str] = []
    current = ""
    for sentence in sentences:
        part = sentence.strip()
        if not part:
            continue
        if len(part) > target_chars:
            if current:
                segments.append(current.strip())
                current = ""
            for start in range(0, len(part), target_chars):
                segments.append(part[start : start + target_chars].strip())
            continue
        candidate = f"{current}\n{part}".strip() if current else part
        if current and len(candidate) > target_chars:
            segments.append(current.strip())
            current = part
        else:
            current = candidate
    if current:
        segments.append(current.strip())
    return segments


def build_candidate_chunks(content_text: str, target_chars: int = TARGET_CHUNK_CHARS) -> list[str]:
    normalized = str(content_text or "").replace("\r\n", "\n").replace("\r", "\n").strip()
    if not normalized:
        return []

    paragraphs = [part.strip() for part in re.split(r"\n{2,}", normalized) if part.strip()]
    units: list[str] = []
    for paragraph in paragraphs or [normalized]:
        units.extend(_split_large_paragraph(paragraph, target_chars=target_chars))

    chunks: list[str] = []
    current = ""
    for unit in units:
        candidate = f"{current}\n\n{unit}".strip() if current else unit
        if current and len(candidate) > target_chars:
            chunks.append(current.strip())
            current = unit
        else:
            current = candidate
    if current:
        chunks.append(current.strip())
    return chunks


def _build_sections_from_candidate_chunks(candidate_chunks: list[str]) -> list[dict[str, Any]]:
    sections: list[dict[str, Any]] = []
    for index, chunk in enumerate(candidate_chunks, start=1):
        first_line = next((line.strip() for line in chunk.splitlines() if line.strip()), "")
        title = first_line[:60] if first_line and len(first_line) <= 60 else f"Part {index}"
        sections.append(
            {
                "section_id": f"s{index}",
                "title": title,
                "level": 1,
                "content": f"# {title}\n\n{chunk}".strip(),
            }
        )
    return sections


def _build_sections_from_plan(
    section_plan: dict[str, Any] | None,
    candidate_chunks: list[str],
) -> list[dict[str, Any]]:
    if not isinstance(section_plan, dict):
        return []
    raw_sections = section_plan.get("sections")
    if not isinstance(raw_sections, list):
        return []

    sections: list[dict[str, Any]] = []
    max_index = len(candidate_chunks) - 1
    for index, raw_section in enumerate(raw_sections, start=1):
        if not isinstance(raw_section, dict):
            continue
        title = str(raw_section.get("title") or "").strip() or f"Section {index}"
        ranges = raw_section.get("chunk_ranges")
        if not isinstance(ranges, list):
            continue
        selected_indices: list[int] = []
        for item in ranges:
            if not isinstance(item, list) or len(item) != 2:
                continue
            try:
                start = max(0, min(int(item[0]), max_index))
                end = max(0, min(int(item[1]), max_index))
            except (TypeError, ValueError):
                continue
            if end < start:
                start, end = end, start
            for chunk_index in range(start, end + 1):
                if chunk_index not in selected_indices:
                    selected_indices.append(chunk_index)
        if not selected_indices:
            continue
        content = "\n\n".join(candidate_chunks[item] for item in selected_indices).strip()
        if not content:
            continue
        sections.append(
            {
                "section_id": f"s{index}",
                "title": title,
                "level": 1,
                "content": f"# {title}\n\n{content}".strip(),
            }
        )
    return sections


def _split_sections(markdown_text: str) -> list[dict[str, Any]]:
    lines = markdown_text.splitlines()
    sections: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None

    for raw_line in lines:
        line = raw_line.rstrip()
        match = re.match(r"^(#{1,6})\s+(.*)$", line)
        if match:
            if current:
                sections.append(current)
            title = match.group(2).strip() or "Untitled"
            level = len(match.group(1))
            current = {
                "section_id": f"s{len(sections) + 1}",
                "title": title,
                "level": level,
                "content_lines": [line],
            }
            continue

        if current is None:
            current = {
                "section_id": "s1",
                "title": "Document",
                "level": 1,
                "content_lines": ["# Document"],
            }
        current["content_lines"].append(line)

    if current:
        sections.append(current)

    normalized: list[dict[str, Any]] = []
    for index, section in enumerate(sections, start=1):
        content = "\n".join(section["content_lines"]).strip()
        normalized.append(
            {
                "section_id": section["section_id"] if index == 1 else f"s{index}",
                "title": section["title"],
                "level": section["level"],
                "content": content,
            }
        )
    return normalized


def _extract_summary(markdown_text: str) -> str:
    text = re.sub(r"^#{1,6}\s+", "", markdown_text, flags=re.MULTILINE)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:400].strip()


def _extract_keywords(title: str, markdown_text: str, sections: list[dict[str, Any]]) -> list[str]:
    words = re.findall(r"[A-Za-z0-9\u4e00-\u9fff]{2,}", f"{title} {markdown_text}")
    candidates = [word.lower() for word in words]
    candidates.extend(_slugify(section["title"], "") for section in sections)
    seen: set[str] = set()
    output: list[str] = []
    for word in candidates:
        cleaned = word.strip("-")
        if not cleaned or cleaned in seen:
            continue
        seen.add(cleaned)
        output.append(cleaned)
        if len(output) >= 24:
            break
    return output


def _build_paths(knowledge_root: Path, space_id: str, doc_id: str) -> dict[str, Path]:
    base = knowledge_root / "spaces" / space_id / "documents" / doc_id
    return {
        "knowledge_root": knowledge_root,
        "space_root": knowledge_root / "spaces" / space_id,
        "documents_root": knowledge_root / "spaces" / space_id / "documents",
        "doc_root": base,
        "chunks_root": base / "chunks",
        "catalog": knowledge_root / "catalog.json",
        "space_index": knowledge_root / "spaces" / space_id / "space-index.json",
        "source": base / "source.md",
        "summary": base / "summary.md",
        "section_map": base / "section-map.json",
        "keywords": base / "keywords.json",
    }


def ingest_document(
    *,
    knowledge_root: str | Path | None = None,
    space_id: str,
    doc_id: str,
    title: str,
    file_type: str,
    content_text: str,
    markdown_text: str | None = None,
    summary_text: str | None = None,
    keywords: list[str] | None = None,
    section_plan: dict[str, Any] | None = None,
    degraded: bool = False,
) -> dict[str, Any]:
    root = Path(knowledge_root) if knowledge_root else _default_knowledge_root()
    paths = _build_paths(root, space_id, doc_id)

    # The extracted document text is the source of truth. Do not let a shortened
    # LLM rewrite replace the full document body.
    canonical_markdown = normalize_markdown(content_text)
    if not canonical_markdown:
        raise ValueError("Document content is empty")

    candidate_chunks = build_candidate_chunks(content_text)
    sections = _build_sections_from_plan(section_plan, candidate_chunks)
    if not sections:
        heading_sections = _split_sections(canonical_markdown)
        if len(heading_sections) > 1:
            sections = heading_sections
        elif len(candidate_chunks) > 1:
            sections = _build_sections_from_candidate_chunks(candidate_chunks)
        else:
            sections = heading_sections
    extracted_summary = str(summary_text or "").strip() or _extract_summary(canonical_markdown)
    extracted_keywords = keywords or _extract_keywords(title, canonical_markdown, sections)

    paths["chunks_root"].mkdir(parents=True, exist_ok=True)
    paths["source"].write_text(canonical_markdown, encoding="utf-8")
    paths["summary"].write_text(extracted_summary + "\n", encoding="utf-8")
    _write_json(paths["keywords"], {"keywords": extracted_keywords})

    section_records = []
    for index, section in enumerate(sections, start=1):
        chunk_name = f"{index:03d}-{_slugify(section['title'])}.md"
        chunk_path = paths["chunks_root"] / chunk_name
        chunk_path.write_text(section["content"].strip() + "\n", encoding="utf-8")
        section_records.append(
            {
                "section_id": section["section_id"],
                "title": section["title"],
                "level": section["level"],
                "chunk_files": [chunk_name],
                "aliases": [_slugify(section["title"], "")],
            }
        )

    _write_json(
        paths["section_map"],
        {
            "doc_id": doc_id,
            "title": title,
            "sections": section_records,
        },
    )

    catalog = _read_json(paths["catalog"], [])
    catalog = [entry for entry in catalog if entry.get("doc_id") != doc_id or entry.get("space_id") != space_id]
    catalog.append(
        {
            "space_id": space_id,
            "doc_id": doc_id,
            "title": title,
            "file_type": file_type,
            "updated_at": _utc_now(),
            "summary": extracted_summary,
            "keywords": extracted_keywords,
            "path": str(paths["doc_root"].relative_to(root)).replace("\\", "/"),
            "degraded": bool(degraded),
        }
    )
    catalog.sort(key=lambda entry: (entry.get("space_id", ""), entry.get("title", "")))
    _write_json(paths["catalog"], catalog)

    space_docs = [entry for entry in catalog if entry.get("space_id") == space_id]
    _write_json(paths["space_index"], {"space_id": space_id, "documents": space_docs})

    return {
        "ok": True,
        "space_id": space_id,
        "doc_id": doc_id,
        "title": title,
        "summary": extracted_summary,
        "keywords": extracted_keywords,
        "degraded": bool(degraded),
        "section_count": len(section_records),
    }


def locate_document_sections(
    *,
    knowledge_root: str | Path | None = None,
    space_id: str,
    query: str,
    limit: int = 3,
    document_ids: list[str] | None = None,
) -> dict[str, Any]:
    root = Path(knowledge_root) if knowledge_root else _default_knowledge_root()
    catalog_path = root / "catalog.json"
    query_text = str(query or "").strip()
    if not query_text:
        return {"ok": True, "matches": []}

    allowed_ids = {str(doc_id) for doc_id in (document_ids or []) if str(doc_id).strip()}
    catalog = [entry for entry in _read_json(catalog_path, []) if entry.get("space_id") == space_id]
    if allowed_ids:
        catalog = [entry for entry in catalog if str(entry.get("doc_id")) in allowed_ids]
    query_tokens = {_slugify(token, "") for token in re.findall(r"[A-Za-z0-9\u4e00-\u9fff]{2,}", query_text)}

    matches: list[dict[str, Any]] = []
    for entry in catalog:
        doc_root = root / entry["path"]
        section_map = _read_json(doc_root / "section-map.json", {"sections": []})
        doc_keywords = set(entry.get("keywords") or [])
        doc_summary = str(entry.get("summary") or "").lower()
        doc_title = str(entry.get("title") or "").lower()

        for section in section_map.get("sections", []):
            score = 0
            section_title = str(section.get("title") or "").lower()
            aliases = [str(alias or "").lower() for alias in section.get("aliases") or []]
            if any(token and token in doc_title for token in query_tokens):
                score += 3
            if any(token and token in doc_summary for token in query_tokens):
                score += 2
            if any(token and token in doc_keywords for token in query_tokens):
                score += 2
            if any(token and token in section_title for token in query_tokens):
                score += 4
            if any(token and token in aliases for token in query_tokens):
                score += 3

            chunk_files = section.get("chunk_files") or []
            snippet = ""
            if chunk_files:
                chunk_path = doc_root / "chunks" / chunk_files[0]
                if chunk_path.exists():
                    snippet = chunk_path.read_text(encoding="utf-8").strip()[:400]
                    lowered_snippet = snippet.lower()
                    if any(token and token in lowered_snippet for token in query_tokens):
                        score += 5

            if score <= 0:
                continue

            matches.append(
                {
                    "doc_id": entry["doc_id"],
                    "title": entry["title"],
                    "file_type": entry.get("file_type"),
                    "section_id": section.get("section_id"),
                    "section_title": section.get("title"),
                    "score": score,
                    "snippet": snippet,
                }
            )

    matches.sort(key=lambda item: (-item["score"], item["title"], item["section_title"]))
    return {"ok": True, "matches": matches[: max(1, int(limit))]}


def read_document_section(
    *,
    knowledge_root: str | Path | None = None,
    space_id: str,
    doc_id: str,
    section_id: str,
) -> dict[str, Any]:
    root = Path(knowledge_root) if knowledge_root else _default_knowledge_root()
    doc_root = root / "spaces" / space_id / "documents" / doc_id
    section_map = _read_json(doc_root / "section-map.json", {"sections": []})
    section = next(
        (candidate for candidate in section_map.get("sections", []) if candidate.get("section_id") == section_id),
        None,
    )
    if section is None:
        return {"ok": False, "error": "Section not found", "chunks": []}

    chunks = []
    for chunk_file in section.get("chunk_files") or []:
        chunk_path = doc_root / "chunks" / chunk_file
        if chunk_path.exists():
            chunks.append(
                {
                    "chunk_id": chunk_file.replace(".md", ""),
                    "content": chunk_path.read_text(encoding="utf-8").strip(),
                    "path": str(chunk_path.relative_to(root)).replace("\\", "/"),
                }
            )

    return {
        "ok": True,
        "doc_id": doc_id,
        "section_id": section_id,
        "section_title": section.get("title"),
        "title_path": [section.get("title")] if section.get("title") else [],
        "chunks": chunks,
    }


def list_documents(*, knowledge_root: str | Path | None = None, space_id: str) -> dict[str, Any]:
    root = Path(knowledge_root) if knowledge_root else _default_knowledge_root()
    catalog = _read_json(root / "catalog.json", [])
    return {"ok": True, "documents": [entry for entry in catalog if entry.get("space_id") == space_id]}


def delete_document(*, knowledge_root: str | Path | None = None, space_id: str, doc_id: str) -> dict[str, Any]:
    root = Path(knowledge_root) if knowledge_root else _default_knowledge_root()
    paths = _build_paths(root, space_id, doc_id)
    if paths["doc_root"].exists():
        shutil.rmtree(paths["doc_root"])

    catalog = _read_json(paths["catalog"], [])
    catalog = [entry for entry in catalog if entry.get("doc_id") != doc_id or entry.get("space_id") != space_id]
    _write_json(paths["catalog"], catalog)
    space_docs = [entry for entry in catalog if entry.get("space_id") == space_id]
    _write_json(paths["space_index"], {"space_id": space_id, "documents": space_docs})
    return {"ok": True, "doc_id": doc_id, "space_id": space_id}


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Filesystem document knowledge base")
    parser.add_argument("--knowledge-root", default=str(_default_knowledge_root()))
    subparsers = parser.add_subparsers(dest="command", required=True)

    ingest = subparsers.add_parser("ingest")
    ingest.add_argument("--space-id", required=True)
    ingest.add_argument("--doc-id", required=True)
    ingest.add_argument("--title", required=True)
    ingest.add_argument("--file-type", required=True)
    ingest.add_argument("--content-file", required=True)
    ingest.add_argument("--markdown-file")
    ingest.add_argument("--summary-file")
    ingest.add_argument("--keywords-file")
    ingest.add_argument("--degraded", action="store_true")

    locate = subparsers.add_parser("locate")
    locate.add_argument("--space-id", required=True)
    locate.add_argument("--query", required=True)
    locate.add_argument("--limit", type=int, default=3)
    locate.add_argument("--doc-id", action="append", dest="document_ids")

    read = subparsers.add_parser("read")
    read.add_argument("--space-id", required=True)
    read.add_argument("--doc-id", required=True)
    read.add_argument("--section-id", required=True)

    ls = subparsers.add_parser("list")
    ls.add_argument("--space-id", required=True)

    delete = subparsers.add_parser("delete")
    delete.add_argument("--space-id", required=True)
    delete.add_argument("--doc-id", required=True)

    return parser


def main() -> None:
    parser = _build_parser()
    args = parser.parse_args()
    root = Path(args.knowledge_root)

    if args.command == "ingest":
        content_text = Path(args.content_file).read_text(encoding="utf-8")
        markdown_text = (
            Path(args.markdown_file).read_text(encoding="utf-8")
            if getattr(args, "markdown_file", None)
            else None
        )
        summary_text = (
            Path(args.summary_file).read_text(encoding="utf-8")
            if getattr(args, "summary_file", None)
            else None
        )
        keywords = None
        if getattr(args, "keywords_file", None):
            keywords_payload = json.loads(Path(args.keywords_file).read_text(encoding="utf-8"))
            keywords = keywords_payload.get("keywords") if isinstance(keywords_payload, dict) else None
        result = ingest_document(
            knowledge_root=root,
            space_id=args.space_id,
            doc_id=args.doc_id,
            title=args.title,
            file_type=args.file_type,
            content_text=content_text,
            markdown_text=markdown_text,
            summary_text=summary_text,
            keywords=keywords,
            degraded=bool(args.degraded),
        )
    elif args.command == "locate":
        result = locate_document_sections(
            knowledge_root=root,
            space_id=args.space_id,
            query=args.query,
            limit=args.limit,
            document_ids=args.document_ids,
        )
    elif args.command == "read":
        result = read_document_section(
            knowledge_root=root,
            space_id=args.space_id,
            doc_id=args.doc_id,
            section_id=args.section_id,
        )
    elif args.command == "list":
        result = list_documents(knowledge_root=root, space_id=args.space_id)
    else:
        result = delete_document(knowledge_root=root, space_id=args.space_id, doc_id=args.doc_id)

    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
