"""
MCP tool manager for Qurio (Python).

Note: No MCP client library is bundled by default. This module exposes the
same interface as the Node.js backend and fails fast when MCP client support
is unavailable.
"""

from __future__ import annotations

from typing import Any


class McpToolManager:
    def __init__(self) -> None:
        self.mcp_tools: dict[str, dict[str, Any]] = {}
        self.loaded_servers: set[str] = set()

    def _raise_unavailable(self) -> None:
        raise RuntimeError(
            "MCP client library is not installed. Install a Python MCP client to enable this endpoint."
        )

    def get_status(self) -> dict[str, Any]:
        return {
            "loadedServers": list(self.loaded_servers),
            "totalTools": len(self.mcp_tools),
        }

    async def load_mcp_server(self, name: str, server_config: dict[str, Any]) -> list[dict[str, Any]]:
        self._raise_unavailable()

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
        self._raise_unavailable()


mcp_tool_manager = McpToolManager()

