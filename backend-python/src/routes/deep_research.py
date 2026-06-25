"""
Deep research streaming API routes.
"""

from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncGenerator

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from sse_starlette.sse import EventSourceResponse
from starlette.responses import Response

from ..providers import is_provider_supported
from ..services.deep_research import stream_deep_research
from ._request_secrets import apply_stream_secret_headers, get_llm_api_key

router = APIRouter(tags=["deep-research"])


@router.post("/stream-deep-research", response_model=None)
async def deep_research_stream(request: Request) -> Response:
    body = apply_stream_secret_headers(request, await request.json())
    provider = body.get("provider")
    api_key = get_llm_api_key(request)
    messages = body.get("messages")

    if not provider:
        return JSONResponse(status_code=400, content={"error": "Missing required field: provider"})
    if not api_key:
        return JSONResponse(status_code=400, content={"error": "Missing required header: x-llm-api-key"})
    if not messages or not isinstance(messages, list):
        return JSONResponse(status_code=400, content={"error": "Missing required field: messages"})
    if not is_provider_supported(provider):
        return JSONResponse(status_code=400, content={"error": f"Unsupported provider: {provider}"})

    async def event_generator() -> AsyncGenerator[dict[str, str], None]:
        try:
            async for event in stream_deep_research(body):
                if await request.is_disconnected():
                    break
                yield {"data": json.dumps(event, ensure_ascii=False)}
        except asyncio.CancelledError:
            return
        except Exception as exc:
            yield {"data": json.dumps({"type": "error", "error": str(exc)}, ensure_ascii=False)}

    return EventSourceResponse(event_generator(), media_type="text/event-stream")
