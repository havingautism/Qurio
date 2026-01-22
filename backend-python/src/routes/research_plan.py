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
    build_academic_research_plan_messages,
    build_research_plan_messages,
    generate_academic_research_plan,
    generate_research_plan,
)
from ..services.stream_chat import get_stream_chat_service
from ..models.stream_chat import StreamChatRequest


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
    response_format = body.get("responseFormat")
    thinking = body.get("thinking")
    temperature = body.get("temperature")
    top_k = body.get("top_k")
    top_p = body.get("top_p")
    frequency_penalty = body.get("frequency_penalty")
    presence_penalty = body.get("presence_penalty")
    context_message_limit = body.get("contextMessageLimit")
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

    resolved_response_format = response_format or (
        {"type": "json_object"} if provider != "gemini" else None
    )
    resolved_thinking = thinking
    if resolved_thinking is None and provider in ("glm", "modelscope"):
        resolved_thinking = {"type": "disabled"}

    prompt_builder = (
        build_academic_research_plan_messages
        if research_type == "academic"
        else build_research_plan_messages
    )
    prompt_messages = prompt_builder(message)

    async def event_generator() -> AsyncGenerator[dict[str, str], None]:
        try:
            service = get_stream_chat_service()
            stream_request = StreamChatRequest(
                provider=provider,
                apiKey=api_key,
                baseUrl=base_url,
                model=model,
                messages=prompt_messages,
                responseFormat=resolved_response_format,
                thinking=resolved_thinking,
                temperature=temperature,
                top_k=top_k,
                top_p=top_p,
                frequency_penalty=frequency_penalty,
                presence_penalty=presence_penalty,
                contextMessageLimit=context_message_limit,
                stream=True,
            )
            async for event in service.stream_chat(stream_request):
                if await request.is_disconnected():
                    break
                yield {"data": json.dumps(event, ensure_ascii=False)}
        except asyncio.CancelledError:
            return

    return EventSourceResponse(event_generator(), media_type="text/event-stream")


async def _error_stream(message: str) -> AsyncGenerator[dict[str, str], None]:
    yield {"data": json.dumps({"type": "error", "error": message}, ensure_ascii=False)}
