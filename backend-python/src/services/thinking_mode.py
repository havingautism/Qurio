"""
Thinking mode routing service.
"""

from __future__ import annotations

import json

from agno.agent import Agent

from .agent_registry import _build_model

THINKING_MODE_PROMPT = """You are a thinking-mode router for a chat assistant.

Return STRICT JSON only.
Schema: {"thinking_mode":"deep|fast"}

Rules:
- Choose "deep" only if the user's question clearly needs multi-step reasoning, planning, or decomposition.
- Choose "fast" for definition questions, simple explanations, and straightforward factual answers.
- Do not include any keys other than thinking_mode.
"""


def _normalize_thinking_mode(value: str | None) -> str:
    text = str(value or "").strip().lower()
    return "deep" if text == "deep" else "fast"


def _parse_thinking_mode(raw: str) -> str:
    text = str(raw or "").strip()
    if not text:
        return "fast"

    try:
      parsed = json.loads(text)
      if isinstance(parsed, dict):
          return _normalize_thinking_mode(parsed.get("thinking_mode"))
    except Exception:
        pass

    fenced = text.replace("```json", "").replace("```", "").strip()
    try:
        parsed = json.loads(fenced)
        if isinstance(parsed, dict):
            return _normalize_thinking_mode(parsed.get("thinking_mode"))
    except Exception:
        pass

    lowered = text.lower()
    if '"thinking_mode"' in lowered and "deep" in lowered:
        return "deep"
    return "fast"


async def choose_thinking_mode(
    *,
    provider: str,
    user_message: str,
    api_key: str,
    base_url: str | None = None,
    model: str | None = None,
) -> str:
    routing_model = _build_model(provider, api_key, base_url, model)
    router = Agent(
        model=routing_model,
        description="You decide whether a user question needs deep or fast thinking.",
        instructions=THINKING_MODE_PROMPT,
    )
    response = await router.arun(f"User question:\n{user_message}")
    content = response.content if hasattr(response, "content") else str(response)
    return _parse_thinking_mode(content)
