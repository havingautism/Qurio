"""
Turn summary API routes.
"""

from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from starlette.responses import Response

from ..providers import is_provider_supported
from ..services.generation import generate_turn_summary
from ._request_secrets import get_llm_api_key

router = APIRouter(tags=["turn-summary"])


@router.post("/turn-summary")
async def turn_summary(request: Request) -> Response:
    body = await request.json()
    provider = body.get("provider")
    question = body.get("question") or ""
    answer = body.get("answer") or ""
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
    if not isinstance(answer, str) or not answer.strip():
        return JSONResponse(status_code=400, content={"error": "Missing required field: answer"})

    summary = await generate_turn_summary(
        provider=provider,
        question=question,
        answer=answer,
        api_key=api_key,
        base_url=base_url,
        model=model,
        language_instruction=language_instruction,
        user_timezone=user_timezone,
        user_locale=user_locale,
    )
    return JSONResponse(content={"summary": summary})
