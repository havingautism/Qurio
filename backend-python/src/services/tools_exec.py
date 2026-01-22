
def is_local_tool_name(tool_name: str) -> bool:
    """Check if a tool is a local custom tool."""
    resolved = resolve_tool_name(tool_name)
    return any(t["id"] == resolved for t in CUSTOM_TOOLS)

async def execute_tool_by_name(
    tool_name: str, 
    args: dict[str, Any], 
    tool_config: dict[str, Any] = None
) -> dict[str, Any]:
    """Execute a tool by name, handling local dispatch."""
    if is_local_tool_name(tool_name):
        return await execute_local_tool(tool_name, args)
    raise ValueError(f"Tool {tool_name} not found")
