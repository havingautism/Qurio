"""
Title generation API routes.
"""

from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from ..providers import is_provider_supported
from ..services.generation import generate_title


router = APIRouter(tags=["title"])


@router.post("/title")
async def title(request: Request) -> JSONResponse:
    body = await request.json()
    provider = body.get("provider")
    message = body.get("message")
    api_key = body.get("apiKey")
    base_url = body.get("baseUrl")
    model = body.get("model")

    if not provider or not message:
        return JSONResponse(
            status_code=400,
            content={"error": "Missing required fields: provider, message"},
        )
    if not is_provider_supported(provider):
        return JSONResponse(status_code=400, content={"error": f"Unsupported provider: {provider}"})

    result = await generate_title(
        provider=provider,
        first_message=message,
        api_key=api_key,
        base_url=base_url,
        model=model,
    )
    return JSONResponse(
        content={
            "title": result.get("title") or "New Conversation",
            "emojis": result.get("emojis") or [],
        }
    )

