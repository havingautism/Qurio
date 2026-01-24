"""
AgentOS app bootstrap using Agno SDK.
"""

from __future__ import annotations

import os
from types import SimpleNamespace
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from agno.os import AgentOS

from ..config import get_settings
from ..routes import (
    stream_chat as stream_chat_route,
    daily_tip as daily_tip_route,
    title as title_route,
    title_and_space,
    title_space_agent,
    agent_for_auto,
    related_questions,
    research_plan,
    deep_research,
    memory as memory_route,
    mcp_tools,
)
from .agent_registry import build_agent, init_memory_db

_agent_os: AgentOS | None = None


def _build_base_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="Qurio Backend (AgentOS)",
        description="Agno AgentOS app with Qurio routes",
        version="0.2.0",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def _cors_fallback(request, call_next):
        try:
            response = await call_next(request)
        except Exception as exc:
            response = JSONResponse(status_code=500, content={"detail": str(exc)})
        origin = request.headers.get("origin")
        if origin and (origin in settings.allowed_origins):
            response.headers.setdefault("Access-Control-Allow-Origin", origin)
            response.headers.setdefault("Vary", "Origin")
            response.headers.setdefault("Access-Control-Allow-Credentials", "true")
            response.headers.setdefault("Access-Control-Allow-Headers", "*")
            response.headers.setdefault("Access-Control-Allow-Methods", "*")
        return response

    app.include_router(stream_chat_route.router, prefix="/api")
    app.include_router(daily_tip_route.router, prefix="/api")
    app.include_router(title_route.router, prefix="/api")
    app.include_router(title_and_space.router, prefix="/api")
    app.include_router(title_space_agent.router, prefix="/api")
    app.include_router(agent_for_auto.router, prefix="/api")
    app.include_router(related_questions.router, prefix="/api")
    app.include_router(research_plan.router, prefix="/api")
    app.include_router(deep_research.router, prefix="/api")
    app.include_router(memory_route.router, prefix="/api")
    app.include_router(mcp_tools.router, prefix="/api/mcp-tools")
    return app


def get_agent_os() -> AgentOS:
    global _agent_os
    if _agent_os is not None:
        return _agent_os

    base_app = _build_base_app()
    init_memory_db()
    default_request = SimpleNamespace(
        provider="openai",
        api_key=os.getenv("OPENAI_API_KEY"),
        base_url=os.getenv("OPENAI_BASE_URL"),
        model=os.getenv("OPENAI_MODEL"),
        tavily_api_key=os.getenv("TAVILY_API_KEY") or os.getenv("PUBLIC_TAVILY_API_KEY"),
        temperature=None,
        top_p=None,
        top_k=None,
        frequency_penalty=None,
        presence_penalty=None,
        thinking=None,
        tool_ids=None,
        tools=None,
        user_tools=None,
        tool_choice=None,
        enable_long_term_memory=os.getenv("ENABLE_LONG_TERM_MEMORY", "0") == "1",
        database_provider=os.getenv("DATABASE_PROVIDER", "supabase"),
    )
    default_agent = build_agent(default_request)

    _agent_os = AgentOS(
        name="Qurio AgentOS",
        description="Qurio backend powered by Agno AgentOS",
        agents=[default_agent],
        base_app=base_app,
        on_route_conflict="preserve_base_app",
        cors_allowed_origins=get_settings().allowed_origins,
    )
    return _agent_os
