"""
Thinking parameter mapping for popular model families.

This module centralizes provider/model-specific thinking payload rules so
adapter classes stay thin and future maintenance only touches one place.
"""

from typing import Any


def normalize_thinking_mode(
    thinking: dict[str, Any] | bool | None,
) -> tuple[str | None, int | None]:
    """
    Normalize thinking input into (mode, budget).

    mode:
      - "enabled"
      - "disabled"
      - None (unspecified)
    """
    if isinstance(thinking, bool):
        return ("enabled" if thinking else "disabled"), None

    if isinstance(thinking, dict):
        raw_mode = str(thinking.get("type", "enabled")).strip().lower()
        mode = raw_mode if raw_mode in {"enabled", "disabled"} else "enabled"

        raw_budget = (
            thinking.get("budget_tokens")
            or thinking.get("budgetTokens")
            or thinking.get("thinking_budget")
        )
        budget: int | None = None
        if raw_budget is not None:
            try:
                budget = int(raw_budget)
            except (TypeError, ValueError):
                budget = None
        return mode, budget

    return None, None


def _model_contains_any(model_id: str, needles: tuple[str, ...]) -> bool:
    model = model_id.lower()
    return any(needle in model for needle in needles)


def is_siliconflow_enable_thinking_model(model_id: str) -> bool:
    """
    Popular SiliconFlow families using enable_thinking/thinking_budget.
    """
    return _model_contains_any(
        model_id,
        (
            "qwen/qwen3",
            "hunyuan-a13b",
            "glm-4.5",
            "glm-4.6",
            "glm-4.7",
            "glm-5",
            "deepseek-v3.1",
            "deepseek-v3.2",
            "ring-1t",
        ),
    )


def is_kimi_reasoning_model(model_id: str) -> bool:
    """
    Popular Kimi reasoning-capable model families.
    """
    return _model_contains_any(
        model_id,
        (
            "kimi-k2",
            "kimi-k2.5",
            "kimi-k1.5",
            "kimi-thinking",
            "thinking-preview",
        ),
    )

