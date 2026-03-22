#!/usr/bin/env python3
import argparse
import json

from _memory_store_core import (
    MEM_ROOT,
    delete_memory,
    list_categories,
    list_memories,
    save_memory,
    search_memories,
)


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
    save.add_argument("--priority", default="")
    save.add_argument("--applicable-when", dest="applicable_when", default="")
    save.add_argument("--not-applicable-when", dest="not_applicable_when", default="")
    save.add_argument("--tags", default="")
    save.add_argument("--related", default="")
    save.add_argument("--overwrite", action="store_true")

    sub.add_parser("categories")

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
        result = save_memory(
            category=args.category,
            slug=args.slug,
            summary=args.summary,
            content=args.content,
            title=args.title,
            status=args.status,
            priority=args.priority,
            applicable_when=args.applicable_when,
            not_applicable_when=args.not_applicable_when,
            tags_csv=args.tags,
            related_csv=args.related,
            overwrite=args.overwrite,
        )
    elif args.command == "categories":
        result = list_categories()
    elif args.command == "list":
        result = list_memories(category=args.category)
    elif args.command == "search":
        result = search_memories(keyword=args.keyword, category=args.category)
    else:
        result = delete_memory(category=args.category, slug=args.slug)

    print(json.dumps(result, ensure_ascii=False))
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
