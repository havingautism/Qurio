"""
Research plan API routes.
"""

from __future__ import annotations

import json
from typing import AsyncGenerator
import asyncio

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from sse_starlette.sse import EventSourceResponse

from ..providers import is_provider_supported
from ..services.research_plan import (
    generate_academic_research_plan,
    generate_research_plan,
    stream_generate_academic_research_plan,
    stream_generate_research_plan,
)


router = APIRouter(tags=["research-plan"])


@router.post("/research-plan")
async def research_plan(request: Request) -> JSONResponse:
    body = await request.json()
    provider = body.get("provider")
    message = body.get("message")
    api_key = body.get("apiKey")
    base_url = body.get("baseUrl")
    model = body.get("model")
    research_type = body.get("researchType") or "general"

    if not provider:
        return JSONResponse(status_code=400, content={"error": "Missing required field: provider"})
    if not message:
        return JSONResponse(status_code=400, content={"error": "Missing required field: message"})
    if not api_key:
        return JSONResponse(status_code=400, content={"error": "Missing required field: apiKey"})
    if not is_provider_supported(provider):
        return JSONResponse(status_code=400, content={"error": f"Unsupported provider: {provider}"})

    if research_type == "academic":
        plan = await generate_academic_research_plan(
            provider=provider,
            user_message=message,
            api_key=api_key,
            base_url=base_url,
            model=model,
        )
    else:
        plan = await generate_research_plan(
            provider=provider,
            user_message=message,
            api_key=api_key,
            base_url=base_url,
            model=model,
        )
    return JSONResponse(content={"plan": plan})


@router.post("/research-plan-stream")
async def research_plan_stream(request: Request) -> EventSourceResponse:
    body = await request.json()
    provider = body.get("provider")
    message = body.get("message")
    api_key = body.get("apiKey")
    base_url = body.get("baseUrl")
    model = body.get("model")
    thinking = body.get("thinking")
    temperature = body.get("temperature")
    top_k = body.get("top_k")
    top_p = body.get("top_p")
    frequency_penalty = body.get("frequency_penalty")
    presence_penalty = body.get("presence_penalty")
    research_type = body.get("researchType") or "general"

    if not provider or not message:
        return EventSourceResponse(
            _error_stream("Missing required fields: provider, message"),
            media_type="text/event-stream",
        )
    if not api_key:
        return EventSourceResponse(
            _error_stream("Missing required field: apiKey"),
            media_type="text/event-stream",
        )
    if not is_provider_supported(provider):
        return EventSourceResponse(
            _error_stream(f"Unsupported provider: {provider}"),
            media_type="text/event-stream",
        )

    async def event_generator() -> AsyncGenerator[dict[str, str], None]:
        try:
            # Choose the appropriate streaming function based on research type
            if research_type == "academic":
                stream_func = stream_generate_academic_research_plan(
                    provider=provider,
                    user_message=message,
                    api_key=api_key,
                    base_url=base_url,
                    model=model,
                    temperature=temperature,
                    top_p=top_p,
                    top_k=top_k,
                    frequency_penalty=frequency_penalty,
                    presence_penalty=presence_penalty,
                    thinking=thinking,
                )
            else:
                stream_func = stream_generate_research_plan(
                    provider=provider,
                    user_message=message,
                    api_key=api_key,
                    base_url=base_url,
                    model=model,
                    temperature=temperature,
                    top_p=top_p,
                    top_k=top_k,
                    frequency_penalty=frequency_penalty,
                    presence_penalty=presence_penalty,
                    thinking=thinking,
                )

            async for event in stream_func:
                if await request.is_disconnected():
                    break
                yield {"data": json.dumps(event, ensure_ascii=False)}
        except asyncio.CancelledError:
            return

    return EventSourceResponse(event_generator(), media_type="text/event-stream")


async def _error_stream(message: str) -> AsyncGenerator[dict[str, str], None]:
    yield {"data": json.dumps({"type": "error", "error": message}, ensure_ascii=False)}
