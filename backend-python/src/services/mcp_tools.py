"""
MCP tool manager for Qurio (Python).
"""

from __future__ import annotations

import os
from datetime import timedelta
from typing import Any

try:
    from mcp import ClientSession
    from mcp.client.sse import sse_client
    from mcp.client.streamable_http import streamablehttp_client
except Exception:  # pragma: no cover - optional dependency
    ClientSession = None
    sse_client = None
    streamablehttp_client = None


REMOTE_MCP_TIMEOUT_SECONDS = max(15, int(os.getenv("REMOTE_MCP_TIMEOUT_SECONDS", "45")))
REMOTE_MCP_SSE_READ_TIMEOUT_SECONDS = max(
    REMOTE_MCP_TIMEOUT_SECONDS,
    int(os.getenv("REMOTE_MCP_SSE_READ_TIMEOUT_SECONDS", "300")),
)


class McpToolManager:
    def __init__(self) -> None:
        self.mcp_tools: dict[str, dict[str, Any]] = {}
        self.loaded_servers: set[str] = set()

    def _raise_unavailable(self) -> None:
        raise RuntimeError(
            "Python MCP client is not installed. Install the `mcp` package to enable this endpoint."
        )

    @staticmethod
    def _normalize_transport(transport: str | None) -> str:
        normalized = str(transport or "streamable-http").strip().lower()
        if normalized in {"streamable_http", "streamablehttp", "http"}:
            return "streamable-http"
        if normalized == "sse":
            return "sse"
        if normalized == "stdio":
            return "stdio"
        return "streamable-http"

    @staticmethod
    def _build_headers(server_config: dict[str, Any]) -> dict[str, Any]:
        headers = dict(server_config.get("headers") or {})
        bearer = server_config.get("bearerToken") or server_config.get("authToken")
        if bearer and "Authorization" not in headers:
            headers["Authorization"] = f"Bearer {bearer}"
        return headers

    async def _list_remote_tools(self, server_config: dict[str, Any]) -> list[dict[str, Any]]:
        if ClientSession is None or streamablehttp_client is None or sse_client is None:
            self._raise_unavailable()

        server_url = server_config.get("serverUrl") or server_config.get("server_url") or server_config.get("url")
        if not server_url:
            raise ValueError("MCP server missing URL")

        transport = self._normalize_transport(
            server_config.get("transport") or server_config.get("serverTransport")
        )
        if transport == "stdio":
            raise ValueError("The MCP tools UI currently supports only remote HTTP/SSE servers")

        headers = self._build_headers(server_config)
        timeout = timedelta(seconds=REMOTE_MCP_TIMEOUT_SECONDS)
        sse_timeout = timedelta(seconds=REMOTE_MCP_SSE_READ_TIMEOUT_SECONDS)
        client_factory = sse_client if transport == "sse" else streamablehttp_client

        async with client_factory(
            server_url,
            headers=headers,
            timeout=timeout,
            sse_read_timeout=sse_timeout,
        ) as transport_ctx:
            read, write, *_ = transport_ctx
            async with ClientSession(
                read,
                write,
                read_timeout_seconds=timeout,
            ) as session:
                await session.initialize()
                available_tools = await session.list_tools()

        normalized_tools: list[dict[str, Any]] = []
        for remote_tool in available_tools.tools:
            tool_name = str(getattr(remote_tool, "name", "") or "").strip()
            if not tool_name:
                continue
            normalized_tools.append(
                {
                    "id": f"{server_config.get('name') or 'mcp'}:{tool_name}",
                    "name": tool_name,
                    "description": getattr(remote_tool, "description", "") or "",
                    "parameters": getattr(remote_tool, "inputSchema", None) or {"type": "object", "properties": {}},
                    "category": "mcp",
                    "config": {
                        "mcpServer": server_config.get("name"),
                        "serverName": server_config.get("name"),
                        "serverUrl": server_url,
                        "transport": transport,
                        "headers": headers,
                    },
                }
            )

        return normalized_tools

    def get_status(self) -> dict[str, Any]:
        return {
            "loadedServers": list(self.loaded_servers),
            "totalTools": len(self.mcp_tools),
        }

    async def load_mcp_server(self, name: str, server_config: dict[str, Any]) -> list[dict[str, Any]]:
        tools = await self.fetch_tools_from_server_url(name, server_config)
        self.loaded_servers.add(name)
        for tool in tools:
            self.mcp_tools[tool["id"]] = tool
        return tools

    async def unload_mcp_server(self, name: str) -> None:
        if name in self.loaded_servers:
            self.loaded_servers.remove(name)
        tools_to_remove = [k for k, v in self.mcp_tools.items() if v.get("config", {}).get("mcpServer") == name]
        for key in tools_to_remove:
            self.mcp_tools.pop(key, None)

    def list_mcp_tools(self) -> list[dict[str, Any]]:
        return list(self.mcp_tools.values())

    def list_mcp_tools_by_server(self, server_name: str) -> list[dict[str, Any]]:
        return [
            tool for tool in self.mcp_tools.values()
            if tool.get("config", {}).get("mcpServer") == server_name
        ]

    def get_mcp_tool(self, tool_id: str) -> dict[str, Any] | None:
        return self.mcp_tools.get(tool_id)

    async def fetch_tools_from_server_url(self, name: str, server_config: dict[str, Any]) -> list[dict[str, Any]]:
        config = dict(server_config or {})
        config["name"] = name
        return await self._list_remote_tools(config)


mcp_tool_manager = McpToolManager()
