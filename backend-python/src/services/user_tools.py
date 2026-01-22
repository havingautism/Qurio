"""
User-defined tool adapter (HTTP + MCP) for Agno Agent tools.
"""

from __future__ import annotations

import asyncio
import json
import re
from typing import Any
from urllib.parse import quote, urlencode, urlparse

import httpx
from agno.tools import Toolkit
from agno.tools.function import Function

try:
    from agno.tools.mcp import MCPTools
    from agno.tools.mcp.params import StreamableHTTPClientParams, SSEClientParams
except Exception:  # pragma: no cover - optional dependency
    MCPTools = None
    StreamableHTTPClientParams = None
    SSEClientParams = None


_mcp_tools_cache: dict[str, Any] = {}
_mcp_tools_lock = asyncio.Lock()


def _replace_template(template: Any, args: dict[str, Any]) -> Any:
    if not isinstance(template, str):
        return template
    def _replace(match):
        key = match.group(1)
        if key in args:
            return quote(str(args[key]), safe="")
        return match.group(0)
    return _TEMPLATE_REGEX.sub(_replace, template)


def _replace_templates(params: dict[str, Any], args: dict[str, Any]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in (params or {}).items():
        if isinstance(value, str):
            result[key] = _replace_template(value, args)
        else:
            result[key] = value
    return result


def _build_url(base_url: str, params: dict[str, Any]) -> str:
    if not params:
        return base_url
    query = urlencode({k: v for k, v in params.items() if v not in (None, "", [])}, doseq=True)
    if not query:
        return base_url
    return f"{base_url}{'&' if '?' in base_url else '?'}{query}"


def _validate_domain(url: str, allowed_domains: list[str]) -> None:
    if not allowed_domains:
        raise ValueError("No allowed domains configured for this tool")
    hostname = urlparse(url).hostname or ""
    for domain in allowed_domains:
        if hostname == domain:
            return
        if domain.startswith("*."):
            base = domain[2:]
            if hostname == base or hostname.endswith(f".{base}"):
                return
    raise ValueError(f"Domain {hostname} is not in the allowed list: {', '.join(allowed_domains)}")


async def _execute_http_tool(tool: dict[str, Any], args: dict[str, Any]) -> dict[str, Any]:
    config = tool.get("config") or {}
    url = config.get("url")
    method = (config.get("method") or "GET").upper()
    params = config.get("params") or {}
    headers = config.get("headers") or {}
    security = config.get("security") or {}

    if not url:
        raise ValueError("HTTP tool missing url")

    allowed_domains = security.get("allowedDomains") or []
    max_response_size = int(security.get("maxResponseSize") or 1000000)
    timeout_ms = int(security.get("timeout") or 10000)

    final_params = _replace_templates(params, args or {})
    processed_url = _replace_template(url, args or {})
    final_url = _build_url(processed_url, final_params) if method == "GET" else processed_url

    _validate_domain(final_url, allowed_domains)

    request_headers = {"Content-Type": "application/json"}
    request_headers.update(headers or {})

    timeout = httpx.Timeout(timeout_ms / 1000.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        if method in ("GET", "HEAD"):
            response = await client.request(method, final_url, headers=request_headers)
        else:
            response = await client.request(
                method,
                final_url,
                headers=request_headers,
                json=final_params,
            )

    response.raise_for_status()
    text = response.text
    if len(text) > max_response_size:
        raise ValueError(
            f"Response size {len(text)} bytes exceeds limit of {max_response_size} bytes"
        )

    try:
        return json.loads(text)
    except Exception:
        return {"data": text}


async def _get_mcp_tools(server_url: str, transport: str, headers: dict[str, Any]) -> Any:
    if MCPTools is None:
        raise RuntimeError("`mcp` not installed. Please install using `pip install mcp`.")

    key = json.dumps(
        {
            "url": server_url,
            "transport": transport,
            "headers": headers,
        },
        sort_keys=True,
    )

    async with _mcp_tools_lock:
        if key in _mcp_tools_cache:
            return _mcp_tools_cache[key]

        server_params = None
        if transport == "sse":
            server_params = SSEClientParams(url=server_url, headers=headers) if SSEClientParams else None
        else:
            server_params = (
                StreamableHTTPClientParams(url=server_url, headers=headers)
                if StreamableHTTPClientParams
                else None
            )

        tools = MCPTools(url=server_url, transport=transport, server_params=server_params)
        await tools.connect()
        _mcp_tools_cache[key] = tools
        return tools


async def _execute_mcp_tool(tool: dict[str, Any], args: dict[str, Any]) -> Any:
    if MCPTools is None:
        raise RuntimeError("`mcp` not installed. Please install using `pip install mcp`.")

    config = tool.get("config") or {}
    server_url = config.get("serverUrl") or config.get("server_url") or config.get("url")
    if not server_url:
        raise ValueError("MCP tool missing serverUrl")
    transport = config.get("transport") or config.get("serverTransport") or "streamable-http"
    headers = dict(config.get("headers") or {})
    bearer = config.get("bearerToken") or config.get("authToken")
    if bearer and "Authorization" not in headers:
        headers["Authorization"] = f"Bearer {bearer}"

    tool_name = config.get("toolName") or tool.get("name")
    if not tool_name:
        raise ValueError("MCP tool missing toolName")

    tools = await _get_mcp_tools(server_url, transport, headers)
    functions = tools.get_async_functions()
    fn = functions.get(tool_name) or tools.get_functions().get(tool_name)
    if not fn or not fn.entrypoint:
        raise RuntimeError(f"MCP tool '{tool_name}' not found in server")

    return await fn.entrypoint(**(args or {}))


def build_user_tools_toolkit(user_tools: list[dict[str, Any]] | None) -> Toolkit | None:
    if not user_tools:
        return None

    functions: list[Function] = []
    for tool in user_tools:
        name = tool.get("name")
        if not name:
            continue
        description = tool.get("description") or ""
        parameters = (
            tool.get("input_schema")
            or tool.get("inputSchema")
            or tool.get("parameters")
            or {
            "type": "object",
            "properties": {},
        }
        )

        if tool.get("type") == "mcp":
            async def _mcp_entrypoint(*, _tool=tool, **kwargs):
                return await _execute_mcp_tool(_tool, kwargs)

            entrypoint = _mcp_entrypoint
        else:
            async def _http_entrypoint(*, _tool=tool, **kwargs):
                return await _execute_http_tool(_tool, kwargs)

            entrypoint = _http_entrypoint

        functions.append(
            Function(
                name=name,
                description=description,
                parameters=parameters,
                entrypoint=entrypoint,
                skip_entrypoint_processing=True,
            )
        )

    if not functions:
        return None
    return Toolkit(name="user_tools", tools=functions)


_TEMPLATE_REGEX = re.compile(r"\{\{(\w+)\}\}")
