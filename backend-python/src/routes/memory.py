"""
Memory management routes.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ..models.memory import MemoryOptimizeRequest
from ..services.memory_service import optimize_user_memories

router = APIRouter(tags=["memory"])


@router.post("/memory/optimize")
async def optimize_memory(request: MemoryOptimizeRequest):
    """Optimize a user's memories using AGNO optimization strategies."""
    result = optimize_user_memories(
        user_id=request.user_id,
        strategy=request.strategy,
        apply=request.apply,
        provider=request.memory_provider,
        model=request.memory_model,
        base_url=request.memory_base_url,
        api_key=request.memory_api_key,
    )
    if not result.get("success"):
        raise HTTPException(status_code=500, detail=result.get("message") or "Memory optimization failed")
    return result
