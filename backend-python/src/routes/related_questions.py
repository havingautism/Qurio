"""
Related questions API routes.
"""

from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from ..providers import is_provider_supported
from ..services.generation import generate_related_questions


router = APIRouter(tags=["related-questions"])


@router.post("/related-questions")
async def related_questions(request: Request) -> JSONResponse:
    body = await request.json()
    provider = body.get("provider")
    messages = body.get("messages") or []
    api_key = body.get("apiKey")
    base_url = body.get("baseUrl")
    model = body.get("model")

    if not provider:
        return JSONResponse(status_code=400, content={"error": "Missing required field: provider"})
    if not is_provider_supported(provider):
        return JSONResponse(status_code=400, content={"error": f"Unsupported provider: {provider}"})

    questions = await generate_related_questions(
        provider=provider,
        messages=messages,
        api_key=api_key,
        base_url=base_url,
        model=model,
    )
    return JSONResponse(content={"questions": questions})

