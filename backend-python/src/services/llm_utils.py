"""
Shared helpers for non-streaming LLM calls and JSON parsing.
"""

from __future__ import annotations

import ast
import json
from typing import Any

from ..providers import ExecutionContext, get_provider_adapter
from ..models.stream_chat import StreamChatRequest
from ..services.stream_chat import get_stream_chat_service


def normalize_text_content(content: Any) -> str:
    """Normalize mixed content into a plain string."""
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                if "text" in item:
                    parts.append(str(item.get("text", "")))
                elif item.get("type") == "text":
                    parts.append(str(item.get("text", "")))
        return " ".join([p for p in parts if p]).strip()
    if isinstance(content, dict):
        try:
            return json.dumps(content, ensure_ascii=True)
        except Exception:
            return str(content)
    return str(content)


def safe_json_parse(text: str | None) -> Any | None:
    """Best-effort JSON parse with cleanup fallback."""
    if not text or not isinstance(text, str):
        return None
    stripped = text.strip()
    if not stripped:
        return None
    try:
        return json.loads(stripped)
    except Exception:
        pass

    # Fallback: extract first JSON object/array substring
    try:
        obj_start = stripped.find("{")
        obj_end = stripped.rfind("}")
        if obj_start != -1 and obj_end != -1 and obj_end > obj_start:
            return json.loads(stripped[obj_start : obj_end + 1])
    except Exception:
        pass

    try:
        arr_start = stripped.find("[")
        arr_end = stripped.rfind("]")
        if arr_start != -1 and arr_end != -1 and arr_end > arr_start:
            return json.loads(stripped[arr_start : arr_end + 1])
    except Exception:
        pass

    # Final fallback: attempt Python literal (handles single quotes)
    try:
        if stripped.startswith("{") or stripped.startswith("["):
            value = ast.literal_eval(stripped)
            if isinstance(value, (dict, list)):
                return value
    except Exception:
        pass

    return None


async def run_chat_completion(
    *,
    provider: str,
    api_key: str,
    messages: list[dict[str, Any]],
    base_url: str | None = None,
    model: str | None = None,
    response_format: dict[str, Any] | None = None,
    thinking: dict[str, Any] | bool | None = None,
    temperature: float | None = None,
    top_k: int | None = None,
    top_p: float | None = None,
    frequency_penalty: float | None = None,
    presence_penalty: float | None = None,
    context_message_limit: int | None = None,
    tools: list[dict[str, Any]] | None = None,
    tool_choice: Any = None,
) -> dict[str, str]:
    """Run a streaming LLM call and return full content/thought."""
    adapter = get_provider_adapter(provider)
    trimmed = adapter.apply_context_limit(messages, context_message_limit)

    context = ExecutionContext(
        messages=trimmed,
        tools=tools,
        tool_choice=tool_choice,
        temperature=temperature,
        top_p=top_p,
        top_k=top_k,
        frequency_penalty=frequency_penalty,
        presence_penalty=presence_penalty,
        response_format=response_format,
        thinking=thinking,
        stream=True,
    )

    full_text = ""
    full_thought = ""

    async for chunk in adapter.execute(
        context=context,
        api_key=api_key,
        model=model,
        base_url=base_url,
    ):
        if chunk.type == "text":
            full_text += chunk.content or ""
        elif chunk.type == "thought":
            full_thought += chunk.thought or ""
        elif chunk.type == "error":
            raise ValueError(chunk.error or "Unknown error")
        elif chunk.type == "done":
            break

    return {"content": full_text, "thought": full_thought}


async def run_agent_completion(request: StreamChatRequest) -> dict[str, Any]:
    """Run the Agno Agent via stream_chat service and return final content/thought/sources."""
    service = get_stream_chat_service()
    full_text = ""
    full_thought = ""
    sources: list[dict[str, Any]] = []

    async for event in service.stream_chat(request):
        event_type = event.get("type")
        if event_type == "text":
            full_text += event.get("content", "")
        elif event_type == "thought":
            full_thought += event.get("content", "")
        elif event_type == "done":
            sources = event.get("sources") or []
        elif event_type == "error":
            raise ValueError(event.get("error") or "Unknown error")

    return {
        "content": full_text,
        "thought": full_thought,
        "sources": sources,
    }
