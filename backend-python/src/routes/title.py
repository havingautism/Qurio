"""
Title generation API routes.
"""

from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from starlette.responses import Response

from ..providers import is_provider_supported
from ..services.generation import generate_title
from ..utils.json_stream import create_streaming_json_response

router = APIRouter(tags=["title"])


@router.post("/title")
async def title(request: Request) -> Response:
    body = await request.json()
    provider = body.get("provider")
    message = body.get("message")
    api_key = body.get("apiKey")
    base_url = body.get("baseUrl")
    model = body.get("model")
    user_timezone = body.get("userTimezone")
    user_locale = body.get("userLocale")

    if not provider or not message:
        return JSONResponse(
            status_code=400,
            content={"error": "Missing required fields: provider, message"},
        )
    if not is_provider_supported(provider):
        return JSONResponse(status_code=400, content={"error": f"Unsupported provider: {provider}"})

    return create_streaming_json_response(
        _build_title_result(
            provider=provider,
            message=message,
            api_key=api_key,
            base_url=base_url,
            model=model,
            user_timezone=user_timezone,
            user_locale=user_locale,
        )
    )


async def _build_title_result(
    *,
    provider: str,
    message: str,
    api_key: str,
    base_url: str | None,
    model: str | None,
    user_timezone: str | None,
    user_locale: str | None,
) -> dict[str, object]:
    result = await generate_title(
        provider=provider,
        first_message=message,
        api_key=api_key,
        base_url=base_url,
        model=model,
        user_timezone=user_timezone,
        user_locale=user_locale,
    )
    return {
        "title": result.get("title") or "New Conversation",
        "emojis": result.get("emojis") or [],
    }

