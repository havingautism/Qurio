"""
Memory helper utilities for Qurio backend.

Provides helpers for running AGNO memory optimizations and managing the
default lite agent used when memory calls must stay lightweight.
"""

from __future__ import annotations

from typing import Any

from agno.memory.strategies.types import MemoryOptimizationStrategyType
from agno.utils.log import logger

from .agent_registry import build_memory_agent


def _resolve_strategy(value: str | None) -> MemoryOptimizationStrategyType:
    if not value:
        return MemoryOptimizationStrategyType.SUMMARIZE
    normalized = value.upper()
    if normalized in MemoryOptimizationStrategyType.__members__:
        return MemoryOptimizationStrategyType[normalized]
    for member in MemoryOptimizationStrategyType:
        if member.name.lower() == normalized.lower() or member.value.lower() == normalized.lower():
            return member
    return MemoryOptimizationStrategyType.SUMMARIZE


def optimize_user_memories(
    user_id: str,
    strategy: str | None = None,
    apply: bool = True,
    provider: str | None = None,
    model: str | None = None,
    base_url: str | None = None,
    api_key: str | None = None,
) -> dict[str, Any]:
    if not user_id:
        logger.warning("Memory optimization skipped: missing user_id.")
        return {"success": False, "message": "user_id is required"}

    logger.info(
        "Optimize memories request: user=%s strategy=%s provider=%s model=%s",
        user_id,
        strategy or "SUMMARIZE",
        provider,
        model,
    )
    agent = build_memory_agent(
        user_id=user_id,
        provider=provider,
        model=model,
        base_url=base_url,
        api_key=api_key,
    )
    memory_manager = getattr(agent, "memory_manager", None)
    if not memory_manager:
        logger.warning("Memory optimization skipped: memory manager unavailable.")
        return {"success": False, "message": "memory manager unavailable"}

    resolved_strategy = _resolve_strategy(strategy)
    try:
        optimized = memory_manager.optimize_memories(
            user_id=user_id,
            strategy=resolved_strategy,
            apply=apply,
        )
        logger.info(
            "Memory optimization completed for user=%s strategy=%s apply=%s (%s entries)",
            user_id,
            resolved_strategy.name,
            apply,
            len(optimized or []),
        )
        return {"success": True, "strategy": resolved_strategy.name, "result": optimized}
    except Exception as exc:
        logger.error("Memory optimization failed: %s", exc)
        return {"success": False, "message": str(exc)}
