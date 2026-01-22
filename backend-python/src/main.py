"""
Qurio Backend - Python (FastAPI + Agno)
Main application entry point.
"""

import contextlib
from typing import AsyncGenerator

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from .config import get_settings
from .routes import stream_chat

# Create settings instance
settings = get_settings()

# Create FastAPI app
app = FastAPI(
    title="Qurio Backend",
    description="AI-powered backend with FastAPI + Agno framework",
    version="0.1.0",
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_event():
    """Initialize application on startup."""
    print(f"🚀 Qurio Python backend starting on http://{settings.host}:{settings.port}")
    print(f"📡 API endpoints available at http://{settings.host}:{settings.port}/api")


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown."""
    print("👋 Qurio Python backend shutting down")


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Global exception handler."""
    import traceback

    print(f"Unhandled exception: {exc}")
    print(traceback.format_exc())
    return Response(
        content=f'{{"error":"Internal server error","message":"{str(exc)}"}}',
        status_code=500,
        media_type="application/json",
    )


# Include routers
app.include_router(stream_chat.router, prefix="/api")


# Root endpoint
@app.get("/")
async def root() -> dict[str, str]:
    """Root endpoint."""
    return {
        "name": "Qurio Backend (Python)",
        "version": "0.1.0",
        "framework": "FastAPI + Agno",
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "src.main:app",
        host=settings.host,
        port=settings.port,
        reload=True,
    )
