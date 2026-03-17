#!/usr/bin/env python3
import argparse
import json

from _memory_store_core import MEM_ROOT, list_memories


def main() -> int:
    parser = argparse.ArgumentParser(description="List memory files.")
    parser.add_argument("--category", default="")
    args = parser.parse_args()

    MEM_ROOT.mkdir(parents=True, exist_ok=True)
    result = list_memories(category=args.category)
    print(json.dumps(result, ensure_ascii=False))
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
