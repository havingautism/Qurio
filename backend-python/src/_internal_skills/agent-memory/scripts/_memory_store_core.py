#!/usr/bin/env python3
import re
from datetime import date
from pathlib import Path

SKILL_ROOT = Path(__file__).resolve().parents[1]
MEM_ROOT = SKILL_ROOT / "memories"


def slugify(value: str) -> str:
    lowered = (value or "").strip().lower()
    lowered = re.sub(r"[^a-z0-9-]+", "-", lowered)
    lowered = re.sub(r"-{2,}", "-", lowered).strip("-")
    return lowered or "memory"


def split_csv(value: str) -> list[str]:
    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


def memory_path(category: str, slug: str) -> Path:
    return MEM_ROOT / slugify(category) / f"{slugify(slug)}.md"


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
        data[k.strip()] = v.strip().strip('"')
    return data


def save_memory(
    *,
    category: str,
    slug: str,
    summary: str,
    content: str,
    title: str = "",
    status: str = "",
    tags_csv: str = "",
    related_csv: str = "",
    overwrite: bool = False,
) -> dict:
    path = memory_path(category, slug)
    path.parent.mkdir(parents=True, exist_ok=True)
    today = date.today().isoformat()

    if path.exists() and not overwrite:
        return {"ok": False, "error": "file_exists", "path": str(path)}

    tags = split_csv(tags_csv)
    related = split_csv(related_csv)
    lines = [
        "---",
        f'summary: "{summary.strip()}"',
        f"created: {today}",
    ]
    if status:
        lines.append(f"status: {slugify(status)}")
    if tags:
        lines.append(f"tags: [{', '.join(tags)}]")
    if related:
        lines.append(f"related: [{', '.join(related)}]")
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
        items.append(
            {
                "path": str(file),
                "summary": fm.get("summary", ""),
                "status": fm.get("status", ""),
            }
        )
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
        search_scope = [
            str(path_obj.relative_to(MEM_ROOT)).lower(),
            item.get("summary", "").lower(),
            path_obj.read_text(encoding="utf-8", errors="ignore").lower(),
        ]
        if any(needle in scope for scope in search_scope):
            matches.append(item)
    return {"ok": True, "action": "search", "keyword": needle, "items": matches}


def delete_memory(*, category: str, slug: str) -> dict:
    path = memory_path(category, slug)
    if not path.exists():
        return {"ok": False, "error": "not_found", "path": str(path)}
    path.unlink()
    try:
        path.parent.rmdir()
    except OSError:
        pass
    return {"ok": True, "action": "delete", "path": str(path)}
