"""
Stream chat API routes.
FastAPI endpoints for streaming chat completion.
"""

import json
from typing import AsyncGenerator
import asyncio

from fastapi import APIRouter, Request, Response
from fastapi.responses import StreamingResponse
from sse_starlette.sse import EventSourceResponse

from ..models.stream_chat import StreamChatRequest
from ..services.stream_chat import get_stream_chat_service
from ..services.tools import list_tools  # Imported list_tools
from ..utils.sse import get_sse_config

router = APIRouter(tags=["stream-chat"])


@router.post("/stream-chat")
async def stream_chat(request: Request) -> Response:
    """
    Stream chat completion with support for multiple AI providers.

    Request body:
    {
        "provider": "gemini" | "openai" | "openai_compatibility" | "siliconflow" | "glm" | "modelscope" | "kimi" | "nvidia" | "minimax",
        "apiKey": "API key for the provider",
        "baseUrl": "Custom base URL (optional)",
        "model": "model-name" (optional),
        "messages": [...],
        "tools": [...] (optional),
        "toolChoice": ... (optional),
        "responseFormat": {...} (optional),
        "thinking": {...} (optional),
        "temperature": 0.7 (optional),
        "top_k": 40 (optional),
        "top_p": 0.9 (optional),
        "frequency_penalty": 0 (optional),
        "presence_penalty": 0 (optional),
        "contextMessageLimit": 10 (optional),
        "toolIds": ["calculator", "local_time"] (optional),
        "searchProvider": "tavily" (optional),
        "tavilyApiKey": "Tavily API key" (optional),
        "searchBackend": "auto|duckduckgo|google|bing|brave|yandex|yahoo" (optional)
    }

    Response: Server-Sent Events stream
    - data: {"type":"text","content":"..."}
    - data: {"type":"thought","content":"..."}
    - data: {"type":"tool_call","name":"...","arguments":"..."}
    - data: {"type":"tool_result","name":"...","output":"..."}
    - data: {"type":"done","content":"...","thought":"...","sources":[...]}
    - data: {"type":"error","error":"..."}
    """
    # Parse request body
    body = await request.json()
    stream_request = StreamChatRequest(**body)

    # Get SSE config
    sse_config = get_sse_config()

    async def event_generator() -> AsyncGenerator[dict[str, str], None]:
        """Generate SSE events."""
        try:
            # Get stream chat service
            service = get_stream_chat_service()

            # Stream chat completion
            async for event in service.stream_chat(stream_request):
                if await request.is_disconnected():
                    break
                # Send event as SSE data
                yield {"data": json.dumps(event, ensure_ascii=False)}

        except asyncio.CancelledError:
            return
        except Exception as e:
            # Send error event
            error_event = {"type": "error", "error": str(e)}
            yield {"data": json.dumps(error_event, ensure_ascii=False)}

    # Create EventSourceResponse
    return EventSourceResponse(
        event_generator(),
        media_type="text/event-stream",
    )


@router.get("/tools")
async def get_tools() -> dict[str, list[dict]]:
    """Get list of available tools."""
    tools = list_tools()
    return {"tools": tools}


@router.get("/health")
async def health_check() -> dict[str, str]:
    """Health check endpoint."""
    return {"status": "ok", "message": "Qurio Python backend is running"}
