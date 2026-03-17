"""
Shared schema normalization for render_html_widget output payloads.
"""

from __future__ import annotations

import re
from typing import Any

HTML_WIDGET_MIN_HEIGHT = 220
HTML_WIDGET_MAX_HEIGHT = 900
HTML_WIDGET_DEFAULT_HEIGHT = 360
HTML_WIDGET_MAX_SIZE = 20000
HTML_WIDGET_MAX_TITLE_LEN = 120


def _sanitize_html_widget_content(raw_html: Any) -> str:
    html = str(raw_html or "").strip()
    if not html:
        return ""
    html = re.sub(r"<\s*(iframe|object|embed|link|base)\b[\s\S]*?<\s*/\s*\1\s*>", "", html, flags=re.IGNORECASE)
    html = re.sub(r"<\s*(iframe|object|embed|link|base)\b[^>]*?/?>", "", html, flags=re.IGNORECASE)
    html = re.sub(r"<\s*meta\b[^>]*http-equiv\s*=\s*['\"]?refresh['\"]?[^>]*>", "", html, flags=re.IGNORECASE)
    html = re.sub(r"<\s*script[\s\S]*?<\s*/\s*script\s*>", "", html, flags=re.IGNORECASE)
    html = re.sub(r"\son\w+\s*=\s*\"[^\"]*\"", "", html, flags=re.IGNORECASE)
    html = re.sub(r"\son\w+\s*=\s*'[^']*'", "", html, flags=re.IGNORECASE)
    html = re.sub(r"\son\w+\s*=\s*[^\s>]+", "", html, flags=re.IGNORECASE)
    html = re.sub(r"javascript\s*:", "", html, flags=re.IGNORECASE)
    if len(html) > HTML_WIDGET_MAX_SIZE:
        html = html[:HTML_WIDGET_MAX_SIZE]
    return html


def _normalize_title(value: Any) -> str:
    title = str(value or "").strip()
    if len(title) > HTML_WIDGET_MAX_TITLE_LEN:
        title = title[:HTML_WIDGET_MAX_TITLE_LEN]
    return title


def _normalize_height(value: Any) -> int:
    try:
        height = int(value or HTML_WIDGET_DEFAULT_HEIGHT)
    except Exception:
        height = HTML_WIDGET_DEFAULT_HEIGHT
    return max(HTML_WIDGET_MIN_HEIGHT, min(height, HTML_WIDGET_MAX_HEIGHT))


def build_html_widget_error(code: str, message: str) -> dict[str, Any]:
    return {
        "type": "html_widget_error",
        "code": str(code or "invalid_payload"),
        "message": str(message or "Invalid HTML widget payload."),
    }


def build_html_widget_payload(args: dict[str, Any] | None) -> dict[str, Any]:
    payload = args if isinstance(args, dict) else {}
    title = _normalize_title(payload.get("title"))
    safe_html = _sanitize_html_widget_content(payload.get("html"))
    if not safe_html:
        return build_html_widget_error(
            code="empty_html",
            message="No valid HTML content after sanitization.",
        )
    return {
        "type": "html_widget",
        "title": title,
        "html": safe_html,
        "height": _normalize_height(payload.get("height")),
    }
