"""
Streaming JSON utilities.

These helpers keep the HTTP connection active by sending lightweight
heartbeat bytes while the backend is waiting for model output, then emit
the final JSON payload as the last chunk.
"""

from __future__ import annotations

import asyncio
import json
import os
from collections.abc import AsyncGenerator, Awaitable, Mapping
from typing import Any

from fastapi.responses import StreamingResponse


def _heartbeat_interval_seconds() -> float:
    raw = os.getenv("JSON_STREAM_HEARTBEAT_MS", "1000")
    try:
        millis = int(raw)
    except (TypeError, ValueError):
        millis = 1000
    if millis < 0:
        millis = 1000
    return millis / 1000


def create_streaming_json_response(
    result_awaitable: Awaitable[Mapping[str, Any] | dict[str, Any]],
) -> StreamingResponse:
    """
    Return a streaming JSON response that emits periodic heartbeats.
    """

    heartbeat_sec = _heartbeat_interval_seconds()

    async def _stream() -> AsyncGenerator[bytes, None]:
        task = asyncio.create_task(result_awaitable)
        # Send first byte immediately so clients receive headers/body quickly.
        yield b"\n"

        while not task.done():
            try:
                await asyncio.wait_for(asyncio.shield(task), timeout=heartbeat_sec)
            except TimeoutError:
                yield b"\n"

        payload = task.result()
        yield json.dumps(payload, ensure_ascii=False).encode("utf-8")

    headers = {
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
    }
    return StreamingResponse(_stream(), media_type="application/json", headers=headers)
