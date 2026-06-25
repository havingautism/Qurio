#!/usr/bin/env python3
import argparse
import json

from _memory_store_core import MEM_ROOT, save_memory


def main() -> int:
    parser = argparse.ArgumentParser(description="Save one memory file.")
    parser.add_argument("--category", required=True)
    parser.add_argument("--slug", required=True)
    parser.add_argument("--summary", required=True)
    parser.add_argument("--content", required=True)
    parser.add_argument("--title", default="")
    parser.add_argument("--status", default="")
    parser.add_argument("--priority", default="")
    parser.add_argument("--applicable-when", dest="applicable_when", default="")
    parser.add_argument("--not-applicable-when", dest="not_applicable_when", default="")
    parser.add_argument("--tags", default="")
    parser.add_argument("--related", default="")
    parser.add_argument("--overwrite", action="store_true")
    args = parser.parse_args()

    MEM_ROOT.mkdir(parents=True, exist_ok=True)
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
    print(json.dumps(result, ensure_ascii=False))
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
