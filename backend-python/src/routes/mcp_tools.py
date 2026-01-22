"""
MCP tools API routes.
"""

from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from ..services.mcp_tools import mcp_tool_manager


router = APIRouter(tags=["mcp-tools"])


@router.get("/servers")
async def list_servers() -> JSONResponse:
    try:
        status = mcp_tool_manager.get_status()
        return JSONResponse(
            content={
                "success": True,
                "servers": status.get("loadedServers", []),
                "totalTools": status.get("totalTools", 0),
            }
        )
    except Exception as exc:
        return JSONResponse(status_code=500, content={"success": False, "error": str(exc)})


@router.post("/servers")
async def load_server(request: Request) -> JSONResponse:
    body = await request.json()
    name = body.get("name")
    url = body.get("url")
    if not name or not url:
        return JSONResponse(
            status_code=400,
            content={"success": False, "error": "Missing required fields: name and url"},
        )
    try:
        tools = await mcp_tool_manager.load_mcp_server(name, body)
        return JSONResponse(
            content={
                "success": True,
                "message": f"Loaded {len(tools)} tools from {name}",
                "server": name,
                "toolsLoaded": len(tools),
                "tools": [
                    {
                        "id": tool.get("id"),
                        "name": tool.get("name"),
                        "description": tool.get("description"),
                        "parameters": tool.get("parameters"),
                    }
                    for tool in tools
                ],
            }
        )
    except Exception as exc:
        return JSONResponse(status_code=500, content={"success": False, "error": str(exc)})


@router.get("/servers/{name}/tools")
async def list_server_tools(name: str) -> JSONResponse:
    try:
        tools = mcp_tool_manager.list_mcp_tools_by_server(name)
        return JSONResponse(
            content={
                "success": True,
                "server": name,
                "tools": [
                    {
                        "id": tool.get("id"),
                        "name": tool.get("name"),
                        "description": tool.get("description"),
                        "parameters": tool.get("parameters"),
                    }
                    for tool in tools
                ],
                "total": len(tools),
            }
        )
    except Exception as exc:
        return JSONResponse(status_code=500, content={"success": False, "error": str(exc)})


@router.delete("/servers/{name}")
async def unload_server(name: str) -> JSONResponse:
    try:
        await mcp_tool_manager.unload_mcp_server(name)
        return JSONResponse(content={"success": True, "message": f"Unloaded server: {name}"})
    except Exception as exc:
        return JSONResponse(status_code=500, content={"success": False, "error": str(exc)})


@router.get("/tools")
async def list_tools() -> JSONResponse:
    try:
        tools = mcp_tool_manager.list_mcp_tools()
        return JSONResponse(
            content={
                "success": True,
                "tools": [
                    {
                        "id": tool.get("id"),
                        "name": tool.get("name"),
                        "description": tool.get("description"),
                        "category": tool.get("category"),
                        "parameters": tool.get("parameters"),
                        "server": tool.get("config", {}).get("mcpServer"),
                    }
                    for tool in tools
                ],
                "total": len(tools),
            }
        )
    except Exception as exc:
        return JSONResponse(status_code=500, content={"success": False, "error": str(exc)})


@router.get("/tool/{tool_id}")
async def get_tool(tool_id: str) -> JSONResponse:
    try:
        tool = mcp_tool_manager.get_mcp_tool(tool_id)
        if not tool:
            return JSONResponse(
                status_code=404,
                content={"success": False, "error": f"Tool not found: {tool_id}"},
            )
        return JSONResponse(
            content={
                "success": True,
                "tool": {
                    "id": tool.get("id"),
                    "name": tool.get("name"),
                    "description": tool.get("description"),
                    "category": tool.get("category"),
                    "parameters": tool.get("parameters"),
                    "server": tool.get("config", {}).get("mcpServer"),
                    "metadata": tool.get("metadata"),
                },
            }
        )
    except Exception as exc:
        return JSONResponse(status_code=500, content={"success": False, "error": str(exc)})


@router.post("/fetch")
async def fetch_tools(request: Request) -> JSONResponse:
    body = await request.json()
    name = body.get("name")
    url = body.get("url")
    if not name or not url:
        return JSONResponse(
            status_code=400,
            content={"success": False, "error": "Missing required fields: name and url"},
        )
    try:
        tools = await mcp_tool_manager.fetch_tools_from_server_url(name, body)
        return JSONResponse(
            content={
                "success": True,
                "server": name,
                "tools": [
                    {
                        "id": tool.get("id"),
                        "name": tool.get("name"),
                        "description": tool.get("description"),
                        "parameters": tool.get("parameters"),
                    }
                    for tool in tools
                ],
                "total": len(tools),
            }
        )
    except Exception as exc:
        return JSONResponse(status_code=500, content={"success": False, "error": str(exc)})

