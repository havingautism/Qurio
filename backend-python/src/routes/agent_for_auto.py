"""
Agent for auto mode API routes.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from starlette.responses import Response

from ..providers import is_provider_supported
from ..services.generation import generate_agent_for_auto
from ..utils.json_stream import create_streaming_json_response

router = APIRouter(tags=["agent-for-auto"])
logger = logging.getLogger(__name__)


@router.post("/agent-for-auto")
async def agent_for_auto(request: Request) -> Response:
    body = await request.json()
    provider = body.get("provider")
    message = body.get("message")
    current_space = body.get("currentSpace")
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

    # Auto agent preselection is best-effort and must not break user chat flow.
    # On provider auth/config errors, gracefully return null and let frontend fallback.
    return create_streaming_json_response(
        _build_agent_for_auto_result(
            provider=provider,
            message=message,
            current_space=current_space,
            api_key=api_key,
            base_url=base_url,
            model=model,
            user_timezone=user_timezone,
            user_locale=user_locale,
        )
    )


async def _build_agent_for_auto_result(
    *,
    provider: str,
    message: str,
    current_space: dict | None,
    api_key: str,
    base_url: str | None,
    model: str | None,
    user_timezone: str | None,
    user_locale: str | None,
) -> dict[str, str | None]:
    try:
        agent_name = await generate_agent_for_auto(
            provider=provider,
            user_message=message,
            current_space=current_space,
            api_key=api_key,
            base_url=base_url,
            model=model,
            user_timezone=user_timezone,
            user_locale=user_locale,
        )
        return {"agentName": agent_name}
    except Exception as exc:  # noqa: BLE001
        logger.warning("agent-for-auto failed, fallback to null agent: %s", exc)
        return {"agentName": None}

