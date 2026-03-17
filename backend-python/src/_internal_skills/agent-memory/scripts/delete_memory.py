#!/usr/bin/env python3
import argparse
import json

from _memory_store_core import MEM_ROOT, delete_memory


def main() -> int:
    parser = argparse.ArgumentParser(description="Delete one memory file.")
    parser.add_argument("--category", required=True)
    parser.add_argument("--slug", required=True)
    args = parser.parse_args()

    MEM_ROOT.mkdir(parents=True, exist_ok=True)
    result = delete_memory(category=args.category, slug=args.slug)
    print(json.dumps(result, ensure_ascii=False))
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
