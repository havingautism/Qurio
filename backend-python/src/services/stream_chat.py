"""
Stream chat service implemented with Agno SDK (Agent + tools + DB).
"""

from __future__ import annotations

import ast
import asyncio
import json
import os
import re
import time
from collections.abc import AsyncGenerator
from datetime import datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from agno.agent import Agent, RunEvent
from agno.models.message import Message
from agno.run.agent import RunOutput, ToolCallCompletedEvent, ToolCallStartedEvent
from agno.utils.log import logger

from ..models.stream_chat import (
    DoneEvent,
    ErrorEvent,
    FormRequestEvent,  # New: HITL form request event
    SourceEvent,
    StreamChatRequest,
    TextEvent,
    ThoughtEvent,
    ToolCallEvent,
    ToolResultEvent,
)
from .agent_registry import get_agent_for_provider
from .hitl_storage import get_hitl_storage
from .summary_service import update_session_summary
from .tool_registry import resolve_tool_name

MEMORY_OPTIMIZE_THRESHOLD = 50
MEMORY_OPTIMIZE_INTERVAL_SECONDS = 60 * 60 * 12
THINK_TAG_REGEX = re.compile(r"</?(?:think|thought)>", re.IGNORECASE)
PROTOCOL_TAG_REGEX = re.compile(
    r"(?:<\s*[|｜]\s*(?P<tag>[a-zA-Z0-9_]+)\s*[|｜]\s*>)"
    r"|(?:<\s*(?P<dsml_close>/?)\s*[|｜]\s*DSML\s*[|｜]\s*(?P<dsml_body>[^>]+)>)",
    re.IGNORECASE,
)
TOOL_TRACE_BEGIN_TAGS = {
    "tool_calls_begin",
    "tool_calls_section_begin",
    "tool_call_begin",
    "tool_argument_begin",
    "tool_call_argument_begin",
}
TOOL_TRACE_END_TAGS = {
    "tool_argument_end",
    "tool_call_argument_end",
    "tool_call_end",
    "tool_calls_end",
    "tool_calls_section_end",
}


def _strip_internal_tool_trace(text: str) -> str:
    """Remove explicit protocol marker tokens without truncating normal text."""
    if not text:
        return ""
    cleaned = str(text)
    cleaned = re.sub(r"</?(?:think|thought)>", "", cleaned, flags=re.IGNORECASE)
    # Remove protocol markers like <|tool_calls_begin|> and spaced variants.
    cleaned = re.sub(r"<\s*[|｜]\s*[^|>|｜]*\s*[|｜]\s*>", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"</?\s*[|｜]\s*DSML\s*[|｜]\s*[^>]*>", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"</?(?:session_memory|today_local_time)>", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\[SYSTEM INJECTED CONTEXT\]", "", cleaned, flags=re.IGNORECASE)
    # Remove inline tool-call-like snippets leaked by some models.
    cleaned = re.sub(
        r"([:：]\s*)?[a-zA-Z_][a-zA-Z0-9_]{1,80}\s*\{[^{}\n]{0,1200}\}",
        "",
        cleaned,
        flags=re.IGNORECASE,
    )
    return cleaned

def _split_content_by_think_tags(text: str, in_think: bool) -> tuple[list[tuple[str, str]], bool]:
    """Split a content chunk into ordered thought/text segments by <think>/<thought> tags."""
    if not text:
        return [], in_think
    segments: list[tuple[str, str]] = []
    cursor = 0
    current_in_think = in_think
    for match in THINK_TAG_REGEX.finditer(text):
        start, end = match.span()
        if start > cursor:
            piece = text[cursor:start]
            if piece:
                segments.append(("thought" if current_in_think else "text", piece))
        tag = match.group(0).lower()
        current_in_think = not tag.startswith("</")
        cursor = end
    if cursor < len(text):
        piece = text[cursor:]
        if piece:
            segments.append(("thought" if current_in_think else "text", piece))
    return segments, current_in_think


def _strip_inline_tool_protocol(
    text: str,
    tool_trace_depth: int,
    protocol_tail: str,
) -> tuple[str, int, str, bool]:
    """
    Strip inline tool-protocol payloads from content chunks safely across chunk boundaries.

    Returns:
      cleaned_text, next_tool_trace_depth, next_protocol_tail, had_protocol_tokens
    """
    combined = f"{protocol_tail}{text or ''}"
    if not combined:
        return "", tool_trace_depth, "", False

    # Keep trailing incomplete protocol marker for next chunk.
    tail = ""
    tail_start = -1
    for m in re.finditer(r"<\s*/?\s*[|｜]", combined):
        tail_start = m.start()
    if tail_start != -1 and ">" not in combined[tail_start:]:
        tail = combined[tail_start:]
        combined = combined[:tail_start]

    if not combined:
        return "", tool_trace_depth, tail, bool(tail)

    # Non-destructive stripping: remove marker tokens only.
    matches = list(PROTOCOL_TAG_REGEX.finditer(combined))
    had_protocol = bool(matches)
    if not had_protocol:
        return combined, 0, tail, bool(tail)

    cleaned = PROTOCOL_TAG_REGEX.sub("", combined)
    return cleaned, 0, tail, True


def _squash_whitespace(text: Any) -> str:
    return re.sub(r"\s+", "", str(text or ""))


def _is_reasoning_duplicate_of_content(reasoning: str, content: str) -> bool:
    """
    Detect provider chunks where answer text is mirrored in reasoning_content.
    This prevents answer paragraphs from being rendered as a second thought block.
    """
    reasoning_flat = _squash_whitespace(reasoning)
    content_flat = _squash_whitespace(content)
    if not reasoning_flat or not content_flat:
        return False
    if reasoning_flat == content_flat:
        return True

    shorter, longer = (
        (reasoning_flat, content_flat)
        if len(reasoning_flat) <= len(content_flat)
        else (content_flat, reasoning_flat)
    )
    if len(shorter) < 12:
        return False
    if shorter in longer and len(shorter) >= int(len(longer) * 0.75):
        return True
    return False


def _is_stream_trace_enabled() -> bool:
    value = str(os.getenv("QURIO_STREAM_TRACE", "")).strip().lower()
    return value in {"1", "true", "yes", "on", "debug"}


def _is_verbose_logs_enabled() -> bool:
    value = str(os.getenv("QURIO_VERBOSE_LOGS", "0")).strip().lower()
    return value in {"1", "true", "yes", "on", "debug"}


def _log_verbose_info(message: str) -> None:
    if _is_verbose_logs_enabled():
        logger.info(message)
    else:
        logger.debug(message)


def _preview(text: Any, limit: int = 140) -> str:
    raw = str(text or "").replace("\n", "\\n")
    return raw[:limit] + ("..." if len(raw) > limit else "")


def _extract_message_from_payload(payload: Any) -> str | None:
    if payload is None:
        return None
    if hasattr(payload, "model_dump"):
        try:
            payload = payload.model_dump()
        except Exception:
            payload = str(payload)

    if isinstance(payload, dict):
        for key in ("message", "error", "detail", "msg"):
            value = payload.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
            nested = _extract_message_from_payload(value)
            if nested:
                return nested
        for value in payload.values():
            nested = _extract_message_from_payload(value)
            if nested:
                return nested
        return None

    if isinstance(payload, (list, tuple)):
        for item in payload:
            nested = _extract_message_from_payload(item)
            if nested:
                return nested
        return None

    text = str(payload).strip()
    if not text:
        return None

    # Agno RunErrorEvent repr: RunErrorEvent(..., content='Unknown model error', ...)
    run_error_content_match = re.search(
        r"""content\s*=\s*(['"])(.*?)\1""",
        text,
        re.IGNORECASE | re.DOTALL,
    )
    if run_error_content_match and run_error_content_match.group(2).strip():
        return run_error_content_match.group(2).strip()

    for parser in (json.loads, ast.literal_eval):
        try:
            parsed = parser(text)
            nested = _extract_message_from_payload(parsed)
            if nested:
                return nested
        except Exception:
            pass

    json_like = re.search(r"(\{[\s\S]*\})", text)
    if json_like:
        snippet = json_like.group(1)
        for parser in (json.loads, ast.literal_eval):
            try:
                parsed = parser(snippet)
                nested = _extract_message_from_payload(parsed)
                if nested:
                    return nested
            except Exception:
                pass

    message_match = re.search(r"""['"]message['"]\s*:\s*['"](.+?)['"]""", text, re.IGNORECASE)
    if message_match and message_match.group(1).strip():
        return message_match.group(1).strip()

    return text


def _extract_best_error_message(exc: Exception | Any) -> str:
    """Extract the most actionable provider message from nested exceptions."""
    generic_markers = ("unknown model error", "unknown error", "model provider error")

    def _is_generic(text: str) -> bool:
        lowered = text.strip().lower()
        return any(marker in lowered for marker in generic_markers)

    candidates: list[str] = []
    queue: list[Any] = [exc]
    seen: set[int] = set()
    while queue:
        current = queue.pop(0)
        if current is None:
            continue
        marker = id(current)
        if marker in seen:
            continue
        seen.add(marker)

        extracted = _extract_message_from_payload(current)
        if extracted and extracted.strip():
            candidates.append(extracted.strip())

        if isinstance(current, BaseException):
            queue.append(getattr(current, "__cause__", None))
            queue.append(getattr(current, "__context__", None))
            args = getattr(current, "args", None)
            if isinstance(args, tuple):
                queue.extend(args)

        for attr in ("content", "error", "message", "detail", "model_provider_data"):
            if hasattr(current, attr):
                queue.append(getattr(current, attr, None))

    for msg in candidates:
        if not _is_generic(msg):
            return msg
    if candidates:
        # Avoid dumping full event repr like "RunErrorEvent(...)" to UI.
        filtered = [msg for msg in candidates if not msg.strip().lower().startswith("runerrorevent(")]
        if filtered:
            return min(filtered, key=len)
        return min(candidates, key=len)
    return str(exc or "Unknown error")


def _extract_text_chunk(run_event: Any) -> str:
    """Extract assistant text only from explicit content fields.

    Shared between stream_chat() and _continue_hitl_run() to avoid duplication.
    """
    provider_data = getattr(run_event, "model_provider_data", None)
    if isinstance(provider_data, dict):
        choices = provider_data.get("choices") or []
        if choices and isinstance(choices[0], dict):
            delta = choices[0].get("delta") or {}
            raw_content = delta.get("content")
            if isinstance(raw_content, str) and raw_content:
                return raw_content
            if isinstance(raw_content, list):
                parts: list[str] = []
                for item in raw_content:
                    if isinstance(item, dict):
                        text_part = item.get("text") or item.get("content")
                        if text_part:
                            parts.append(str(text_part))
                    elif isinstance(item, str) and item:
                        parts.append(item)
                if parts:
                    return "".join(parts)
            raw_reasoning = delta.get("reasoning_content")
            if isinstance(raw_reasoning, str) and raw_reasoning:
                return ""
            if isinstance(raw_reasoning, list):
                reasoning_parts: list[str] = []
                for item in raw_reasoning:
                    if isinstance(item, dict):
                        text_part = item.get("text") or item.get("content")
                        if text_part:
                            reasoning_parts.append(str(text_part))
                    elif isinstance(item, str) and item:
                        reasoning_parts.append(item)
                if reasoning_parts:
                    return ""

    content = getattr(run_event, "content", None)
    if isinstance(content, str) and content:
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, dict):
                text_part = item.get("text") or item.get("content")
                if isinstance(text_part, str) and text_part:
                    parts.append(text_part)
            elif isinstance(item, str) and item:
                parts.append(item)
        if parts:
            return "".join(parts)

    if isinstance(provider_data, dict):
        choices = provider_data.get("choices") or []
        if choices and isinstance(choices[0], dict):
            delta = choices[0].get("delta") or {}
            raw_content = delta.get("content")
            if isinstance(raw_content, str) and raw_content:
                return raw_content
            if isinstance(raw_content, list):
                parts: list[str] = []
                for item in raw_content:
                    if isinstance(item, dict):
                        text_part = item.get("text") or item.get("content")
                        if text_part:
                            parts.append(str(text_part))
                    elif isinstance(item, str) and item:
                        parts.append(item)
                if parts:
                    return "".join(parts)
    return ""


def _extract_reasoning_chunk(
    run_event: Any,
    trace_fn: Any = None,
) -> str:
    """Extract reasoning/thought content from a stream event.

    Shared between stream_chat() and _continue_hitl_run() to avoid duplication.
    ``trace_fn`` is an optional callable(stage, **kwargs) for trace logging.
    """
    def _trace(stage: str, **kwargs: Any) -> None:
        if trace_fn:
            trace_fn(stage, **kwargs)

    provider_data = getattr(run_event, "model_provider_data", None)
    if isinstance(provider_data, dict):
        choices = provider_data.get("choices") or []
        if choices and isinstance(choices[0], dict):
            delta = choices[0].get("delta") or {}
            raw_reasoning = delta.get("reasoning_content")
            if isinstance(raw_reasoning, str) and raw_reasoning:
                _trace("reasoning_source", source="provider_data.delta.reasoning_content")
                return raw_reasoning
            if isinstance(raw_reasoning, list):
                parts: list[str] = []
                for item in raw_reasoning:
                    if isinstance(item, dict):
                        text_part = item.get("text") or item.get("content")
                        if text_part:
                            parts.append(str(text_part))
                    elif isinstance(item, str) and item:
                        parts.append(item)
                if parts:
                    _trace("reasoning_source", source="provider_data.delta.reasoning_content[]")
                    return "".join(parts)

    reasoning = getattr(run_event, "reasoning_content", None)
    if isinstance(reasoning, str) and reasoning:
        _trace("reasoning_source", source="run_event.reasoning_content")
        return reasoning
    if isinstance(reasoning, list):
        parts: list[str] = []
        for item in reasoning:
            if isinstance(item, dict):
                text_part = item.get("text") or item.get("content")
                if text_part:
                    parts.append(str(text_part))
            elif isinstance(item, str) and item:
                parts.append(item)
        if parts:
            _trace("reasoning_source", source="run_event.reasoning_content[]")
            return "".join(parts)

    if isinstance(provider_data, dict):
        choices = provider_data.get("choices") or []
        if choices and isinstance(choices[0], dict):
            delta = choices[0].get("delta") or {}
            raw_reasoning = delta.get("reasoning_content")
            if isinstance(raw_reasoning, str) and raw_reasoning:
                _trace("reasoning_source", source="provider_data.delta.reasoning_content")
                return raw_reasoning
            if isinstance(raw_reasoning, list):
                parts: list[str] = []
                for item in raw_reasoning:
                    if isinstance(item, dict):
                        text_part = item.get("text") or item.get("content")
                        if text_part:
                            parts.append(str(text_part))
                if parts:
                    _trace("reasoning_source", source="provider_data.delta.reasoning_content[]")
                    return "".join(parts)
            # NOTE:
            # Some providers (e.g. DeepSeek-compatible streams) may place
            # assistant answer tokens under `delta.reasoning`.
            # Treating that field as reasoning can misclassify answer text as thought.
            # Keep reasoning extraction strict to `reasoning_content` only.
    return ""


def _is_raw_events_log_enabled() -> bool:
    value = str(os.getenv("QURIO_RAW_EVENTS_LOG", "0")).strip().lower()
    return value not in {"0", "false", "off", "no"}


def _raw_events_log_path() -> Path:
    configured = str(os.getenv("QURIO_RAW_EVENTS_LOG_PATH", "")).strip()
    if configured:
        return Path(configured)
    logs_dir = Path(__file__).resolve().parents[2] / "logs"
    logs_dir.mkdir(parents=True, exist_ok=True)
    date_tag = datetime.utcnow().strftime("%Y%m%d")
    return logs_dir / f"agno_raw_events_{date_tag}.jsonl"


def _append_raw_event_log(
    *,
    phase: str,
    request: StreamChatRequest,
    run_id: str | None,
    run_event: Any,
) -> None:
    if not _is_raw_events_log_enabled():
        return
    try:
        event_name = str(getattr(run_event, "event", "") or "")
        content_chunk = _extract_text_chunk(run_event)
        reasoning_chunk = _extract_reasoning_chunk(run_event)
        payload = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "phase": phase,
            "provider": request.provider,
            "model": request.model,
            "conversation_id": request.conversation_id,
            "run_id": run_id or getattr(run_event, "run_id", None),
            "event_name": event_name,
            "raw_event_type": type(run_event).__name__,
            "has_content": bool(str(content_chunk or "").strip()),
            "has_reasoning_content": bool(str(reasoning_chunk or "").strip()),
            "content_preview": _preview(content_chunk),
            "reasoning_preview": _preview(reasoning_chunk),
            "raw_event": repr(run_event),
        }
        log_path = _raw_events_log_path()
        with log_path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(payload, ensure_ascii=False) + "\n")
    except Exception:
        # Never break stream flow due to diagnostics logging failures.
        return


def _extract_completed_content_and_output(
    run_event: Any,
    streamed_content: str = "",
) -> tuple[str, Any]:
    """
    Extract final assistant content/output from RunCompleted-style events.

    Shared between normal stream_chat() and HITL continuation to keep behavior aligned.
    """
    agn_content = getattr(run_event, "content", None)
    run_response = getattr(run_event, "run_response", None)
    if not agn_content and run_response is not None:
        agn_content = getattr(run_response, "content", None)

    final_content = streamed_content or ""
    output = None

    # Structured output should override streamed text to preserve canonical payload.
    if agn_content and hasattr(agn_content, "model_dump"):
        output = agn_content
        final_content = json.dumps(agn_content.model_dump(), ensure_ascii=False)
    elif isinstance(agn_content, (dict, list)):
        output = agn_content
        final_content = json.dumps(agn_content, ensure_ascii=False)
    elif isinstance(agn_content, str) and agn_content.strip() and not final_content:
        final_content = agn_content

    # Fallback for providers that only keep final assistant text in run_response.messages.
    if not final_content and run_response is not None:
        try:
            rr_messages = getattr(run_response, "messages", None) or []
            for rr_msg in reversed(rr_messages):
                rr_role = getattr(rr_msg, "role", None)
                rr_content = getattr(rr_msg, "content", None)
                if rr_role != "assistant":
                    continue
                extracted = _extract_text_from_message_content(rr_content).strip()
                if extracted:
                    final_content = extracted
                    break
        except Exception:
            pass

    return final_content, output


def _extract_text_from_message_content(content: Any) -> str:
    """
    Best-effort text extraction for provider-specific assistant message payloads.
    """
    if isinstance(content, str):
        return content

    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
                continue
            if isinstance(item, dict):
                text_part = item.get("text")
                if isinstance(text_part, str):
                    parts.append(text_part)
                    continue
                content_part = item.get("content")
                if isinstance(content_part, str):
                    parts.append(content_part)
                    continue
                if isinstance(content_part, (list, dict)):
                    nested = _extract_text_from_message_content(content_part)
                    if nested:
                        parts.append(nested)
                parts_part = item.get("parts")
                if isinstance(parts_part, (list, dict)):
                    nested = _extract_text_from_message_content(parts_part)
                    if nested:
                        parts.append(nested)
        return "".join(parts)

    if isinstance(content, dict):
        text_part = content.get("text")
        if isinstance(text_part, str):
            return text_part
        content_part = content.get("content")
        if isinstance(content_part, str):
            return content_part
        if isinstance(content_part, (list, dict)):
            nested = _extract_text_from_message_content(content_part)
            if nested:
                return nested
        parts_part = content.get("parts")
        if isinstance(parts_part, (list, dict)):
            nested = _extract_text_from_message_content(parts_part)
            if nested:
                return nested

    return ""


def _coerce_tool_result_payload(output: Any) -> Any:
    """
    Normalize tool output payload into JSON-friendly objects when possible.
    """
    normalized = output
    if normalized and isinstance(normalized, str):
        try:
            normalized = json.loads(normalized)
        except json.JSONDecodeError:
            pass
        if isinstance(normalized, str):
            try:
                parsed = ast.literal_eval(normalized)
                if isinstance(parsed, dict):
                    normalized = parsed
            except (ValueError, SyntaxError):
                pass
    return normalized


def _build_tool_result_event(
    tool: Any,
    duration_ms: int | None,
    normalize_tool_output_fn: Any,
) -> tuple[dict[str, Any], Any]:
    """
    Build frontend ToolResultEvent payload and return parsed tool output.
    """
    output = _coerce_tool_result_payload(normalize_tool_output_fn(getattr(tool, "result", None)))
    event = ToolResultEvent(
        id=getattr(tool, "tool_call_id", None),
        name=getattr(tool, "tool_name", "") or "",
        status="done" if not getattr(tool, "tool_call_error", None) else "error",
        output=output,
        durationMs=duration_ms,
    ).model_dump()
    return event, output


def _build_tool_call_event(tool: Any, text_index: int, include_none: bool = False) -> dict[str, Any]:
    payload = ToolCallEvent(
        id=getattr(tool, "tool_call_id", None),
        name=getattr(tool, "tool_name", "") or "",
        arguments=json.dumps(getattr(tool, "tool_args", None) or {}),
        text_index=text_index,
    )
    if include_none:
        return payload.model_dump(by_alias=True, exclude_none=False)
    return payload.model_dump(by_alias=True)


def _normalize_interactive_form_fields(raw_fields: Any) -> list[dict[str, Any]]:
    """
    Normalize interactive_form fields to a strict list[dict].

    Some providers/tool runtimes return fields as a JSON string; this helper
    parses and sanitizes that shape so FormRequestEvent validation won't fail.
    """
    parsed = raw_fields

    if isinstance(parsed, str):
        text = parsed.strip()
        if not text:
            return []
        try:
            parsed = json.loads(text)
        except Exception:
            try:
                parsed = ast.literal_eval(text)
            except Exception:
                logger.warning("interactive_form fields is invalid string, fallback to empty list")
                return []

    if isinstance(parsed, dict):
        maybe_fields = parsed.get("fields")
        if isinstance(maybe_fields, list):
            parsed = maybe_fields
        else:
            return []

    if not isinstance(parsed, list):
        return []

    normalized: list[dict[str, Any]] = []
    used_names: set[str] = set()

    def _slugify_name(value: Any, fallback_index: int) -> str:
        base = re.sub(r"[^a-zA-Z0-9_]+", "_", str(value or "").strip().lower()).strip("_")
        if not base:
            base = f"field_{fallback_index}"
        candidate = base
        suffix = 2
        while candidate in used_names:
            candidate = f"{base}_{suffix}"
            suffix += 1
        used_names.add(candidate)
        return candidate

    def _normalize_field_type(value: Any) -> str:
        candidate = str(value or "").strip().lower()
        if candidate in {"text", "number", "select", "checkbox", "range"}:
            return candidate
        return "text"

    for idx, item in enumerate(parsed, start=1):
        if isinstance(item, str):
            label = item.strip()
            if not label:
                continue
            normalized.append(
                {
                    "name": _slugify_name(label, idx),
                    "label": label,
                    "type": "text",
                    "required": False,
                }
            )
            continue

        if not isinstance(item, dict):
            logger.warning("interactive_form field item is not dict, skipped: %s", type(item).__name__)
            continue

        raw_name = item.get("name")
        raw_label = item.get("label")
        label = str(raw_label or raw_name or f"Field {idx}").strip() or f"Field {idx}"
        field_name = _slugify_name(raw_name or label, idx)
        field_type = _normalize_field_type(item.get("type"))

        normalized_item = dict(item)
        normalized_item["name"] = field_name
        normalized_item["label"] = label
        normalized_item["type"] = field_type
        normalized_item["required"] = bool(item.get("required", False))
        normalized.append(normalized_item)

    return normalized


def _extract_interactive_form_payload(req: Any, default_title: str) -> tuple[str | None, str, list[dict[str, Any]]]:
    """Extract interactive form payload from requirement in a validation-safe way."""
    tool_args = req.tool_execution.tool_args if getattr(req, "tool_execution", None) else {}
    if not isinstance(tool_args, dict):
        tool_args = {}
    form_id = tool_args.get("id")
    title = str(tool_args.get("title") or default_title)
    fields = _normalize_interactive_form_fields(tool_args.get("fields", []))
    return form_id, title, fields


def _is_interactive_form_requirement(req: Any) -> bool:
    tool_exec = getattr(req, "tool_execution", None)
    tool_name = getattr(tool_exec, "tool_name", None) if tool_exec else None
    return tool_name == "interactive_form"

class StreamChatService:
    """Stream chat service implemented using Agno Agent streaming events."""

    def __init__(self) -> None:
        self._last_memory_optimization: dict[str, float] = {}

    async def stream_chat(
        self,
        request: StreamChatRequest,
    ) -> AsyncGenerator[dict[str, Any], None]:
        """
        Stream chat completion with HITL support.
        
        If request.run_id is present, this is a resumption request after form submission.
        Otherwise, this is a normal chat request.
        """
        # ================================================================
        # HITL: Check if this is a resumption request
        # ================================================================
        if request.run_id and request.field_values:
            _log_verbose_info(f"Detected HITL resumption request (run_id: {request.run_id})")
            async for event in self._continue_hitl_run(request):
                yield event
            return

        # ================================================================
        # Normal chat flow
        # ================================================================
        try:
            if not request.provider:
                raise ValueError("Missing required field: provider")
            if not request.messages:
                raise ValueError("Missing required field: messages")

            agent = get_agent_for_provider(request)
            sources_map: dict[str, Any] = {}
            full_content = ""
            full_thought = ""
            tool_start_times: dict[str, float] = {}
            should_break_next_thought = False
            in_reasoning_phase = False
            reasoning_closed_for_current_cycle = False
            in_content_think_block = False
            inline_tool_trace_depth = 0
            inline_protocol_tail = ""
            stream_trace = _is_stream_trace_enabled()

            def trace_stream(stage: str, **kwargs: Any) -> None:
                if not stream_trace:
                    return
                payload = ", ".join([f"{k}={v}" for k, v in kwargs.items()])
                logger.info(f"[STREAM_TRACE][main] {stage} | {payload}")

            def emit_thought_part(part: str):
                nonlocal full_thought, full_content, should_break_next_thought, in_reasoning_phase, reasoning_closed_for_current_cycle
                text = _strip_internal_tool_trace(str(part or ""))
                if not text or not text.strip():
                    return

                should_break_next_thought = False
                in_reasoning_phase = True
                full_thought += text
                trace_stream("emit_reasoning", reasoning_preview=_preview(text))
                current_text_index = len(full_content)
                yield ThoughtEvent(content=text, text_index=current_text_index).model_dump(by_alias=True, exclude_none=False)

            def process_text(text: str):
                nonlocal full_content, in_reasoning_phase, should_break_next_thought, reasoning_closed_for_current_cycle
                clean_text = _strip_internal_tool_trace(text)
                if clean_text:
                    has_visible_text = bool(clean_text.strip())
                    if has_visible_text:
                        in_reasoning_phase = False
                        should_break_next_thought = True
                        reasoning_closed_for_current_cycle = True
                    full_content += clean_text
                    yield TextEvent(content=clean_text).model_dump()

            # Context management now handled by Agno's num_history_runs parameter
            messages = request.messages
            pre_events: list[dict[str, Any]] = []

            messages = self._inject_local_time_context(messages, request, pre_events)
            enabled_tool_names = self._collect_enabled_tool_names(request)
            messages = self._inject_tool_guidance(messages, enabled_tool_names, request)

            for event in pre_events:
                yield event

            # ================================================================
            # MANUAL CONTEXT MANAGEMENT (Rolling Summary + Fixed Window)
            # ================================================================

            # 1. Fetch Session Summary from DB
            session_summary_text = None
            old_summary_json = None
            if request.conversation_id:
                try:
                    from ..models.db import DbFilter, DbQueryRequest
                    from .db_service import execute_db_async, get_db_adapter

                    adapter = get_db_adapter(request.database_provider)
                    if adapter:
                        req = DbQueryRequest(
                            providerId=adapter.config.id,
                            action="select",
                            table="conversations",
                            columns=["session_summary"],
                            filters=[DbFilter(op="eq", column="id", value=request.conversation_id)],
                            maybeSingle=True,
                        )

                        result = await execute_db_async(adapter, req)

                        if result.data and isinstance(result.data, dict):
                            row = result.data
                            raw_summary = row.get("session_summary")

                            if raw_summary:
                                # Parsing handled by adapter often, but double check
                                if isinstance(raw_summary, str):
                                    try:
                                        old_summary_json = json.loads(raw_summary)
                                    except (ValueError, json.JSONDecodeError):
                                        pass
                                elif isinstance(raw_summary, dict):
                                    old_summary_json = raw_summary

                                if old_summary_json:
                                    session_summary_text = old_summary_json.get("summary")
                except Exception as e:
                    logger.warning(f"Failed to fetch session summary: {e}")
                    logger.error(f"Failed to fetch session summary: {e}")

            # 2. Slice History (Turn-Based Window)
            # Strategy: Keep all System messages + Last N User turns (User + AI + Tools)
            # N comes from frontend context setting: contextTurns.
            raw_turn_limit = request.context_turn_limit
            turn_limit = (
                max(1, min(50, int(raw_turn_limit)))
                if isinstance(raw_turn_limit, int) and raw_turn_limit > 0
                else 2
            )

            # Separate System and Non-System
            system_messages = [m for m in messages if m.get("role") == "system"]
            chat_messages = [m for m in messages if m.get("role") != "system"]

            # Find the indices of User messages to determine run boundaries
            user_indices = [i for i, m in enumerate(chat_messages) if m.get("role") == "user"]

            user_turn_count = len(user_indices)
            if user_turn_count > turn_limit:
                cutoff_index = user_indices[-turn_limit]
                recent_history = chat_messages[cutoff_index:]
            else:
                recent_history = chat_messages

            # For single-turn requests (common during first-turn regenerate),
            # using persisted summary can re-introduce stale assistant text.
            # In this case, use fresh request messages only and rebuild summary from this turn.
            is_single_user_turn = user_turn_count <= 1
            # Force rebuild if it's the first turn OR if the user is editing/regenerating
            should_rebuild_summary = bool(is_single_user_turn or request.is_editing)
            # Inject summary only when history exceeds turn window and request is not rebuild flow.
            should_inject_summary = bool(session_summary_text) and (user_turn_count > turn_limit) and (not should_rebuild_summary)
            if not should_inject_summary and session_summary_text:
                _log_verbose_info(
                    "Skipping session summary injection (within turn window or single-turn rebuild context)."
                )
                session_summary_text = None
                old_summary_json = None

            # 3. Inject Summary into System Prompt
            if session_summary_text:
                summary_prompt = (
                    "\n\nSession memory summary:\n"
                    "Here is a summary of the conversation so far. Use this to understand long-term context, "
                    "but prioritize the details in the recent messages below.\n"
                    f"{session_summary_text}\n"
                )
                # Inject into the LAST system message, or create a new one if none exist
                if system_messages:
                    last_sys = system_messages[-1]
                    # Avoid appending if already present (defensive)
                    if "Session memory summary:" not in str(last_sys.get("content", "")):
                        new_content = str(last_sys.get("content", "")) + summary_prompt
                        # Update the dict (need to be careful not to mutate original request list in place if reused, but here it's fine)
                        last_sys["content"] = new_content
                else:
                    system_messages.append({"role": "system", "content": summary_prompt})

            # Final Agent Input
            agent_input = system_messages + recent_history

            stream = agent.arun(
                input=agent_input,
                stream=True,
                stream_events=True,
                user_id=request.user_id,
                session_id=request.conversation_id,
                # Only pass explicit structured-output schema.
                # Do not fallback to response_format, otherwise {"type":"json_object"}
                # may be treated as grammar and trigger provider-side grammar cache errors.
                output_schema=request.output_schema,
            )

            # ================================================================
            # Stream processing with HITL support
            # ================================================================
            async for run_event in stream:
                _append_raw_event_log(
                    phase="main",
                    request=request,
                    run_id=getattr(run_event, "run_id", None),
                    run_event=run_event,
                )
                # ============================================================
                # HITL: Check if agent paused for user input
                # ============================================================
                if hasattr(run_event, 'is_paused') and run_event.is_paused:
                    logger.info(f"Agent paused for HITL (run_id: {run_event.run_id})")

                    # Extract requirements
                    requirements = getattr(run_event, 'active_requirements', None) or getattr(run_event, 'requirements', None)

                    if requirements:
                        form_requirements = [req for req in requirements if _is_interactive_form_requirement(req)]
                        if not form_requirements:
                            logger.info("Agent paused without interactive_form; skipping HITL form handling")
                            yield DoneEvent(
                                content=full_content or "",
                                thought=full_thought.strip() or None,
                                sources=list(sources_map.values()) or None,
                            ).model_dump()
                            return

                        # Save to Supabase
                        try:
                            paused_tools = getattr(run_event, "tools", None) or []
                            serialized_tools = [
                                tool.to_dict() if hasattr(tool, "to_dict") else tool
                                for tool in paused_tools
                                if tool is not None
                            ]
                            serialized_requirements = [
                                req.to_dict() if hasattr(req, "to_dict") else req
                                for req in form_requirements
                            ]
                            paused_run_output = {
                                "run_id": getattr(run_event, "run_id", None),
                                "session_id": getattr(run_event, "session_id", None)
                                or request.conversation_id,
                                "user_id": request.user_id,
                                "messages": messages or [],
                                "tools": serialized_tools,
                                "requirements": serialized_requirements,
                                "status": "PAUSED",
                            }
                            logger.info(
                                f"[HITL] Saving pending run_id={run_event.run_id} "
                                f"with database_provider={request.database_provider}"
                            )
                            hitl_storage = get_hitl_storage(request.database_provider)
                            saved = await hitl_storage.save_pending_run(
                                run_id=run_event.run_id,
                                requirements=form_requirements,
                                conversation_id=request.conversation_id,
                                user_id=request.user_id,
                                agent_model=request.model,
                                messages=messages,
                                run_output=paused_run_output,
                            )
                            if not saved:
                                raise RuntimeError("Failed to persist HITL pending run")

                            # Extract form fields for frontend
                            for req in form_requirements:
                                # Handle external execution (e.g., interactive_form with external_execution=True)
                                if (hasattr(req, 'needs_external_execution') and req.needs_external_execution) or \
                                   (req.tool_execution and req.tool_execution.tool_name == "interactive_form"):
                                    form_id, title, fields = _extract_interactive_form_payload(
                                        req,
                                        default_title="Please provide the following information",
                                    )

                                    # Send form_request event to frontend
                                    yield FormRequestEvent(
                                        run_id=run_event.run_id,
                                        form_id=form_id,
                                        title=title,
                                        fields=fields
                                    ).model_dump()

                                # Fallback handle traditional user input (e.g., get_user_input)
                                elif req.needs_user_input and req.user_input_schema:
                                    # Convert from user_input_schema
                                    form_id = None
                                    title = "Please provide the following information"
                                    fields = [
                                        {
                                            "name": field.name,
                                            "type": self._map_field_type_to_frontend(field.field_type),
                                            "label": field.description or field.name,
                                            "required": True,
                                            "value": field.value
                                        }
                                        for field in req.user_input_schema
                                    ]

                                    # Send form_request event to frontend
                                    yield FormRequestEvent(
                                        run_id=run_event.run_id,
                                        form_id=form_id,
                                        title=title,
                                        fields=fields
                                    ).model_dump()

                            # Send done event to indicate pause
                            yield DoneEvent(
                                content=full_content or "",
                                thought=full_thought.strip() or None,
                                sources=list(sources_map.values()) or None,
                            ).model_dump()

                            _log_verbose_info(f"HITL pause successful, waiting for user submission (run_id: {run_event.run_id})")
                            return  # Exit stream, wait for user to submit form

                        except Exception as e:
                            logger.error(f"Failed to save HITL state: {e}")
                            yield ErrorEvent(error=f"Failed to pause for form: {str(e)}").model_dump()
                            return
                    else:
                        logger.warning("Agent paused but no requirements found")
                        yield DoneEvent(
                            content=full_content or "",
                            thought=full_thought.strip() or None,
                            sources=list(sources_map.values()) or None,
                        ).model_dump()
                        return

                # ============================================================
                # Normal streaming events (use stream_events for details)
                # ============================================================
                # Check if this is a detailed event (from stream_events=True)
                if hasattr(run_event, 'event'):
                    match run_event.event:
                        case RunEvent.run_content.value:
                            raw_content_chunk = _extract_text_chunk(run_event)
                            raw_content_chunk, inline_tool_trace_depth, inline_protocol_tail, had_protocol = _strip_inline_tool_protocol(
                                raw_content_chunk,
                                inline_tool_trace_depth,
                                inline_protocol_tail,
                            )
                            if had_protocol:
                                trace_stream(
                                    "strip_tool_protocol",
                                    depth=inline_tool_trace_depth,
                                    tail_len=len(inline_protocol_tail),
                                    cleaned_preview=_preview(raw_content_chunk),
                                )
                            raw_reasoning = _extract_reasoning_chunk(run_event, trace_fn=trace_stream)
                            content_segments, in_content_think_block = _split_content_by_think_tags(
                                raw_content_chunk,
                                in_content_think_block,
                            )
                            content_chunk = "".join(
                                seg_text for seg_type, seg_text in content_segments if seg_type == "text"
                            )
                            inline_thought_chunk = "".join(
                                seg_text for seg_type, seg_text in content_segments if seg_type == "thought"
                            )
                            reasoning = raw_reasoning
                            if reasoning and content_chunk and _is_reasoning_duplicate_of_content(
                                str(reasoning),
                                str(content_chunk),
                            ):
                                trace_stream(
                                    "suppress_reasoning_overlap",
                                    event="run_content",
                                    reasoning_preview=_preview(reasoning),
                                    content_preview=_preview(content_chunk),
                                )
                                reasoning = ""
                            has_content_chunk = bool(content_chunk)
                            has_inline_thought = bool(inline_thought_chunk)
                            trace_stream(
                                "run_content",
                                has_content=has_content_chunk,
                                has_reasoning=bool(reasoning) or has_inline_thought,
                                reasoning_closed=reasoning_closed_for_current_cycle,
                                content_preview=_preview(content_chunk),
                                reasoning_preview=_preview((reasoning or "") + (inline_thought_chunk or "")),
                            )

                            has_any_thought = bool(reasoning) or has_inline_thought
                            if has_any_thought and reasoning_closed_for_current_cycle:
                                # Re-open reasoning phase (e.g. after tool call or interleaved model output).
                                reasoning_closed_for_current_cycle = False
                                in_reasoning_phase = False
                                should_break_next_thought = True

                            if reasoning:
                                for event in emit_thought_part(str(reasoning)):
                                    yield event
                            if has_inline_thought:
                                for event in emit_thought_part(str(inline_thought_chunk)):
                                    yield event

                            if content_chunk:
                                for e in process_text(content_chunk):
                                    yield e
                                trace_stream(
                                    "emit_content",
                                    reasoning_closed=reasoning_closed_for_current_cycle,
                                    content_preview=_preview(content_chunk),
                                )

                        case RunEvent.reasoning_content_delta.value:
                            raw_content_chunk = _extract_text_chunk(run_event)
                            raw_content_chunk, inline_tool_trace_depth, inline_protocol_tail, had_protocol = _strip_inline_tool_protocol(
                                raw_content_chunk,
                                inline_tool_trace_depth,
                                inline_protocol_tail,
                            )
                            if had_protocol:
                                trace_stream(
                                    "strip_tool_protocol",
                                    depth=inline_tool_trace_depth,
                                    tail_len=len(inline_protocol_tail),
                                    cleaned_preview=_preview(raw_content_chunk),
                                )
                            raw_reasoning = _extract_reasoning_chunk(run_event)
                            content_segments, in_content_think_block = _split_content_by_think_tags(
                                raw_content_chunk,
                                in_content_think_block,
                            )
                            content_chunk = "".join(
                                seg_text for seg_type, seg_text in content_segments if seg_type == "text"
                            )
                            inline_thought_chunk = "".join(
                                seg_text for seg_type, seg_text in content_segments if seg_type == "thought"
                            )
                            reasoning = raw_reasoning
                            if reasoning and content_chunk and _is_reasoning_duplicate_of_content(
                                str(reasoning),
                                str(content_chunk),
                            ):
                                trace_stream(
                                    "suppress_reasoning_overlap",
                                    event="reasoning_content_delta",
                                    reasoning_preview=_preview(reasoning),
                                    content_preview=_preview(content_chunk),
                                )
                                reasoning = ""
                            has_content_chunk = bool(content_chunk)
                            has_inline_thought = bool(inline_thought_chunk)
                            trace_stream(
                                "reasoning_delta",
                                has_content=has_content_chunk,
                                has_reasoning=bool(reasoning) or has_inline_thought,
                                reasoning_closed=reasoning_closed_for_current_cycle,
                                content_preview=_preview(content_chunk),
                                reasoning_preview=_preview((reasoning or "") + (inline_thought_chunk or "")),
                            )

                            has_any_thought = bool(reasoning) or has_inline_thought
                            if has_any_thought and reasoning_closed_for_current_cycle:
                                reasoning_closed_for_current_cycle = False
                                in_reasoning_phase = False
                                should_break_next_thought = True

                            if reasoning:
                                for event in emit_thought_part(str(reasoning)):
                                    yield event
                            if has_inline_thought:
                                for event in emit_thought_part(str(inline_thought_chunk)):
                                    yield event

                            if content_chunk:
                                for e in process_text(content_chunk):
                                    yield e
                                trace_stream(
                                    "emit_content",
                                    reasoning_closed=reasoning_closed_for_current_cycle,
                                    content_preview=_preview(content_chunk),
                                )

                        case RunEvent.tool_call_started.value:
                            tool_event: ToolCallStartedEvent = run_event  # type: ignore[assignment]
                            tool = tool_event.tool
                            if tool:
                                in_reasoning_phase = False
                                should_break_next_thought = True
                                reasoning_closed_for_current_cycle = False
                                in_content_think_block = False
                                inline_tool_trace_depth = 0
                                inline_protocol_tail = ""
                                if tool.tool_call_id:
                                    tool_start_times[tool.tool_call_id] = time.time()
                                trace_stream(
                                    "tool_call_started",
                                    tool_name=tool.tool_name or "",
                                    tool_call_id=tool.tool_call_id,
                                )
                                current_text_index = len(full_content)
                                yield _build_tool_call_event(
                                    tool,
                                    current_text_index,
                                    include_none=True,
                                )

                        case RunEvent.tool_call_completed.value:
                            tool_event: ToolCallCompletedEvent = run_event  # type: ignore[assignment]
                            tool = tool_event.tool
                            if tool:
                                in_reasoning_phase = False
                                should_break_next_thought = True
                                reasoning_closed_for_current_cycle = False
                                in_content_think_block = False
                                inline_tool_trace_depth = 0
                                inline_protocol_tail = ""
                                duration_ms = None
                                if tool.tool_call_id and tool.tool_call_id in tool_start_times:
                                    duration_ms = int((time.time() - tool_start_times[tool.tool_call_id]) * 1000)
                                trace_stream(
                                    "tool_call_completed",
                                    tool_name=tool.tool_name or "",
                                    tool_call_id=tool.tool_call_id,
                                    is_error=bool(tool.tool_call_error),
                                )
                                tool_result_event, output = _build_tool_result_event(
                                    tool,
                                    duration_ms,
                                    self._normalize_tool_output,
                                )
                                yield tool_result_event
                                self._collect_search_sources(output, sources_map)

                        case RunEvent.run_completed.value:
                            final_content, output = _extract_completed_content_and_output(
                                run_event,
                                full_content,
                            )

                            yield DoneEvent(
                                content=final_content,
                                output=output,
                                thought=full_thought.strip() or None,
                                sources=list(sources_map.values()) or None,
                            ).model_dump()
                            if request:
                                    asyncio.create_task(self._maybe_optimize_memories(agent, request))

                            # 4. Trigger Async Session Summary Update
                            # Only if conversation_id exists (Main Chat Flow) AND summary is enabled
                            if request.conversation_id and request.enable_session_summary:
                                # Prepare summary lines:
                                # - Normal flow: incremental update with last user + new assistant
                                # - Regenerate/Edit (or single-turn rebuild): rebuild from current request context + new assistant
                                if should_rebuild_summary:
                                    new_lines = [
                                        m for m in messages
                                        if m.get("role") in ("user", "assistant")
                                    ]
                                    new_lines.append({"role": "assistant", "content": final_content})
                                else:
                                    new_lines = []
                                    last_user = next((m for m in reversed(messages) if m.get("role") == "user"), None)
                                    if last_user:
                                        new_lines.append(last_user)
                                    new_lines.append({"role": "assistant", "content": final_content})

                                _log_verbose_info(f"Triggering async summary update for {request.conversation_id} with {len(new_lines)} messages (rebuild: {should_rebuild_summary}, is_editing: {request.is_editing})")
                                asyncio.create_task(update_session_summary(
                                    conversation_id=request.conversation_id,
                                    old_summary=old_summary_json,
                                    new_messages=new_lines,
                                    database_provider=request.database_provider,
                                    memory_provider=request.memory_provider,
                                    memory_model=request.memory_model,
                                    memory_api_key=request.memory_api_key,
                                    memory_base_url=request.memory_base_url,
                                    summary_provider=request.summary_provider,
                                    summary_model=request.summary_model,
                                    summary_api_key=request.summary_api_key,
                                    summary_base_url=request.summary_base_url,
                                    rebuild_from_scratch=should_rebuild_summary,
                                ))

                            return

                        case RunEvent.run_error.value:
                            error_msg = _extract_best_error_message(run_event)
                            yield ErrorEvent(error=error_msg).model_dump()
                            return
                else:
                    # Simple event Fallback (no detailed event type), just check for content
                    raw_content_chunk = _extract_text_chunk(run_event)
                    raw_content_chunk, inline_tool_trace_depth, inline_protocol_tail, _ = _strip_inline_tool_protocol(
                        raw_content_chunk,
                        inline_tool_trace_depth,
                        inline_protocol_tail,
                    )
                    raw_reasoning = _extract_reasoning_chunk(run_event)
                    content_segments, in_content_think_block = _split_content_by_think_tags(
                        raw_content_chunk,
                        in_content_think_block,
                    )
                    content_chunk = "".join(
                        seg_text for seg_type, seg_text in content_segments if seg_type == "text"
                    )
                    inline_thought_chunk = "".join(
                        seg_text for seg_type, seg_text in content_segments if seg_type == "thought"
                    )
                    if raw_reasoning:
                        for event in emit_thought_part(str(raw_reasoning)):
                            yield event
                    if inline_thought_chunk:
                        for event in emit_thought_part(str(inline_thought_chunk)):
                            yield event
                    if content_chunk:
                        for e in process_text(content_chunk):
                            yield e

        except Exception as exc:
            logger.error(f"Stream chat error: {exc}")
            yield ErrorEvent(error=_extract_best_error_message(exc)).model_dump()

    async def _continue_hitl_run(
        self,
        request: StreamChatRequest,
    ) -> AsyncGenerator[dict[str, Any], None]:
        """
        Continue a paused HITL run after user submits form.
        
        This method:
        1. Retrieves requirements from storage
        2. Rebuilds continuation messages with submitted form values
        3. Runs agent.arun() and streams completion
        4. Cleans up storage record
        """
        try:
            run_id = request.run_id
            field_values = request.field_values or {}

            _log_verbose_info(
                f"[HITL] Continuing run_id={run_id!r} "
                f"with database_provider={request.database_provider} "
                f"and field_values={list(field_values.keys())}"
            )

            # 1. Fetch Session Summary from DB
            session_summary_text = None
            old_summary_json = None
            if request.conversation_id:
                try:
                    from ..models.db import DbFilter, DbQueryRequest
                    from .db_service import execute_db_async, get_db_adapter

                    adapter = get_db_adapter(request.database_provider)
                    if adapter:
                        req = DbQueryRequest(
                            providerId=adapter.config.id,
                            action="select",
                            table="conversations",
                            columns=["session_summary"],
                            filters=[DbFilter(op="eq", column="id", value=request.conversation_id)],
                            maybeSingle=True,
                        )

                        result = await execute_db_async(adapter, req)

                        if result.data and isinstance(result.data, dict):
                            row = result.data
                            raw_summary = row.get("session_summary")

                            if raw_summary:
                                if isinstance(raw_summary, str):
                                    try:
                                        old_summary_json = json.loads(raw_summary)
                                    except (ValueError, json.JSONDecodeError):
                                        pass
                                elif isinstance(raw_summary, dict):
                                    old_summary_json = raw_summary

                                if old_summary_json:
                                    session_summary_text = old_summary_json.get("summary")
                except Exception as e:
                    logger.warning(f"Failed to fetch session summary in HITL flow: {e}")

            # Retrieve requirements from Supabase
            hitl_storage = get_hitl_storage(request.database_provider)
            pending = await hitl_storage.get_pending_run(run_id)

            requirements = None
            saved_messages = None
            saved_run_output = None
            if isinstance(pending, dict):
                requirements = pending.get("requirements")
                saved_messages = pending.get("messages")
                saved_run_output = pending.get("run_output")
            else:
                requirements = pending

            _log_verbose_info(
                "[HITL] loaded pending payload: "
                f"has_requirements={bool(requirements)}, "
                f"messages_type={type(saved_messages).__name__ if saved_messages is not None else 'None'}, "
                f"has_run_output={saved_run_output is not None}, "
                f"run_output_type={type(saved_run_output).__name__ if saved_run_output is not None else 'None'}"
            )

            if not requirements:
                logger.error(
                    f"[HITL] No pending run found for run_id={run_id!r} "
                    f"(database_provider={request.database_provider})"
                )
                yield ErrorEvent(error="Form session expired or not found").model_dump()
                return

            # Get agent (same provider as original request)
            agent = get_agent_for_provider(request)
            _log_verbose_info(f"[HITL Continue] Agent instructions: {getattr(agent, 'instructions', None)}")

            full_content = ""
            full_thought = ""
            sources_map: dict[str, Any] = {}
            tool_start_times: dict[str, float] = {}
            should_break_next_thought = False
            in_reasoning_phase = False
            reasoning_closed_for_current_cycle = False
            in_content_think_block = False
            inline_tool_trace_depth = 0
            inline_protocol_tail = ""
            stream_trace = _is_stream_trace_enabled()
            paused_again = False  # Flag to prevent cleanup when multi-form chaining occurs
            stream_had_error = False
            completed_content_fallback = ""
            saw_terminal_completion = False
            continuation_event_count = 0
            last_event_name: str | None = None
            last_event_type: str | None = None
            last_event_run_id: str | None = None

            def trace_stream(stage: str, **kwargs: Any) -> None:
                if not stream_trace:
                    return
                payload = ", ".join([f"{k}={v}" for k, v in kwargs.items()])
                logger.info(f"[STREAM_TRACE][hitl] {stage} | {payload}")

            def emit_thought_part(part: str):
                nonlocal full_thought, full_content, should_break_next_thought, in_reasoning_phase, reasoning_closed_for_current_cycle
                text = _strip_internal_tool_trace(str(part or ""))
                if not text or not text.strip():
                    return
                should_break_next_thought = False
                in_reasoning_phase = True
                full_thought += text
                trace_stream("emit_reasoning", reasoning_preview=_preview(text))
                current_text_index = len(full_content)
                yield ThoughtEvent(content=text, text_index=current_text_index).model_dump(by_alias=True)

            def process_text(text: str):
                nonlocal full_content, in_reasoning_phase, should_break_next_thought, reasoning_closed_for_current_cycle
                clean_text = _strip_internal_tool_trace(text)
                if clean_text:
                    has_visible_text = bool(clean_text.strip())
                    if has_visible_text:
                        in_reasoning_phase = False
                        should_break_next_thought = True
                        reasoning_closed_for_current_cycle = True
                    full_content += clean_text
                    yield TextEvent(content=clean_text).model_dump()

            async def _iterate_run_stream(stream: Any):
                """
                Normalize both async and sync Agno run streams into an async iterator.
                """
                if hasattr(stream, "__aiter__"):
                    async for item in stream:
                        yield item
                    return

                iterator = iter(stream)
                sentinel = object()
                while True:
                    item = await asyncio.to_thread(lambda: next(iterator, sentinel))
                    if item is sentinel:
                        break
                    yield item

            async def _stream_events(stream):
                nonlocal full_content, full_thought, sources_map, tool_start_times, paused_again, stream_had_error
                nonlocal in_reasoning_phase, should_break_next_thought, reasoning_closed_for_current_cycle
                nonlocal in_content_think_block, inline_tool_trace_depth, inline_protocol_tail
                nonlocal completed_content_fallback, saw_terminal_completion
                nonlocal continuation_event_count, last_event_name, last_event_type, last_event_run_id
                async for run_event in _iterate_run_stream(stream):
                    _append_raw_event_log(
                        phase="hitl_continuation",
                        request=request,
                        run_id=run_id,
                        run_event=run_event,
                    )
                    continuation_event_count += 1
                    last_event_type = type(run_event).__name__
                    last_event_name = str(getattr(run_event, "event", None) or last_event_type)
                    raw_event_run_id = getattr(run_event, "run_id", None)
                    last_event_run_id = str(raw_event_run_id) if raw_event_run_id else None

                    # When yield_run_output=True, acontinue_run may yield the final RunOutput object.
                    # Capture its canonical content as a robust fallback for providers that emit sparse events.
                    if isinstance(run_event, RunOutput):
                        saw_terminal_completion = True
                        completed_content_fallback, _ = _extract_completed_content_and_output(
                            run_event,
                            completed_content_fallback or full_content,
                        )
                        text_from_output = _extract_text_from_message_content(
                            getattr(run_event, "content", None)
                        ).strip()
                        if text_from_output:
                            for e in process_text(text_from_output):
                                yield e
                        continue

                    # HITL Pause Check
                    if hasattr(run_event, 'is_paused') and run_event.is_paused:
                        logger.info(f"Agent paused again during continuation (multi-form chain, run_id: {run_id})")

                        # Extract new requirements
                        new_requirements = getattr(run_event, 'active_requirements', None) or getattr(run_event, 'requirements', None)

                        if new_requirements:
                            form_requirements = [req for req in new_requirements if _is_interactive_form_requirement(req)]

                            if form_requirements:
                                # Save new form requirements (overwrites previous in memory)
                                hitl_storage_multi = get_hitl_storage(request.database_provider)
                                saved = await hitl_storage_multi.save_pending_run(
                                    run_id=run_id,
                                    requirements=form_requirements,
                                    conversation_id=request.conversation_id,
                                    user_id=request.user_id,
                                    agent_model=request.model,
                                    messages=saved_messages,  # Reuse saved messages
                                    run_output=(
                                        {
                                            "run_id": getattr(run_event, "run_id", None) or run_id,
                                            "session_id": getattr(run_event, "session_id", None)
                                            or request.conversation_id,
                                            "user_id": request.user_id,
                                            "messages": saved_messages or [],
                                            "tools": [
                                                tool.to_dict() if hasattr(tool, "to_dict") else tool
                                                for tool in (getattr(run_event, "tools", None) or [])
                                                if tool is not None
                                            ],
                                            "requirements": [
                                                req.to_dict() if hasattr(req, "to_dict") else req
                                                for req in form_requirements
                                            ],
                                            "status": "PAUSED",
                                        }
                                    ),
                                )
                                if not saved:
                                    raise RuntimeError("Failed to persist chained HITL pending run")

                                # Extract form fields and notify frontend
                                for req in form_requirements:
                                    if (hasattr(req, 'needs_external_execution') and req.needs_external_execution) or \
                                       (req.tool_execution and req.tool_execution.tool_name == "interactive_form"):
                                        form_id, title, fields = _extract_interactive_form_payload(
                                            req,
                                            default_title="Please provide additional information",
                                        )

                                        yield FormRequestEvent(
                                            run_id=run_id,
                                            form_id=form_id,
                                            title=title,
                                            fields=fields
                                        ).model_dump()

                                # Send partial done event
                                yield DoneEvent(
                                    content=full_content or "",
                                    thought=full_thought.strip() or None,
                                    sources=list(sources_map.values()) or None,
                                ).model_dump()

                                logger.info(f"Multi-form: saved second form, waiting for user (run_id: {run_id})")
                                paused_again = True  # Mark as paused again to skip cleanup
                                return

                        # If no form requirements, just continue
                        logger.warning(f"Agent paused again but no interactive_form found (run_id: {run_id})")
                        yield ErrorEvent(error="Agent paused unexpectedly").model_dump()
                        return

                    # Check if this is a detailed event (from stream_events=True or implicit)
                    if hasattr(run_event, 'event'):
                        match run_event.event:
                            case RunEvent.run_content.value:
                                raw_content_chunk = _extract_text_chunk(run_event)
                                raw_content_chunk, inline_tool_trace_depth, inline_protocol_tail, had_protocol = _strip_inline_tool_protocol(
                                    raw_content_chunk,
                                    inline_tool_trace_depth,
                                    inline_protocol_tail,
                                )
                                if had_protocol:
                                    trace_stream(
                                        "strip_tool_protocol",
                                        depth=inline_tool_trace_depth,
                                        tail_len=len(inline_protocol_tail),
                                        cleaned_preview=_preview(raw_content_chunk),
                                    )
                                raw_reasoning = _extract_reasoning_chunk(run_event, trace_fn=trace_stream)
                                content_segments, in_content_think_block = _split_content_by_think_tags(
                                    raw_content_chunk,
                                    in_content_think_block,
                                )
                                content_chunk = "".join(
                                    seg_text for seg_type, seg_text in content_segments if seg_type == "text"
                                )
                                inline_thought_chunk = "".join(
                                    seg_text for seg_type, seg_text in content_segments if seg_type == "thought"
                                )
                                reasoning = raw_reasoning
                                if reasoning and content_chunk and _is_reasoning_duplicate_of_content(
                                    str(reasoning),
                                    str(content_chunk),
                                ):
                                    trace_stream(
                                        "suppress_reasoning_overlap",
                                        event="run_content",
                                        reasoning_preview=_preview(reasoning),
                                        content_preview=_preview(content_chunk),
                                    )
                                    reasoning = ""
                                has_content_chunk = bool(content_chunk)
                                has_inline_thought = bool(inline_thought_chunk)
                                trace_stream(
                                    "run_content",
                                    has_content=has_content_chunk,
                                    has_reasoning=bool(reasoning) or has_inline_thought,
                                    reasoning_closed=reasoning_closed_for_current_cycle,
                                    content_preview=_preview(content_chunk),
                                    reasoning_preview=_preview((reasoning or "") + (inline_thought_chunk or "")),
                                )

                                has_any_thought = bool(reasoning) or has_inline_thought
                                if has_any_thought and reasoning_closed_for_current_cycle:
                                    reasoning_closed_for_current_cycle = False
                                    in_reasoning_phase = False
                                    should_break_next_thought = True

                                if reasoning:
                                    for event in emit_thought_part(str(reasoning)):
                                        yield event
                                if has_inline_thought:
                                    for event in emit_thought_part(str(inline_thought_chunk)):
                                        yield event

                                if content_chunk:
                                    for e in process_text(content_chunk):
                                        yield e
                                    trace_stream(
                                        "emit_content",
                                        reasoning_closed=reasoning_closed_for_current_cycle,
                                        content_preview=_preview(content_chunk),
                                    )

                            case RunEvent.reasoning_content_delta.value:
                                raw_content_chunk = _extract_text_chunk(run_event)
                                raw_content_chunk, inline_tool_trace_depth, inline_protocol_tail, had_protocol = _strip_inline_tool_protocol(
                                    raw_content_chunk,
                                    inline_tool_trace_depth,
                                    inline_protocol_tail,
                                )
                                if had_protocol:
                                    trace_stream(
                                        "strip_tool_protocol",
                                        depth=inline_tool_trace_depth,
                                        tail_len=len(inline_protocol_tail),
                                        cleaned_preview=_preview(raw_content_chunk),
                                    )
                                raw_reasoning = _extract_reasoning_chunk(run_event)
                                content_segments, in_content_think_block = _split_content_by_think_tags(
                                    raw_content_chunk,
                                    in_content_think_block,
                                )
                                content_chunk = "".join(
                                    seg_text for seg_type, seg_text in content_segments if seg_type == "text"
                                )
                                inline_thought_chunk = "".join(
                                    seg_text for seg_type, seg_text in content_segments if seg_type == "thought"
                                )
                                reasoning = raw_reasoning
                                if reasoning and content_chunk and _is_reasoning_duplicate_of_content(
                                    str(reasoning),
                                    str(content_chunk),
                                ):
                                    trace_stream(
                                        "suppress_reasoning_overlap",
                                        event="reasoning_content_delta",
                                        reasoning_preview=_preview(reasoning),
                                        content_preview=_preview(content_chunk),
                                    )
                                    reasoning = ""
                                has_content_chunk = bool(content_chunk)
                                has_inline_thought = bool(inline_thought_chunk)
                                trace_stream(
                                    "reasoning_delta",
                                    has_content=has_content_chunk,
                                    has_reasoning=bool(reasoning) or has_inline_thought,
                                    reasoning_closed=reasoning_closed_for_current_cycle,
                                    content_preview=_preview(content_chunk),
                                    reasoning_preview=_preview((reasoning or "") + (inline_thought_chunk or "")),
                                )

                                has_any_thought = bool(reasoning) or has_inline_thought
                                if has_any_thought and reasoning_closed_for_current_cycle:
                                    reasoning_closed_for_current_cycle = False
                                    in_reasoning_phase = False
                                    should_break_next_thought = True

                                if reasoning:
                                    for event in emit_thought_part(str(reasoning)):
                                        yield event
                                if has_inline_thought:
                                    for event in emit_thought_part(str(inline_thought_chunk)):
                                        yield event

                                if content_chunk:
                                    for e in process_text(content_chunk):
                                        yield e
                                    trace_stream(
                                        "emit_content",
                                        reasoning_closed=reasoning_closed_for_current_cycle,
                                        content_preview=_preview(content_chunk),
                                    )

                            case RunEvent.tool_call_started.value:
                                tool_event: ToolCallStartedEvent = run_event  # type: ignore[assignment]
                                tool = tool_event.tool
                                if tool:
                                    in_reasoning_phase = False
                                    should_break_next_thought = True
                                    reasoning_closed_for_current_cycle = False
                                    in_content_think_block = False
                                    inline_tool_trace_depth = 0
                                    inline_protocol_tail = ""
                                    if tool.tool_call_id:
                                        tool_start_times[tool.tool_call_id] = time.time()
                                    trace_stream(
                                        "tool_call_started",
                                        tool_name=tool.tool_name or "",
                                        tool_call_id=tool.tool_call_id,
                                    )
                                    current_text_index = len(full_content)
                                    yield _build_tool_call_event(tool, current_text_index)

                            case RunEvent.tool_call_completed.value:
                                tool_event: ToolCallCompletedEvent = run_event  # type: ignore[assignment]
                                tool = tool_event.tool
                                if tool:
                                    in_reasoning_phase = False
                                    should_break_next_thought = True
                                    reasoning_closed_for_current_cycle = False
                                    in_content_think_block = False
                                    inline_tool_trace_depth = 0
                                    inline_protocol_tail = ""
                                    duration_ms = None
                                    if tool.tool_call_id and tool.tool_call_id in tool_start_times:
                                        duration_ms = int((time.time() - tool_start_times[tool.tool_call_id]) * 1000)
                                    trace_stream(
                                        "tool_call_completed",
                                        tool_name=tool.tool_name or "",
                                        tool_call_id=tool.tool_call_id,
                                        is_error=bool(tool.tool_call_error),
                                    )
                                    tool_result_event, output = _build_tool_result_event(
                                        tool,
                                        duration_ms,
                                        self._normalize_tool_output,
                                    )
                                    yield tool_result_event
                                    self._collect_search_sources(output, sources_map)

                            case RunEvent.run_completed.value:
                                saw_terminal_completion = True
                                completed_content_fallback, _ = _extract_completed_content_and_output(
                                    run_event,
                                    completed_content_fallback or full_content,
                                )

                            case RunEvent.run_error.value:
                                error_msg = _extract_best_error_message(run_event)
                                stream_had_error = True
                                yield ErrorEvent(error=error_msg).model_dump()
                                return
                    else:
                        # Simple event Fallback
                        raw_content_chunk = _extract_text_chunk(run_event)
                        raw_content_chunk, inline_tool_trace_depth, inline_protocol_tail, _ = _strip_inline_tool_protocol(
                            raw_content_chunk,
                            inline_tool_trace_depth,
                            inline_protocol_tail,
                        )
                        raw_reasoning = _extract_reasoning_chunk(run_event)
                        content_segments, in_content_think_block = _split_content_by_think_tags(
                            raw_content_chunk,
                            in_content_think_block,
                        )
                        content_chunk = "".join(
                            seg_text for seg_type, seg_text in content_segments if seg_type == "text"
                        )
                        inline_thought_chunk = "".join(
                            seg_text for seg_type, seg_text in content_segments if seg_type == "thought"
                        )
                        if raw_reasoning:
                            for event in emit_thought_part(str(raw_reasoning)):
                                yield event
                        if inline_thought_chunk:
                            for event in emit_thought_part(str(inline_thought_chunk)):
                                yield event
                        if content_chunk:
                            for e in process_text(content_chunk):
                                yield e

            def _build_fallback_messages():
                if not saved_messages:
                    return None
                updated_messages = list(saved_messages)
                for req in requirements:
                    tool_exec = getattr(req, 'tool_execution', None)
                    tool_name = getattr(tool_exec, 'tool_name', None) if tool_exec else None
                    if tool_name != "interactive_form":
                        continue
                    tool_args = getattr(tool_exec, 'tool_args', {}) if tool_exec else {}
                    tool_call_id = getattr(req, "id", None) or tool_args.get("id") or f"form-{int(time.time() * 1000)}"
                    updated_messages.append({
                        "role": "assistant",
                        "content": None,
                        "tool_calls": [{
                            "id": tool_call_id,
                            "type": "function",
                            "function": {
                                "name": "interactive_form",
                                "arguments": json.dumps(tool_args or {}),
                            }
                        }],
                    })
                    updated_messages.append({
                        "role": "tool",
                        "content": json.dumps(field_values),
                        "tool_call_id": tool_call_id,
                    })
                return updated_messages

            def _apply_field_values_to_requirements() -> list[Any]:
                """
                Resolve pending HITL requirements with the submitted form payload.

                Prefer Agno-native requirement resolution so we can use acontinue_run().
                """
                resolved_requirements: list[Any] = []
                serialized_values = json.dumps(field_values, ensure_ascii=False)

                for req in requirements or []:
                    try:
                        if hasattr(req, "needs_external_execution") and req.needs_external_execution:
                            req.set_external_execution_result(serialized_values)
                            tool_exec = getattr(req, "tool_execution", None)
                            if tool_exec is not None and getattr(tool_exec, "result", None) is None:
                                tool_exec.result = serialized_values
                        elif hasattr(req, "needs_user_input") and req.needs_user_input:
                            req.provide_user_input(field_values)
                        elif hasattr(req, "needs_confirmation") and req.needs_confirmation:
                            req.confirm()
                    except Exception as req_err:
                        logger.warning(
                            f"[HITL] Failed to resolve requirement {getattr(req, 'id', None)} for run_id={run_id}: {req_err}"
                        )
                    resolved_requirements.append(req)

                return resolved_requirements

            def _build_continuation_agent_input(base_messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
                messages = self._inject_local_time_context(list(base_messages), request, [])
                system_messages = [m for m in messages if m.get("role") == "system"]
                chat_messages = [m for m in messages if m.get("role") != "system"]

                raw_turn_limit = request.context_turn_limit
                turn_limit = (
                    max(1, min(50, int(raw_turn_limit)))
                    if isinstance(raw_turn_limit, int) and raw_turn_limit > 0
                    else 2
                )
                user_indices = [i for i, m in enumerate(chat_messages) if m.get("role") == "user"]
                user_turn_count = len(user_indices)
                if user_turn_count > turn_limit:
                    cutoff_index = user_indices[-turn_limit]
                    recent_history = chat_messages[cutoff_index:]
                else:
                    recent_history = chat_messages

                should_inject_summary = bool(session_summary_text) and (user_turn_count > turn_limit)
                if should_inject_summary:
                    summary_prompt = (
                        "\n\nSession memory summary:\n"
                        "Here is a summary of the conversation so far. Use this to understand long-term context, "
                        "but prioritize the details in the recent messages below.\n"
                        f"{session_summary_text}\n"
                    )
                    if system_messages:
                        last_sys = system_messages[-1]
                        if "Session memory summary:" not in str(last_sys.get("content", "")):
                            last_sys["content"] = str(last_sys.get("content", "")) + summary_prompt
                    else:
                        system_messages.append({"role": "system", "content": summary_prompt})

                return system_messages + recent_history

            resolved_requirements = _apply_field_values_to_requirements()
            stream = None
            try:
                restored_run_output = None
                if isinstance(saved_run_output, dict):
                    try:
                        restored_run_output = RunOutput.from_dict(dict(saved_run_output))
                        # Ensure external-execution tool results are concretely attached to
                        # run_response.tools before acontinue_run() processes updates.
                        if restored_run_output and isinstance(restored_run_output.tools, list):
                            serialized_values = json.dumps(field_values, ensure_ascii=False)
                            tool_result_by_id: dict[str, Any] = {}
                            for req in resolved_requirements or []:
                                tool_exec = getattr(req, "tool_execution", None)
                                if not tool_exec:
                                    continue
                                tcid = getattr(tool_exec, "tool_call_id", None)
                                if tcid:
                                    tool_result_by_id[str(tcid)] = getattr(tool_exec, "result", None)

                            for tool in restored_run_output.tools:
                                if getattr(tool, "result", None) is not None:
                                    continue
                                tcid = getattr(tool, "tool_call_id", None)
                                if tcid and str(tcid) in tool_result_by_id:
                                    tool.result = tool_result_by_id[str(tcid)]
                                    continue
                                if getattr(tool, "tool_name", None) == "interactive_form":
                                    tool.result = serialized_values

                        # OpenAI-compatible tool flow requires an assistant message
                        # with matching tool_calls before any tool message can appear.
                        if restored_run_output and isinstance(restored_run_output.tools, list):
                            existing_messages = (
                                list(restored_run_output.messages)
                                if isinstance(restored_run_output.messages, list)
                                else []
                            )
                            existing_tool_call_ids: set[str] = set()
                            for msg in existing_messages:
                                msg_tool_calls = getattr(msg, "tool_calls", None) or []
                                for tc in msg_tool_calls:
                                    if isinstance(tc, dict) and tc.get("id"):
                                        existing_tool_call_ids.add(str(tc.get("id")))

                            for tool in restored_run_output.tools:
                                tool_call_id = getattr(tool, "tool_call_id", None)
                                tool_name = getattr(tool, "tool_name", None) or "interactive_form"
                                if not tool_call_id or str(tool_call_id) in existing_tool_call_ids:
                                    continue
                                tool_args = getattr(tool, "tool_args", None) or {}
                                existing_messages.append(
                                    Message(
                                        role="assistant",
                                        content="",
                                        tool_calls=[
                                            {
                                                "id": str(tool_call_id),
                                                "type": "function",
                                                "function": {
                                                    "name": str(tool_name),
                                                    "arguments": json.dumps(tool_args, ensure_ascii=False),
                                                },
                                            }
                                        ],
                                    )
                                )
                                existing_tool_call_ids.add(str(tool_call_id))

                            restored_run_output.messages = existing_messages
                            if resolved_requirements:
                                restored_run_output.requirements = resolved_requirements
                    except Exception as restore_err:
                        logger.warning(
                            f"[HITL] Failed to restore RunOutput for run_id={run_id}, fallback to run_id path: {restore_err}"
                        )
                _log_verbose_info(
                    f"[HITL] continuation restore mode: {'run_response' if restored_run_output is not None else 'run_id'} "
                    f"(has_saved_run_output={isinstance(saved_run_output, dict)})"
                )
                _log_verbose_info(
                    f"Running HITL continuation via continue_run (run_id: {run_id}, session_id: {request.conversation_id})"
                )
                if restored_run_output is not None:
                    stream = agent.continue_run(
                        run_response=restored_run_output,
                        stream=True,
                        stream_events=True,
                        yield_run_output=True,
                        user_id=request.user_id,
                        session_id=request.conversation_id,
                        output_schema=request.output_schema,
                    )
                else:
                    stream = agent.continue_run(
                        run_id=run_id,
                        requirements=resolved_requirements,
                        stream=True,
                        stream_events=True,
                        yield_run_output=True,
                        user_id=request.user_id,
                        session_id=request.conversation_id,
                        output_schema=request.output_schema,
                    )
            except Exception as continue_err:
                logger.warning(
                    f"[HITL] continue_run failed for run_id={run_id}, fallback to rebuilt arun: {continue_err}"
                )
                fallback_messages = _build_fallback_messages()
                if not fallback_messages:
                    yield ErrorEvent(error="Form session cannot be resumed (missing state)").model_dump()
                    return
                agent_input = _build_continuation_agent_input(fallback_messages)
                stream = agent.arun(
                    input=agent_input,
                    stream=True,
                    stream_events=True,
                    user_id=request.user_id,
                    session_id=request.conversation_id,
                    output_schema=request.output_schema,
                )

            async for event in _stream_events(stream):
                yield event

            _log_verbose_info(
                "[HITL] continuation stream summary: "
                f"run_id={run_id}, "
                f"events={continuation_event_count}, "
                f"last_event={last_event_name}, "
                f"last_event_type={last_event_type}, "
                f"last_event_run_id={last_event_run_id}, "
                f"saw_terminal_completion={saw_terminal_completion}, "
                f"stream_had_error={stream_had_error}, "
                f"paused_again={paused_again}"
            )

            if stream_had_error:
                logger.warning(f"HITL run {run_id} ended with stream error; skipping done/cleanup")
                return
            if not saw_terminal_completion:
                logger.warning(
                    f"HITL run {run_id} stream ended without terminal completion event; skipping done/cleanup"
                )
                yield ErrorEvent(error="HITL continuation ended before completion").model_dump()
                return

            # Stream completed, send done event
            yield DoneEvent(
                content=full_content or completed_content_fallback,
                thought=full_thought.strip() or None,
                sources=list(sources_map.values()) or None,
            ).model_dump()

            # Clean up Supabase (skip if paused again for multi-form)
            if not paused_again:
                await hitl_storage.delete_pending_run(run_id)
                logger.info(f"HITL run {run_id} completed and cleaned up")
            else:
                logger.info(f"HITL run {run_id} paused again (multi-form), skipping cleanup")

            # 6. Trigger Async Session Summary Update
            if request.conversation_id and not paused_again:
                # For HITL resumption, extract the last turn's context from saved_messages
                # (matching normal flow: only last user + assistant, not full history)
                summary_messages = []

                # Extract only the last user-assistant turn from saved_messages
                if saved_messages:
                    last_user_idx = -1
                    for i in range(len(saved_messages) - 1, -1, -1):
                        if saved_messages[i].get("role") == "user":
                            last_user_idx = i
                            break

                    if last_user_idx >= 0:
                        # Include from last user message to end of saved_messages
                        # This captures: user question -> assistant form(s) -> any intermediate interactions
                        for msg in saved_messages[last_user_idx:]:
                            role = msg.get("role")
                            content = msg.get("content")
                            # Only include user/assistant messages with content for summary
                            if role in ("user", "assistant") and content:
                                summary_messages.append({"role": role, "content": content})

                # Add the form submission as user input (provides structured data context)
                form_submission_text = f"[Form Submitted] Values: {json.dumps(field_values)}"
                summary_messages.append({"role": "user", "content": form_submission_text})

                # Add the new assistant response (based on form data)
                summary_messages.append({"role": "assistant", "content": full_content})

                _log_verbose_info(f"Triggering async summary update for {request.conversation_id} (Resumed HITL flow, {len(summary_messages)} messages)")
                asyncio.create_task(update_session_summary(
                    conversation_id=request.conversation_id,
                    old_summary=old_summary_json,
                    new_messages=summary_messages,
                    database_provider=request.database_provider,
                    memory_provider=request.memory_provider,
                    memory_model=request.memory_model,
                    memory_api_key=request.memory_api_key,
                    memory_base_url=request.memory_base_url,
                    summary_provider=request.summary_provider,
                    summary_model=request.summary_model,
                    summary_api_key=request.summary_api_key,
                    summary_base_url=request.summary_base_url,
                    rebuild_from_scratch=False, # HITL resumption is usually incremental
                ))

        except Exception as exc:
            import traceback
            error_details = traceback.format_exc()
            logger.error(f"HITL continuation error: {exc}\n{error_details}")
            yield ErrorEvent(error=_extract_best_error_message(exc)).model_dump()




    def _collect_enabled_tool_names(self, request: StreamChatRequest) -> set[str]:
        names: list[str] = []
        if request.provider != "gemini":
            for tool_id in request.tool_ids or []:
                names.append(resolve_tool_name(str(tool_id)))
        for tool_def in request.tools or []:
            if hasattr(tool_def, "model_dump"):
                tool_def = tool_def.model_dump()
            if not isinstance(tool_def, dict):
                continue
            name = tool_def.get("function", {}).get("name") or tool_def.get("name")
            if name:
                names.append(resolve_tool_name(str(name)))
        for user_tool in request.user_tools or []:
            if hasattr(user_tool, "name") and user_tool.name:
                names.append(str(user_tool.name))
        return set(names)

    def _inject_local_time_context(
        self,
        messages: list[dict[str, Any]],
        request: StreamChatRequest,
        pre_events: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        if not messages:
            return messages

        timezone = request.user_timezone or "UTC"
        locale = request.user_locale or "en-US"
        time_result = self._compute_local_time(timezone, locale)
        try:
            local_date = datetime.fromisoformat(str(time_result.get("iso"))).strftime("%Y-%m-%d")
        except Exception:
            local_date = str(time_result.get("formatted", "")).split(" ")[0] or datetime.now().strftime(
                "%Y-%m-%d"
            )
        tz_label = str(time_result.get("timezone") or timezone)
        note = (
            f"\n\n[Time note for this query]\n"
            f"Note: local date is {local_date} ({tz_label}). "
            "Interpret relative time terms using this date."
        )

        updated: list[dict[str, Any]] = []
        for msg in messages:
            if not isinstance(msg, dict) or msg.get("role") != "user":
                updated.append(msg)
                continue

            content = msg.get("content")
            if isinstance(content, str):
                if "[Time note for this query]" in content:
                    updated.append(msg)
                else:
                    updated.append({**msg, "content": f"{content}{note}"})
                continue

            if isinstance(content, list):
                has_note = False
                for part in content:
                    if isinstance(part, dict):
                        if "[Time note for this query]" in str(part.get("text", "")) or "[Time note for this query]" in str(part.get("content", "")):
                            has_note = True
                            break

                if has_note:
                    updated.append(msg)
                else:
                    updated.append({**msg, "content": [*content, {"type": "text", "text": note}]})
                continue

            updated.append(msg)

        return updated

    def _compute_local_time(self, timezone: str, locale: str) -> dict[str, Any]:
        try:
            tzinfo = ZoneInfo(timezone)
            now = datetime.now(tzinfo)
        except Exception:
            now = datetime.now()
        return {
            "timezone": timezone,
            "locale": locale,
            "formatted": now.strftime("%Y-%m-%d %H:%M:%S"),
            "iso": now.isoformat(),
            "now": now,
        }

    def _inject_tool_guidance(
        self,
        messages: list[dict[str, Any]],
        enabled_tools: set[str],
        request: Any | None = None,
    ) -> list[dict[str, Any]]:
        if not enabled_tools:
            return messages

        updated = list(messages)
        system_index = next((i for i, m in enumerate(updated) if m.get("role") == "system"), -1)

        no_tool_narration_guidance = (
            "\n\n[OUTPUT DIRECTIVES]\n"
            "1. The main text (Answer) must contain ONLY the final helpful content and necessary explanations for the user.\n"
            "2. In the main text, NEVER describe that you are going to, are currently, or have already called any tools, searched, browsed, retrieved memory, or queried databases. These are internal traces (Trace).\n"
            "3. In the main text, do NOT refer to yourself performing actions (e.g., \"Let me check\", \"I will search\", \"I have retrieved\").\n"
            "   Instead, directly present results as established information.\n"
            "4. If citing sources, use neutral phrasing such as: \"According to available data\", \"Based on public information\", \"According to the returned data\".\n"
            "   Never mention tool names or the calling process.\n"
            "5. If information is insufficient, directly state the missing gap and ask clarifying questions.\n"
            "   Do NOT say \"Let me check again\" or similar transitional action phrases.\n"
            "6. Once you start presenting the final answer, do not switch back to planning, searching, or tool-calling language.\n"
            "7. The final answer should begin naturally with the content itself, without meta commentary or transitional phrases.\n"
        )
        updated = self._append_system_message(updated, no_tool_narration_guidance, system_index)
        system_index = next((i for i, m in enumerate(updated) if m.get("role") == "system"), -1)

        if "interactive_form" in enabled_tools:
            form_guidance = (
                "\n[TOOL USE GUIDANCE]\n"
                "When you need to collect structured information from the user (e.g. preferences, requirements, "
                "booking details), use the 'interactive_form' tool.\n"
                "CRITICAL: DO NOT list questions in text or markdown. YOU MUST USE the 'interactive_form' tool to "
                "display fields.\n"
                "Keep forms concise (3-6 fields).\n\n"
                "[SIMPLIFIED PAYLOAD]\n"
                "You may use a minimal payload to reduce tool-call size.\n"
                "- 'id' and 'title' are optional.\n"
                "- Each field may be minimal (e.g., {'name':'budget'}) or even a short string label.\n"
                "- Backend will auto-fill missing label/type defaults.\n\n"
                "[MANDATORY TEXT-FIRST RULE]\n"
                "CRITICAL: You MUST output meaningful introductory text BEFORE calling 'interactive_form'.\n"
                "- NEVER call 'interactive_form' as the very first thing in your response\n"
                "- ALWAYS explain the context, acknowledge the user's request, or provide guidance BEFORE the form\n"
                "- Minimum: Output at least 1-2 sentences before the form call\n"
                '- Example: "I can help you with that. To provide the best recommendation, please share some '
                'details below:"\n\n'
                "[SINGLE FORM PER RESPONSE]\n"
                "CRITICAL: You may call 'interactive_form' ONLY ONCE per response. Do NOT call it multiple times in "
                "the same answer.\n"
                "If you need to collect information, design ONE comprehensive form that gathers all necessary "
                "details at once.\n\n"
                "[MULTI-TURN INTERACTIONS]\n"
                "1. If the information from a submitted form is insufficient, you MAY present another "
                "'interactive_form' in your NEXT response (after the user submits the first form).\n"
                "2. LIMIT: Use at most 2-3 forms total across the entire conversation. Excessive questioning "
                "frustrates users.\n"
                "3. INTERLEAVING: You can place the form anywhere in your response. Output introductory text FIRST "
                "(e.g., \"I can help with that. Please provide some details below:\"), then call 'interactive_form' "
                "once.\n"
                "4. If the user has provided enough context through previous forms, proceed directly to the final "
                "answer without requesting more information."
            )
            updated = self._append_system_message(updated, form_guidance, system_index)
            system_index = next((i for i, m in enumerate(updated) if m.get("role") == "system"), -1)

        search_tools_requiring_citations = {
            "Tavily_web_search",
            "Tavily_academic_search",
            "web_search_using_tavily",
            "web_search",
            "search_news",
            "search_arxiv_and_return_articles",
            "search_wikipedia",
        }
        if enabled_tools.intersection(search_tools_requiring_citations):
            citation_prompt = (
                "\n\n[IMPORTANT] You have access to search tools. When you use them to answer a question, "
                "you MUST cite the search results in your answer using the format [1], [2], etc., "
                "corresponding to the index of the search result provided in the tool output. Do not fabricate "
                "citations."
            )
            updated = self._append_system_message(updated, citation_prompt, system_index)

        if "local_time" in enabled_tools:
            local_time_guidance = (
                "\n\n[TIME CONTEXT GUIDANCE]\n"
                "A local-date note is already appended to each user query before model execution.\n"
                "Do not call local_time again unless the user explicitly asks to refresh/recheck time."
            )
            updated = self._append_system_message(updated, local_time_guidance, system_index)

        if "memory_update" in enabled_tools:
            memory_guidance = (
                "\n\n[MEMORY UPDATE GUIDANCE]\n"
                "When calling 'memory_update', prioritize existing memory domains first.\n"
                "Optionally call 'memory_retrieve' first to inspect existing domain summaries.\n"
                "1) Reuse an existing domain_key if semantically similar.\n"
                "2) Create a new domain_key only for clearly new topics.\n"
                "3) Prefer operation='upsert' for corrections/overwrites; use 'add' for appending details; "
                "use 'delete' to remove outdated domains.\n"
                "4) Always provide a non-empty summary for operation='add' and operation='upsert'.\n"
                "5) If upserting an existing domain, rewrite summary from old memory and set based_on_existing=true."
            )
            updated = self._append_system_message(updated, memory_guidance, system_index)

        if "memory_retrieve" in enabled_tools:
            prefetched_domains = []
            raw_prefetched = getattr(request, "memory_domains_prefetch", None) if request else None
            if isinstance(raw_prefetched, list):
                for row in raw_prefetched[:80]:
                    if not isinstance(row, dict):
                        continue
                    domain_key = str(row.get("domain_key") or "").strip()
                    if not domain_key:
                        continue
                    aliases = row.get("aliases")
                    if not isinstance(aliases, list):
                        aliases = []
                    cleaned_aliases = [str(item).strip() for item in aliases if str(item).strip()]
                    prefetched_domains.append(
                        {
                            "domain_key": domain_key,
                            "aliases": cleaned_aliases,
                        }
                    )

            available_domains_text = ""
            if prefetched_domains:
                available_domains_text = (
                    "\nAvailable existing domains (prefer these keys first): "
                    f"{json.dumps(prefetched_domains, ensure_ascii=False)}"
                )

            memory_retrieve_guidance = (
                "\n\n[MEMORY RETRIEVE GUIDANCE]\n"
                "Use 'memory_retrieve' only when memory context is needed for the current answer.\n"
                "Use TWO steps:\n"
                "1) Call memory_retrieve(action='list', include_summary=false) to inspect candidate domains.\n"
                "2) Select domain_keys and call memory_retrieve(action='fetch', include_summary=true, domain_keys=[...]).\n"
                "Do not fetch all summaries directly without selecting domains first."
                f"{available_domains_text}"
            )
            updated = self._append_system_message(updated, memory_retrieve_guidance, system_index)

        return updated

    def _append_system_message(
        self,
        messages: list[dict[str, Any]],
        addition: str,
        system_index: int,
    ) -> list[dict[str, Any]]:
        updated = list(messages)
        if system_index != -1:
            updated[system_index] = {
                **updated[system_index],
                "content": f"{updated[system_index].get('content', '')}{addition}",
            }
        else:
            updated.insert(0, {"role": "system", "content": addition})
        return updated

    def _normalize_tool_output(self, output: Any) -> Any:
        if hasattr(output, "model_dump"):
            try:
                return output.model_dump()
            except Exception:
                return str(output)
        if isinstance(output, dict):
            return output
        if isinstance(output, list):
            return [self._normalize_tool_output(item) for item in output]
        return output

    def _collect_search_sources(self, result: Any, sources_map: dict[str, Any]) -> None:
        def _extract_results(payload: Any) -> list[dict[str, Any]]:
            if isinstance(payload, list):
                return [item for item in payload if isinstance(item, dict)]
            if isinstance(payload, dict):
                for key in ("results", "items", "data", "sources", "articles", "news", "papers"):
                    value = payload.get(key)
                    if isinstance(value, list):
                        return [item for item in value if isinstance(item, dict)]
            return []

        results = _extract_results(result)
        if not results:
            return

        for item in results:
            url = (
                item.get("url")
                or item.get("link")
                or item.get("uri")
                or item.get("source")
                or item.get("href")
            )
            if not url or url in sources_map:
                continue
            title = (
                item.get("title")
                or item.get("name")
                or item.get("headline")
                or item.get("paper_title")
                or "Unknown Source"
            )
            snippet = (
                item.get("content")
                or item.get("snippet")
                or item.get("summary")
                or item.get("abstract")
                or ""
            )
            sources_map[url] = SourceEvent(
                uri=url,
                title=title,
                snippet=str(snippet)[:200],
            ).model_dump()

    async def _maybe_optimize_memories(self, agent: Agent, request: StreamChatRequest) -> None:
        return

    def _map_field_type_to_frontend(self, field_type: Any) -> str:
        """
        Map Python/Agno field types to frontend form types.
        
        Args:
            field_type: Python type (class or string)
            
        Returns:
            Frontend form field type (text, number, checkbox, etc.)
        """
        # Handle cases where field_type is a class/type instead of a string
        field_type_str = ""
        if isinstance(field_type, type):
            field_type_str = field_type.__name__
        elif not isinstance(field_type, str):
            field_type_str = str(field_type)
        else:
            field_type_str = field_type

        type_mapping = {
            "str": "text",
            "int": "number",
            "float": "number",
            "bool": "checkbox",
            "date": "date",
            "time": "time",
            "datetime": "datetime",
            "list": "text",
            "dict": "textarea",
        }
        return type_mapping.get(field_type_str.lower(), "text")


_stream_chat_service: StreamChatService | None = None

def get_stream_chat_service() -> StreamChatService:
    global _stream_chat_service
    if _stream_chat_service is None:
        _stream_chat_service = StreamChatService()
    return _stream_chat_service
