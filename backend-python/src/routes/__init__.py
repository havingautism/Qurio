"""
API routes for Qurio backend.
"""

from .stream_chat import router as stream_chat_router

__all__ = ["stream_chat_router"]
