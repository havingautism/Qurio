"""
Agent for auto mode API routes.
"""

from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from ..providers import is_provider_supported
from ..services.generation import generate_agent_for_auto


router = APIRouter(tags=["agent-for-auto"])


@router.post("/agent-for-auto")
async def agent_for_auto(request: Request) -> JSONResponse:
    body = await request.json()
    provider = body.get("provider")
    message = body.get("message")
    current_space = body.get("currentSpace")
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

    agent_name = await generate_agent_for_auto(
        provider=provider,
        user_message=message,
        current_space=current_space,
        api_key=api_key,
        base_url=base_url,
        model=model,
    )
    return JSONResponse(content={"agentName": agent_name})

