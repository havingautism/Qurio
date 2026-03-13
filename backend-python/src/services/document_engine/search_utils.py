from __future__ import annotations

import re


TOKEN_SPLIT_RE = re.compile(r"[A-Za-z0-9_]+|[\u4e00-\u9fff]+")


def normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip().lower()


def cjk_bigrams(text: str) -> list[str]:
    if len(text) <= 1:
        return [text] if text else []
    return [text[index : index + 2] for index in range(len(text) - 1)]


def tokenize_for_search(value: str) -> list[str]:
    tokens: list[str] = []
    for part in TOKEN_SPLIT_RE.findall(normalize_text(value)):
        if not part:
            continue
        if re.fullmatch(r"[\u4e00-\u9fff]+", part):
            tokens.extend(cjk_bigrams(part))
            tokens.append(part)
            continue
        tokens.append(part)
    seen: set[str] = set()
    unique_tokens: list[str] = []
    for token in tokens:
        if token in seen:
            continue
        seen.add(token)
        unique_tokens.append(token)
    return unique_tokens


def build_sqlite_match_query(query_text: str) -> str:
    tokens = tokenize_for_search(query_text)
    if not tokens:
        return ""
    escaped = [f'"{token.replace(chr(34), chr(34) * 2)}"' for token in tokens]
    return " OR ".join(escaped)


def build_search_text(*parts: str) -> str:
    return " ".join(tokenize_for_search(" ".join(part for part in parts if part)))
