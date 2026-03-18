"""
Schema normalization for ppt_generator tool payloads.
"""

from __future__ import annotations

from typing import Any

PPTX_DEFAULT_TITLE = "Generated Presentation"
PPTX_DEFAULT_PAGE_WIDTH_IN = 13.333
PPTX_DEFAULT_PAGE_HEIGHT_IN = 7.5
PPTX_DEFAULT_MARGIN_PX = 48
PPTX_DEFAULT_MAX_CHARS_PER_SLIDE = 900
PPTX_DEFAULT_MODE = "auto"
PPTX_DEFAULT_RENDER_MODE = "auto"
PPTX_DEFAULT_QA_PREVIEW_MODE = "basic"
PPTX_MAX_HTML_SIZE = 200000
PPTX_THEME_PRESETS: dict[str, dict[str, str]] = {
    "modern-gradient": {
        "font_family": "Segoe UI",
        "title_color": "F8FAFF",
        "text_color": "E8EEFF",
        "background_color": "1F2A44",
    },
    "midnight-executive": {
        "font_family": "Calibri",
        "title_color": "CADCFC",
        "text_color": "F5F8FF",
        "background_color": "1E2761",
    },
    "clean-light": {
        "font_family": "Calibri",
        "title_color": "1F2937",
        "text_color": "111827",
        "background_color": "FFFFFF",
    },
}


def build_pptx_error(code: str, message: str) -> dict[str, Any]:
    return {
        "type": "pptx_error",
        "code": str(code or "invalid_payload"),
        "message": str(message or "Invalid PPTX payload."),
    }


def _to_float(value: Any, default: float) -> float:
    try:
        parsed = float(value)
        if parsed <= 0:
            return default
        return parsed
    except Exception:
        return default


def _to_int(value: Any, default: int, *, minimum: int = 1, maximum: int = 1000000) -> int:
    try:
        parsed = int(value)
    except Exception:
        parsed = default
    return max(minimum, min(maximum, parsed))


def build_pptx_payload(args: dict[str, Any] | None) -> dict[str, Any]:
    payload = args if isinstance(args, dict) else {}
    html = str(payload.get("html") or "").strip()
    raw_slides_html = payload.get("slides_html")
    slides_html = (
        [str(item).strip() for item in raw_slides_html if str(item).strip()]
        if isinstance(raw_slides_html, list)
        else []
    )

    if not html and not slides_html:
        return build_pptx_error("empty_html", "No HTML content provided.")

    if len(html) > PPTX_MAX_HTML_SIZE:
        return build_pptx_error(
            "html_too_large",
            f"HTML content exceeds max length {PPTX_MAX_HTML_SIZE}.",
        )

    raw_page = payload.get("page") if isinstance(payload.get("page"), dict) else {}
    raw_paginate = payload.get("paginate") if isinstance(payload.get("paginate"), dict) else {}
    raw_theme_input = payload.get("theme")
    raw_theme: dict[str, Any] = {}
    if isinstance(raw_theme_input, dict):
        raw_theme = raw_theme_input
    elif isinstance(raw_theme_input, str):
        preset_key = raw_theme_input.strip().lower()
        raw_theme = dict(PPTX_THEME_PRESETS.get(preset_key, {}))

    slide_overrides: dict[int, dict[str, Any]] = {}
    for key, value in raw_paginate.items():
        if not str(key).isdigit():
            continue
        if isinstance(value, dict):
            slide_overrides[int(str(key))] = value

    mode = str(raw_paginate.get("mode") or PPTX_DEFAULT_MODE).strip().lower()
    if mode not in {"auto", "selector"}:
        mode = PPTX_DEFAULT_MODE

    selector = str(raw_paginate.get("selector") or "").strip()
    if not selector and slide_overrides:
        # LLMs often send paginate as {"1": {"title": ...}, ...}; default this to slide selector mode.
        selector = ".slide"
        mode = "selector"

    render_mode = str(payload.get("render_mode") or PPTX_DEFAULT_RENDER_MODE).strip().lower()
    if render_mode not in {"auto", "semantic", "fidelity"}:
        render_mode = PPTX_DEFAULT_RENDER_MODE

    template_mode = str(payload.get("template_mode") or "off").strip().lower()
    if template_mode not in {"off", "keep_layout"}:
        template_mode = "off"

    qa_preview_mode = str(payload.get("qa_preview_mode") or PPTX_DEFAULT_QA_PREVIEW_MODE).strip().lower()
    if qa_preview_mode not in {"off", "basic", "strict"}:
        qa_preview_mode = PPTX_DEFAULT_QA_PREVIEW_MODE

    return {
        "type": "pptx_request",
        "html": html,
        "slides_html": slides_html,
        "title": str(payload.get("title") or PPTX_DEFAULT_TITLE).strip() or PPTX_DEFAULT_TITLE,
        "render_mode": render_mode,
        "template_mode": template_mode,
        "qa_preview_mode": qa_preview_mode,
        "page": {
            "width_in": _to_float(raw_page.get("width_in"), PPTX_DEFAULT_PAGE_WIDTH_IN),
            "height_in": _to_float(raw_page.get("height_in"), PPTX_DEFAULT_PAGE_HEIGHT_IN),
            "margin_px": _to_int(raw_page.get("margin_px"), PPTX_DEFAULT_MARGIN_PX, minimum=0, maximum=400),
        },
        "paginate": {
            "mode": mode,
            "selector": selector,
            "max_chars_per_slide": _to_int(
                raw_paginate.get("max_chars_per_slide"),
                PPTX_DEFAULT_MAX_CHARS_PER_SLIDE,
                minimum=200,
                maximum=5000,
            ),
            "respect_page_break": bool(raw_paginate.get("respect_page_break", True)),
            "slide_overrides": slide_overrides,
        },
        "theme": {
            "font_family": str(raw_theme.get("font_family") or "Calibri").strip() or "Calibri",
            "title_color": str(raw_theme.get("title_color") or "1F2937").strip() or "1F2937",
            "text_color": str(raw_theme.get("text_color") or "111827").strip() or "111827",
            "background_color": str(raw_theme.get("background_color") or "FFFFFF").strip() or "FFFFFF",
        },
    }
