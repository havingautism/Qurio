#!/usr/bin/env python3
import argparse
import json
import re
from datetime import date
from pathlib import Path


SKILL_ROOT = Path(__file__).resolve().parents[1]
MEM_ROOT = SKILL_ROOT / "memories"


def _slugify(value: str) -> str:
    lowered = (value or "").strip().lower()
    lowered = re.sub(r"[^a-z0-9-]+", "-", lowered)
    lowered = re.sub(r"-{2,}", "-", lowered).strip("-")
    return lowered or "memory"


def _split_csv(value: str) -> list[str]:
    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


def _memory_path(category: str, slug: str) -> Path:
    return MEM_ROOT / _slugify(category) / f"{_slugify(slug)}.md"


def _parse_frontmatter(content: str) -> dict:
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


def _save(args: argparse.Namespace) -> dict:
    path = _memory_path(args.category, args.slug)
    path.parent.mkdir(parents=True, exist_ok=True)
    today = date.today().isoformat()

    if path.exists() and not args.overwrite:
        return {"ok": False, "error": "file_exists", "path": str(path)}

    tags = _split_csv(args.tags)
    related = _split_csv(args.related)
    lines = [
        "---",
        f'summary: "{args.summary.strip()}"',
        f"created: {today}",
    ]
    if args.status:
        lines.append(f"status: {_slugify(args.status)}")
    if tags:
        lines.append(f"tags: [{', '.join(tags)}]")
    if related:
        lines.append(f"related: [{', '.join(related)}]")
    lines.extend(
        [
            "---",
            "",
            f"# {args.title.strip() if args.title else _slugify(args.slug)}",
            "",
            args.content.strip(),
            "",
        ]
    )
    path.write_text("\n".join(lines), encoding="utf-8")
    return {"ok": True, "action": "save", "path": str(path)}


def _list(args: argparse.Namespace) -> dict:
    base = MEM_ROOT / _slugify(args.category) if args.category else MEM_ROOT
    if not base.exists():
        return {"ok": True, "action": "list", "items": []}
    items = []
    for file in sorted(base.rglob("*.md")):
        text = file.read_text(encoding="utf-8", errors="ignore")
        fm = _parse_frontmatter(text)
        items.append(
            {
                "path": str(file),
                "summary": fm.get("summary", ""),
                "status": fm.get("status", ""),
            }
        )
    return {"ok": True, "action": "list", "items": items}


def _search(args: argparse.Namespace) -> dict:
    keyword = (args.keyword or "").strip().lower()
    if not keyword:
        return {"ok": False, "error": "keyword_required"}
    listing = _list(argparse.Namespace(category=args.category))
    matches = []
    for item in listing.get("items", []):
        path_obj = Path(item["path"])
        # Search in: relative path, summary, and content
        search_scope = [
            str(path_obj.relative_to(MEM_ROOT)).lower(),
            item.get("summary", "").lower(),
            path_obj.read_text(encoding="utf-8", errors="ignore").lower()
        ]
        if any(keyword in scope for scope in search_scope):
            matches.append(item)
    return {"ok": True, "action": "search", "keyword": keyword, "items": matches}


def _delete(args: argparse.Namespace) -> dict:
    path = _memory_path(args.category, args.slug)
    if not path.exists():
        return {"ok": False, "error": "not_found", "path": str(path)}
    path.unlink()
    try:
        path.parent.rmdir()
    except OSError:
        pass
    return {"ok": True, "action": "delete", "path": str(path)}


def main() -> int:
    parser = argparse.ArgumentParser(description="File-based memory store for agent-memory skill.")
    sub = parser.add_subparsers(dest="command", required=True)

    save = sub.add_parser("save")
    save.add_argument("--category", required=True)
    save.add_argument("--slug", required=True)
    save.add_argument("--summary", required=True)
    save.add_argument("--content", required=True)
    save.add_argument("--title", default="")
    save.add_argument("--status", default="")
    save.add_argument("--tags", default="")
    save.add_argument("--related", default="")
    save.add_argument("--overwrite", action="store_true")

    list_cmd = sub.add_parser("list")
    list_cmd.add_argument("--category", default="")

    search = sub.add_parser("search")
    search.add_argument("--keyword", required=True)
    search.add_argument("--category", default="")

    delete = sub.add_parser("delete")
    delete.add_argument("--category", required=True)
    delete.add_argument("--slug", required=True)

    args = parser.parse_args()
    MEM_ROOT.mkdir(parents=True, exist_ok=True)

    if args.command == "save":
        result = _save(args)
    elif args.command == "list":
        result = _list(args)
    elif args.command == "search":
        result = _search(args)
    else:
        result = _delete(args)

    print(json.dumps(result, ensure_ascii=False))
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
