"""
Thinking mode routing API routes.
"""

from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from ..providers import is_provider_supported
from ..services.thinking_mode import choose_thinking_mode
from ._request_secrets import get_llm_api_key

router = APIRouter(tags=["thinking-mode"])


@router.post("/thinking-mode")
async def thinking_mode(request: Request) -> JSONResponse:
    body = await request.json()
    provider = body.get("provider")
    message = body.get("message")
    api_key = get_llm_api_key(request)
    base_url = body.get("baseUrl")
    model = body.get("model")

    if not provider:
        return JSONResponse(status_code=400, content={"error": "Missing required field: provider"})
    if not message:
        return JSONResponse(status_code=400, content={"error": "Missing required field: message"})
    if not api_key:
        return JSONResponse(status_code=400, content={"error": "Missing required header: x-llm-api-key"})
    if not is_provider_supported(provider):
        return JSONResponse(status_code=400, content={"error": f"Unsupported provider: {provider}"})

    mode = await choose_thinking_mode(
        provider=provider,
        user_message=message,
        api_key=api_key,
        base_url=base_url,
        model=model,
    )
    return JSONResponse(content={"thinking_mode": mode})
