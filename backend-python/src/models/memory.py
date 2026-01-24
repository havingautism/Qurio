"""
Schemas for memory related API endpoints.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class MemoryOptimizeRequest(BaseModel):
    """Request body for triggering memory optimization."""

    user_id: str = Field(..., alias="userId")
    strategy: str | None = Field(default=None)
    apply: bool = Field(default=True)
    memory_provider: str | None = Field(default=None, alias="memoryProvider")
    memory_model: str | None = Field(default=None, alias="memoryModel")
    memory_base_url: str | None = Field(default=None, alias="memoryBaseUrl")
    memory_api_key: str | None = Field(default=None, alias="memoryApiKey")

    class Config:
        allow_population_by_field_name = True
