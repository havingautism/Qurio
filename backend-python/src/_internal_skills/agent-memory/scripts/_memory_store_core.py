#!/usr/bin/env python3
import json
import re
from datetime import date
from pathlib import Path
from typing import Any

SKILL_ROOT = Path(__file__).resolve().parents[1]
MEM_ROOT = SKILL_ROOT / "memories"
DEFAULT_PRIORITY = 0.5
FORCED_PRIORITY_THRESHOLD = 0.7
ON_DEMAND_PRIORITY_THRESHOLD = 0.4
MEMORY_META_SUFFIX = ".meta.json"


def slugify(value: str) -> str:
    lowered = (value or "").strip().lower()
    lowered = re.sub(r"[^a-z0-9-]+", "-", lowered)
    lowered = re.sub(r"-{2,}", "-", lowered).strip("-")
    return lowered or "memory"


def split_csv(value: str) -> list[str]:
    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


def _coerce_float(value: Any, default: float = DEFAULT_PRIORITY) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return default
    if parsed != parsed:  # NaN guard
        return default
    return max(0.0, min(1.0, parsed))


def _format_frontmatter_value(value: Any) -> str:
    if value is None:
        return '""'
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return str(value)
    if isinstance(value, list):
        return json.dumps(value, ensure_ascii=False)
    if isinstance(value, dict):
        return json.dumps(value, ensure_ascii=False)
    text = str(value).strip()
    return json.dumps(text, ensure_ascii=False)


def _parse_frontmatter_value(value: str) -> Any:
    text = str(value or "").strip()
    if not text:
        return ""
    if text.startswith('"') and text.endswith('"'):
        try:
            return json.loads(text)
        except Exception:
            return text.strip('"')
    lowered = text.lower()
    if lowered in {"true", "false"}:
        return lowered == "true"
    try:
        if "." in text:
            return float(text)
        return int(text)
    except ValueError:
        pass
    if text.startswith("[") or text.startswith("{"):
        try:
            return json.loads(text)
        except Exception:
            return text
    return text


def _load_memory_meta(path: Path) -> dict[str, Any]:
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


def _write_memory_meta(path: Path, data: dict[str, Any]) -> None:
    payload = json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True)
    path.write_text(f"{payload}\n", encoding="utf-8")


def memory_path(category: str, slug: str) -> Path:
    return MEM_ROOT / slugify(category) / f"{slugify(slug)}.md"


def memory_meta_path(category: str, slug: str) -> Path:
    return MEM_ROOT / slugify(category) / f"{slugify(slug)}{MEMORY_META_SUFFIX}"


def parse_frontmatter(content: str) -> dict:
    if not content.startswith("---\n"):
        return {}
    end = content.find("\n---\n", 4)
    if end == -1:
        return {}
    block = content[4:end]
    data = {}
    for line in block.splitlines():
        if ":" not in line:
            continue
        k, v = line.split(":", 1)
        data[k.strip()] = _parse_frontmatter_value(v.strip())
    return data


def _normalize_memory_item(path: Path, frontmatter: dict[str, Any]) -> dict[str, Any]:
    meta = _load_memory_meta(path.with_suffix(MEMORY_META_SUFFIX))
    merged = {**frontmatter, **meta}
    priority = _coerce_float(merged.get("priority", DEFAULT_PRIORITY))
    tags = merged.get("tags", [])
    if isinstance(tags, str):
        tags = split_csv(tags)
    elif not isinstance(tags, list):
        tags = []

    related = merged.get("related", [])
    if isinstance(related, str):
        related = split_csv(related)
    elif not isinstance(related, list):
        related = []

    summary = str(merged.get("summary", "") or "").strip()
    title = str(merged.get("title", "") or "").strip()
    applicable_when = str(merged.get("applicable_when", "") or "").strip()
    not_applicable_when = str(merged.get("not_applicable_when", "") or "").strip()
    content = path.read_text(encoding="utf-8", errors="ignore")
    body = content.split("\n---\n", 1)[1].strip() if "\n---\n" in content else content
    slug = path.stem
    category = path.parent.name

    return {
        "path": str(path),
        "meta_path": str(path.with_suffix(MEMORY_META_SUFFIX)),
        "category": category,
        "slug": slug,
        "title": title or slug.replace("-", " ").strip().title(),
        "summary": summary,
        "priority": priority,
        "forced": priority >= FORCED_PRIORITY_THRESHOLD,
        "on_demand": priority >= ON_DEMAND_PRIORITY_THRESHOLD,
        "applicable_when": applicable_when,
        "not_applicable_when": not_applicable_when,
        "status": str(merged.get("status", "") or "").strip(),
        "created": str(merged.get("created", "") or "").strip(),
        "updated": str(merged.get("updated", "") or "").strip(),
        "tags": tags,
        "related": related,
        "body": body,
    }


def save_memory(
    *,
    category: str,
    slug: str,
    summary: str,
    content: str,
    title: str = "",
    status: str = "",
    priority: float | None = None,
    applicable_when: str = "",
    not_applicable_when: str = "",
    tags_csv: str = "",
    related_csv: str = "",
    overwrite: bool = False,
) -> dict:
    path = memory_path(category, slug)
    meta_path = memory_meta_path(category, slug)
    path.parent.mkdir(parents=True, exist_ok=True)
    today = date.today().isoformat()

    if path.exists() and not overwrite:
        return {"ok": False, "error": "file_exists", "path": str(path)}

    tags = split_csv(tags_csv)
    related = split_csv(related_csv)
    priority_value = _coerce_float(priority)
    lines = [
        "---",
        f"summary: {_format_frontmatter_value(summary.strip())}",
        f"created: {today}",
    ]
    if status:
        lines.append(f"status: {slugify(status)}")
    lines.extend(
        [
            "---",
            "",
            f"# {title.strip() if title else slugify(slug)}",
            "",
            content.strip(),
            "",
        ]
    )
    path.write_text("\n".join(lines), encoding="utf-8")
    _write_memory_meta(
        meta_path,
        {
            "priority": priority_value,
            "title": title.strip(),
            "status": slugify(status) if status else "",
            "applicable_when": applicable_when.strip(),
            "not_applicable_when": not_applicable_when.strip(),
            "tags": tags,
            "related": related,
            "summary": summary.strip(),
            "created": today,
            "updated": today if overwrite else "",
        },
    )
    return {"ok": True, "action": "save", "path": str(path)}


def list_memories(*, category: str = "") -> dict:
    category_clean = (category or "").strip()
    base = MEM_ROOT / slugify(category_clean) if category_clean else MEM_ROOT
    if not base.exists():
        return {
            "ok": True,
            "action": "list",
            "scope": "category" if category_clean else "global",
            "supports_batch": True,
            "category": slugify(category_clean) if category_clean else None,
            "items": [],
        }
    items = []
    for file in sorted(base.rglob("*.md")):
        text = file.read_text(encoding="utf-8", errors="ignore")
        fm = parse_frontmatter(text)
        items.append(_normalize_memory_item(file, fm))
    return {
        "ok": True,
        "action": "list",
        "scope": "category" if category_clean else "global",
        "supports_batch": True,
        "category": slugify(category_clean) if category_clean else None,
        "next_action_hint": (
            "Global batch list already includes all categories; avoid per-category list loops unless user asked."
            if not category_clean
            else "Category-scoped list."
        ),
        "items": items,
    }


def list_categories() -> dict:
    if not MEM_ROOT.exists():
        return {"ok": True, "action": "categories", "items": []}

    items = []
    for entry in sorted(MEM_ROOT.iterdir()):
        if not entry.is_dir():
            continue
        count = sum(1 for _ in entry.rglob("*.md"))
        items.append(
            {
                "category": entry.name,
                "path": str(entry),
                "count": count,
            }
        )
    return {"ok": True, "action": "categories", "items": items}


def search_memories(*, keyword: str, category: str = "") -> dict:
    needle = (keyword or "").strip().lower()
    if not needle:
        return {"ok": False, "error": "keyword_required"}
    listing = list_memories(category=category)
    matches = []
    for item in listing.get("items", []):
        path_obj = Path(item["path"])
        meta_text = ""
        meta_path = Path(item.get("meta_path") or "")
        if meta_path.exists():
            meta_text = meta_path.read_text(encoding="utf-8", errors="ignore").lower()
        search_scope = [
            str(path_obj.relative_to(MEM_ROOT)).lower(),
            item.get("summary", "").lower(),
            str(item.get("title", "")).lower(),
            str(item.get("applicable_when", "")).lower(),
            str(item.get("not_applicable_when", "")).lower(),
            meta_text,
            path_obj.read_text(encoding="utf-8", errors="ignore").lower(),
        ]
        if any(needle in scope for scope in search_scope):
            matches.append(item)
    return {"ok": True, "action": "search", "keyword": needle, "items": matches}


def delete_memory(*, category: str, slug: str) -> dict:
    path = memory_path(category, slug)
    meta_path = memory_meta_path(category, slug)
    if not path.exists():
        return {"ok": False, "error": "not_found", "path": str(path)}
    path.unlink()
    if meta_path.exists():
        meta_path.unlink()
    try:
        path.parent.rmdir()
    except OSError:
        pass
    return {"ok": True, "action": "delete", "path": str(path)}
