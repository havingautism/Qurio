"""
AgentOS app bootstrap using Agno SDK.
"""

from __future__ import annotations

import logging
import os
from types import SimpleNamespace

from agno.os import AgentOS
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# Configure logging to see debug messages
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)

from ..config import get_settings
from ..routes import (
    agent_for_auto,
    deep_research,
    mcp_tools,
    related_questions,
    research_plan,
    space_agent,
    title_and_space,
    title_space_agent,
)
from ..routes import (
    daily_tip as daily_tip_route,
)
from ..routes import (
    db as db_route,
)
from ..routes import (
    emoji as emoji_route,
)
from ..routes import (
    memory as memory_route,
)
from ..routes import (
    stream_chat as stream_chat_route,
)
from ..routes import (
    title as title_route,
)
from ..routes import (
    email as email_route,
)
from ..routes import (
    scrapbook as scrapbook_route,
)
from ..routes import (
    env as env_route,
)
from ..routes import (
    skills as skills_route,
)
from .agent_registry import build_agent
from .email_monitor import start_email_monitor, stop_email_monitor

_agent_os: AgentOS | None = None


def _build_base_app() -> FastAPI:
    settings = get_settings()

    from contextlib import asynccontextmanager

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        # Optional auto polling; disabled by default to avoid background pulls.
        if os.getenv("EMAIL_AUTO_POLL_ENABLED", "0") == "1":
            start_email_monitor()
        yield
        # Stop scheduler on shutdown if it was started.
        stop_email_monitor()

    app = FastAPI(
        title="Qurio Backend (AgentOS)",
        description="Agno AgentOS app with Qurio routes",
        version="0.2.0",
        lifespan=lifespan,
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
    app.include_router(emoji_route.router, prefix="/api")
    app.include_router(title_and_space.router, prefix="/api")
    app.include_router(title_space_agent.router, prefix="/api")
    app.include_router(space_agent.router, prefix="/api")
    app.include_router(agent_for_auto.router, prefix="/api")
    app.include_router(related_questions.router, prefix="/api")
    app.include_router(research_plan.router, prefix="/api")
    app.include_router(deep_research.router, prefix="/api")
    app.include_router(memory_route.router, prefix="/api")
    app.include_router(mcp_tools.router, prefix="/api/mcp-tools")
    app.include_router(db_route.router, prefix="/api")
    app.include_router(email_route.router, prefix="/api")
    app.include_router(scrapbook_route.router, prefix="/api")
    app.include_router(env_route.router, prefix="/api")
    app.include_router(skills_route.router, prefix="/api")
    return app


def get_agent_os() -> AgentOS:
    global _agent_os
    if _agent_os is not None:
        return _agent_os

    base_app = _build_base_app()
    # init_memory_db() # Removed legacy DB init
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
        database_provider=os.getenv("DATABASE_PROVIDER") or "default",
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
