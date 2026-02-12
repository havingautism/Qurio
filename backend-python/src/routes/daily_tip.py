"""
Daily tip API routes.
"""

from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from starlette.responses import Response

from ..providers import is_provider_supported
from ..services.generation import generate_daily_tip
from ..utils.json_stream import create_streaming_json_response

router = APIRouter(tags=["daily-tip"])


@router.post("/daily-tip")
async def daily_tip(request: Request) -> Response:
    body = await request.json()
    provider = body.get("provider")
    api_key = body.get("apiKey")
    base_url = body.get("baseUrl")
    model = body.get("model")
    language = body.get("language")
    category = body.get("category")
    user_timezone = body.get("userTimezone")
    user_locale = body.get("userLocale")

    if not provider:
        return JSONResponse(status_code=400, content={"error": "Missing required field: provider"})
    if not is_provider_supported(provider):
        return JSONResponse(
            status_code=400,
            content={"error": f"Unsupported provider: {provider}"},
        )

    return create_streaming_json_response(
        _build_daily_tip_result(
            provider=provider,
            language=language,
            category=category,
            api_key=api_key,
            base_url=base_url,
            model=model,
            user_timezone=user_timezone,
            user_locale=user_locale,
        )
    )


async def _build_daily_tip_result(
    *,
    provider: str,
    language: str | None,
    category: str | None,
    api_key: str,
    base_url: str | None,
    model: str | None,
    user_timezone: str | None,
    user_locale: str | None,
) -> dict[str, str]:
    tip = await generate_daily_tip(
        provider=provider,
        language=language,
        category=category,
        api_key=api_key,
        base_url=base_url,
        model=model,
        user_timezone=user_timezone,
        user_locale=user_locale,
    )
    return {"tip": tip}
