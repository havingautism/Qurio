#!/usr/bin/env python3
import argparse
import json

from _memory_store_core import MEM_ROOT, search_memories


def main() -> int:
    parser = argparse.ArgumentParser(description="Search memories by keyword.")
    parser.add_argument("--keyword", required=True)
    parser.add_argument("--category", default="")
    args = parser.parse_args()

    MEM_ROOT.mkdir(parents=True, exist_ok=True)
    result = search_memories(keyword=args.keyword, category=args.category)
    print(json.dumps(result, ensure_ascii=False))
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
