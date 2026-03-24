"""
Long-term memory prompt injection helpers.

This module keeps memory exposure narrow:
- strong memories are always eligible
- moderate memories are only injected when the current turn matches
- weak memories stay out of the prompt unless they are highly relevant
"""

from __future__ import annotations

import json
import re
from datetime import date
from pathlib import Path
from typing import Any

MEMORY_ROOT = Path(__file__).resolve().parents[1] / "_internal_skills" / "agent-memory" / "memories"
MEMORY_META_SUFFIX = ".meta.json"
FORCED_PRIORITY_THRESHOLD = 0.7
ON_DEMAND_PRIORITY_THRESHOLD = 0.4
MAX_INJECTED_MEMORIES = 4


def _coerce_float(value: Any, default: float = 0.5) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return default
    if parsed != parsed:
        return default
    return max(0.0, min(1.0, parsed))


def _split_csv(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    text = str(value or "").strip()
    if not text:
        return []
    return [item.strip() for item in text.split(",") if item.strip()]


def _read_json_file(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        raw = path.read_text(encoding="utf-8", errors="ignore").strip()
        if not raw:
            return {}
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        return {}


def _parse_frontmatter(content: str) -> dict[str, Any]:
    if not content.startswith("---\n"):
        return {}
    end = content.find("\n---\n", 4)
    if end == -1:
        return {}
    block = content[4:end]
    data: dict[str, Any] = {}
    for line in block.splitlines():
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        key = key.strip()
        text = value.strip()
        if not key:
            continue
        if text.startswith('"') and text.endswith('"'):
            try:
                data[key] = json.loads(text)
                continue
            except Exception:
                data[key] = text.strip('"')
                continue
        lowered = text.lower()
        if lowered in {"true", "false"}:
            data[key] = lowered == "true"
            continue
        if text.startswith("[") or text.startswith("{"):
            try:
                data[key] = json.loads(text)
                continue
            except Exception:
                pass
        try:
            if "." in text:
                data[key] = float(text)
            else:
                data[key] = int(text)
            continue
        except ValueError:
            data[key] = text
    return data


def _extract_body(content: str) -> str:
    if "\n---\n" not in content:
      return content.strip()
    parts = content.split("\n---\n", 1)
    return parts[1].strip() if len(parts) > 1 else content.strip()


def _collect_user_query_text(messages: list[dict[str, Any]]) -> str:
    if not messages:
        return ""
    for msg in reversed(messages):
        if not isinstance(msg, dict) or msg.get("role") != "user":
            continue
        content = msg.get("content")
        if isinstance(content, str):
            return content.strip()
        if isinstance(content, list):
            chunks: list[str] = []
            for part in content:
                if not isinstance(part, dict):
                    continue
                text = part.get("text") or part.get("content")
                if isinstance(text, str) and text.strip():
                    chunks.append(text.strip())
            if chunks:
                return "\n".join(chunks)
    return ""


def _tokenize_query(text: str) -> list[str]:
    if not text:
      return []
    tokens = re.findall(r"[\u4e00-\u9fff]{2,}|[A-Za-z0-9_+-]{2,}", text)
    seen: set[str] = set()
    ordered: list[str] = []
    for token in tokens:
        lowered = token.lower()
        if lowered in seen:
            continue
        seen.add(lowered)
        ordered.append(lowered)
    return ordered


def _load_memory_items() -> list[dict[str, Any]]:
    if not MEMORY_ROOT.exists():
        return []

    items: list[dict[str, Any]] = []
    for file in sorted(MEMORY_ROOT.rglob("*.md")):
        try:
            text = file.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        frontmatter = _parse_frontmatter(text)
        meta = _read_json_file(file.with_suffix(MEMORY_META_SUFFIX))
        merged = {**frontmatter, **meta}
        priority = _coerce_float(merged.get("priority", 0.5))
        tags = _split_csv(merged.get("tags", []))
        related = _split_csv(merged.get("related", []))
        summary = str(merged.get("summary", "") or "").strip()
        title = str(merged.get("title", "") or "").strip() or file.stem.replace("-", " ").title()
        applicable_when = str(merged.get("applicable_when", "") or "").strip()
        not_applicable_when = str(merged.get("not_applicable_when", "") or "").strip()
        body = _extract_body(text)
        category = file.parent.name
        items.append(
            {
                "path": str(file),
                "meta_path": str(file.with_suffix(MEMORY_META_SUFFIX)),
                "category": category,
                "slug": file.stem,
                "title": title,
                "summary": summary,
                "priority": priority,
                "forced": priority >= FORCED_PRIORITY_THRESHOLD,
                "on_demand": priority >= ON_DEMAND_PRIORITY_THRESHOLD,
                "applicable_when": applicable_when,
                "not_applicable_when": not_applicable_when,
                "tags": tags,
                "related": related,
                "body": body,
                "created": str(merged.get("created", "") or "").strip() or None,
                "updated": str(merged.get("updated", "") or "").strip() or None,
            }
        )
    return items


def _score_item(item: dict[str, Any], query_tokens: list[str], query_text: str) -> float:
    priority = float(item.get("priority") or 0.0)
    if item.get("forced"):
        return 2.0 + priority

    haystack = " ".join(
        [
            str(item.get("title", "")),
            str(item.get("summary", "")),
            " ".join(item.get("tags") or []),
            " ".join(item.get("related") or []),
            str(item.get("applicable_when", "")),
            str(item.get("not_applicable_when", "")),
            str(item.get("body", "")),
        ]
    ).lower()
    score = priority

    if query_text:
        if query_text.lower() in haystack:
            score += 0.4
        matches = sum(1 for token in query_tokens if token and token in haystack)
        if matches:
            score += min(0.3, matches * 0.08)
    return score


def _select_memory_items(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    items = _load_memory_items()
    if not items:
        return []

    query_text = _collect_user_query_text(messages)
    query_tokens = _tokenize_query(query_text)

    ranked: list[tuple[float, dict[str, Any]]] = []
    for item in items:
        score = _score_item(item, query_tokens, query_text)
        is_relevant = score > item.get("priority", 0.0)
        should_include = bool(item.get("forced")) or (
            item.get("on_demand") and is_relevant
        ) or (query_tokens and score >= ON_DEMAND_PRIORITY_THRESHOLD + 0.15)
        if should_include:
            ranked.append((score, item))

    ranked.sort(
        key=lambda pair: (
            not pair[1].get("forced"),
            -pair[0],
            -float(pair[1].get("priority") or 0.0),
            str(pair[1].get("category", "")),
            str(pair[1].get("title", "")),
        )
    )
    return [item for _, item in ranked[:MAX_INJECTED_MEMORIES]]


def _format_memory_item(item: dict[str, Any], index: int) -> str:
    lines = [f"{index}. {item.get('title', 'Memory').strip()}"]
    priority = float(item.get("priority") or 0.0)
    lines.append(f"   Priority: {priority:.2f}")
    summary = str(item.get("summary") or "").strip()
    if summary:
        lines.append(f"   Summary: {summary}")
    applicable_when = str(item.get("applicable_when") or "").strip()
    if applicable_when:
        lines.append(f"   Applicable When: {applicable_when}")
    not_applicable_when = str(item.get("not_applicable_when") or "").strip()
    if not_applicable_when:
        lines.append(f"   Not Applicable When: {not_applicable_when}")
    return "\n".join(lines)


def build_memory_context_prompt(messages: list[dict[str, Any]]) -> str | None:
    selected = _select_memory_items(messages)
    if not selected:
      return None

    lines = [
        "[Long-term memory]",
        "Use the following memories only when they help the current request.",
        "Prefer the highest-priority items and respect Applicable/Not Applicable conditions.",
    ]
    for index, item in enumerate(selected, start=1):
        lines.append(_format_memory_item(item, index))
    return "\n".join(lines)


def inject_memory_context(messages: list[dict[str, Any]], request: Any | None = None) -> list[dict[str, Any]]:
    if not messages or not getattr(request, "enable_long_term_memory", False):
        return messages

    prompt = build_memory_context_prompt(messages)
    if not prompt:
        return messages

    updated = list(messages)
    system_index = next((i for i, msg in enumerate(updated) if msg.get("role") == "system"), -1)
    if system_index >= 0:
        last_sys = updated[system_index]
        content = str(last_sys.get("content", ""))
        if "[Long-term memory]" not in content:
            updated[system_index] = {**last_sys, "content": f"{content}\n\n{prompt}"}
    else:
        updated.append({"role": "system", "content": prompt})
    return updated
