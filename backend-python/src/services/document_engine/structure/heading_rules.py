from __future__ import annotations

import re


MARKDOWN_HEADING = re.compile(r"^\s{0,3}(#{1,6})\s+(.+)$")
CN_CHAPTER_HEADING = re.compile(r"^\s*(第[一二三四五六七八九十百千万0-9]+[章节部分篇])\s+(.+)$")
CN_SECTION_HEADING = re.compile(r"^\s*([一二三四五六七八九十]+)、(.+)$")
CN_SUBSECTION_HEADING = re.compile(r"^\s*[\(（]([一二三四五六七八九十0-9]+)[\)）]\s*(.+)$")
NUMERIC_HEADING = re.compile(r"^\s*(\d+(?:\.\d+){0,5})\s+(.+)$")
EN_HEADING = re.compile(r"^\s*(Chapter|Section|Part)\s+(\d+(?:\.\d+)*)\s*(.*)$", re.IGNORECASE)


def parse_heading(line: str) -> tuple[int, str] | None:
    text = str(line or "").strip()
    if not text or len(text) > 120:
        return None

    match = MARKDOWN_HEADING.match(text)
    if match:
        level = min(len(match.group(1)), 6)
        title = match.group(2).strip()
        return (level, title) if title else None

    match = CN_CHAPTER_HEADING.match(text)
    if match:
        title = f"{match.group(1)} {match.group(2).strip()}".strip()
        return (1, title)

    match = CN_SECTION_HEADING.match(text)
    if match:
        title = f"{match.group(1)}、{match.group(2).strip()}".strip()
        return (2, title)

    match = CN_SUBSECTION_HEADING.match(text)
    if match:
        title = f"({match.group(1)}) {match.group(2).strip()}".strip()
        return (3, title)

    match = NUMERIC_HEADING.match(text)
    if match:
        numeric = match.group(1)
        title = f"{numeric} {match.group(2).strip()}".strip()
        level = min(numeric.count(".") + 1, 6)
        return (level, title)

    match = EN_HEADING.match(text)
    if match:
        keyword = match.group(1).capitalize()
        number = match.group(2)
        suffix = match.group(3).strip()
        level = min(number.count(".") + 1, 6)
        title = " ".join(part for part in [keyword, number, suffix] if part).strip()
        return (level, title)

    return None


def looks_like_heading(line: str) -> bool:
    return parse_heading(line) is not None
