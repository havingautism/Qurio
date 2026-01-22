"""
SSE (Server-Sent Events) Utilities for FastAPI
Provides buffering, heartbeats, and consistent headers for streaming responses.
"""

import asyncio
import os
from dataclasses import dataclass, field
from typing import Any, AsyncGenerator, Callable, Optional

from starlette.responses import Response
from sse_starlette.sse import EventSourceResponse


@dataclass
class SseConfig:
    """SSE configuration."""
    flush_ms: int = field(default_factory=lambda: int(os.getenv("SSE_FLUSH_MS", "50")))
    heartbeat_ms: int = field(default_factory=lambda: int(os.getenv("SSE_HEARTBEAT_MS", "15000")))

    def __post_init__(self):
        if self.flush_ms < 0:
            self.flush_ms = 50
        if self.heartbeat_ms < 0:
            self.heartbeat_ms = 15000


def get_sse_config() -> SseConfig:
    """Get SSE configuration from environment variables."""
    return SseConfig()


class SseStream:
    """
    SSE stream manager with buffering and heartbeat support.

    Usage:
        async def stream_generator():
            sse = SseStream(config)
            await sse.write_comment("ok")
            await sse.send_event({"type": "text", "content": "Hello"})
            await sse.send_event({"type": "done"})
            await sse.close()
    """

    def __init__(self, config: Optional[SseConfig] = None):
        self.config = config or get_sse_config()
        self._buffer: list[str] = []
        self._flush_task: Optional[asyncio.Task] = None
        self._heartbeat_task: Optional[asyncio.Task] = None
        self._queue: asyncio.Queue = asyncio.Queue()
        self._closed = False

    async def _flush_loop(self) -> None:
        """Background task to flush buffered data at intervals."""
        while not self._closed:
            await asyncio.sleep(self.config.flush_ms / 1000)
            if self._buffer:
                data = "\n".join(self._buffer)
                self._buffer.clear()
                await self._queue.put(data)

    async def _heartbeat_loop(self) -> None:
        """Background task to send heartbeat comments."""
        while not self._closed:
            await asyncio.sleep(self.config.heartbeat_ms / 1000)
            await self.write_comment("keep-alive")

    async def _flush(self) -> None:
        """Flush buffered data immediately."""
        if self._buffer:
            data = "\n".join(self._buffer)
            self._buffer.clear()
            await self._queue.put(data)

    async def write_comment(self, comment: str) -> None:
        """Write an SSE comment (not processed by clients)."""
        await self._queue.put(f": {comment}\n\n")

    async def send_event(self, data: dict[str, Any]) -> None:
        """Send an SSE event with JSON data."""
        import json
        if self.config.flush_ms == 0:
            # Immediate flush
            await self._queue.put(f"data: {json.dumps(data)}\n\n")
        else:
            # Buffered
            self._buffer.append(f"data: {json.dumps(data)}\n\n")

    async def start(self) -> None:
        """Start background tasks for flushing and heartbeat."""
        if self.config.flush_ms > 0:
            self._flush_task = asyncio.create_task(self._flush_loop())
        if self.config.heartbeat_ms > 0:
            self._heartbeat_task = asyncio.create_task(self._heartbeat_loop())

    async def close(self) -> None:
        """Close the stream and cleanup resources."""
        self._closed = True
        await self._flush()

        if self._flush_task:
            self._flush_task.cancel()
            try:
                await self._flush_task
            except asyncio.CancelledError:
                pass

        if self._heartbeat_task:
            self._heartbeat_task.cancel()
            try:
                await self._heartbeat_task
            except asyncio.CancelledError:
                pass

    async def __aiter__(self) -> AsyncGenerator[str, None]:
        """Iterate over SSE events."""
        await self.start()
        try:
            while not self._closed:
                try:
                    data = await asyncio.wait_for(self._queue.get(), timeout=0.1)
                    yield data
                except asyncio.TimeoutError:
                    continue
        finally:
            await self.close()


async def create_sse_stream(
    generator: Callable[[], AsyncGenerator[dict[str, Any], None]],
    config: Optional[SseConfig] = None,
) -> AsyncGenerator[str, None]:
    """
    Create an SSE stream from a generator that yields event dictionaries.

    Args:
        generator: An async generator function that yields event dicts
        config: Optional SSE configuration

    Yields:
        SSE-formatted strings
    """
    sse = SseStream(config)
    async for event in generator():
        if event.get("type") == "data":
            await sse.send_event(event)
        elif event.get("type") == "comment":
            await sse.write_comment(event.get("text", ""))
    await sse.close()
    async for data in sse:
        yield data


def create_sse_response(
    generator: Callable[[], AsyncGenerator[dict[str, Any], None]],
    config: Optional[SseConfig] = None,
) -> EventSourceResponse:
    """
    Create a FastAPI EventSourceResponse from a generator.

    Args:
        generator: An async generator function that yields event dicts
        config: Optional SSE configuration

    Returns:
        EventSourceResponse for FastAPI
    """
    async def event_generator():
        async for event in generator():
            yield event

    return EventSourceResponse(event_generator(), ping=0)
