"""
Related questions API routes.
"""

from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from starlette.responses import Response

from ..providers import is_provider_supported
from ._request_secrets import get_llm_api_key
from ..services.generation import generate_related_questions
from ..utils.json_stream import create_streaming_json_response

router = APIRouter(tags=["related-questions"])


@router.post("/related-questions")
async def related_questions(request: Request) -> Response:
    body = await request.json()
    provider = body.get("provider")
    messages = body.get("messages") or []
    api_key = get_llm_api_key(request)
    base_url = body.get("baseUrl")
    model = body.get("model")
    language_instruction = body.get("languageInstruction")
    user_timezone = body.get("userTimezone")
    user_locale = body.get("userLocale")

    if not provider:
        return JSONResponse(status_code=400, content={"error": "Missing required field: provider"})
    if not is_provider_supported(provider):
        return JSONResponse(status_code=400, content={"error": f"Unsupported provider: {provider}"})

    return create_streaming_json_response(
        _build_related_questions_result(
            provider=provider,
            messages=messages,
            api_key=api_key,
            base_url=base_url,
            model=model,
            language_instruction=language_instruction,
            user_timezone=user_timezone,
            user_locale=user_locale,
        )
    )


async def _build_related_questions_result(
    *,
    provider: str,
    messages: list[dict],
    api_key: str,
    base_url: str | None,
    model: str | None,
    language_instruction: str | None,
    user_timezone: str | None,
    user_locale: str | None,
) -> dict[str, list[str]]:
    questions = await generate_related_questions(
        provider=provider,
        messages=messages,
        api_key=api_key,
        base_url=base_url,
        model=model,
        language_instruction=language_instruction,
        user_timezone=user_timezone,
        user_locale=user_locale,
    )
    return {"questions": questions}

