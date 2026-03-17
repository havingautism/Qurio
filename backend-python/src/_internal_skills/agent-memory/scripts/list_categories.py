#!/usr/bin/env python3
import json

from _memory_store_core import MEM_ROOT, list_categories


def main() -> int:
    MEM_ROOT.mkdir(parents=True, exist_ok=True)
    result = list_categories()
    print(json.dumps(result, ensure_ascii=False))
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
