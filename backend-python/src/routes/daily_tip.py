"""
Daily tip API routes.
"""

from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from ..services.generation import generate_daily_tip
from ..providers import is_provider_supported


router = APIRouter(tags=["daily-tip"])


@router.post("/daily-tip")
async def daily_tip(request: Request) -> JSONResponse:
    body = await request.json()
    provider = body.get("provider")
    api_key = body.get("apiKey")
    base_url = body.get("baseUrl")
    model = body.get("model")
    language = body.get("language")
    category = body.get("category")

    if not provider:
        return JSONResponse(status_code=400, content={"error": "Missing required field: provider"})
    if not is_provider_supported(provider):
        return JSONResponse(
            status_code=400,
            content={"error": f"Unsupported provider: {provider}"},
        )

    tip = await generate_daily_tip(
        provider=provider,
        language=language,
        category=category,
        api_key=api_key,
        base_url=base_url,
        model=model,
    )
    return JSONResponse(content={"tip": tip})

