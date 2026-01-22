"""
Local tools service for Qurio backend.
Integrates official Agno toolkits and custom local tools.
"""

import asyncio
import json
import re
from datetime import datetime
from typing import Any

# Agno Toolkits
from agno.tools.tavily import TavilyTools
# Agno Toolkits
from agno.tools.tavily import TavilyTools
from agno.tools.calculator import CalculatorTools
from agno.tools.yfinance import YFinanceTools
from agno.tools.arxiv import ArxivTools
from agno.tools.wikipedia import WikipediaTools
from agno.tools.duckduckgo import DuckDuckGoTools
import httpx

# Import other necessary types from agno if needed, or use dicts for now
# We will primarily use these classes in stream_chat.py, 
# but we can also expose their definitions here if needed for the frontend.
# However, Agno Toolkit integration usually happens at the Agent level.
# Current frontend expects a list of available tools.
# We will keep the legacy definitions for custom tools and add placeholders or 
# let the Agent handle the toolkit definitions automatically.

# For Qurio's current architecture, it seems tools are defined in GLOBAL_TOOLS/AGENT_TOOLS
# and then executed via execute_tool_by_name. 
# BUT Agno toolkits come with their own execution logic.
# If we switch to Agno Toolkits, we should inject them into the Agent directly 
# in services/stream_chat.py.

# So this file mainly needs to:
# 1. Keep custom tools that Agno doesn't have (e.g. interactive_form, specific text utils)
# 2. Re-export or provide a way to list Agno tools if the frontend needs them 
# (though Agno usually auto-generates schemas for the LLM).

# We will remove the *implementations* of Jina/Tavily here, as they will be handled by the toolkit classes.

# Tool definitions for CUSTOM tools only
CUSTOM_TOOLS = [
    {
        "id": "local_time",
        "name": "local_time",
        "category": "time",
        "description": "Get current local date and time for a timezone.",
        "parameters": {
            "type": "object",
            "properties": {
                "timezone": {"type": "string", "description": 'IANA timezone, e.g. "Asia/Shanghai".'},
                "locale": {"type": "string", "description": 'Locale for formatting, e.g. "zh-CN".'},
            },
        },
    },
    {
        "id": "summarize_text",
        "name": "summarize_text",
        "category": "text",
        "description": "Summarize text by extracting leading sentences.",
        "parameters": {
            "type": "object",
            "required": ["text"],
            "properties": {
                "text": {"type": "string", "description": "Text to summarize."},
                "max_sentences": {"type": "integer", "description": "Maximum number of sentences."},
                "max_chars": {"type": "integer", "description": "Maximum length of summary."},
            },
        },
    },
    {
        "id": "extract_text",
        "name": "extract_text",
        "category": "text",
        "description": "Extract relevant sentences by query keyword.",
        "parameters": {
            "type": "object",
            "required": ["text"],
            "properties": {
                "text": {"type": "string", "description": "Text to extract from."},
                "query": {"type": "string", "description": "Keyword to match."},
                "max_sentences": {"type": "integer", "description": "Maximum number of sentences."},
            },
        },
    },
    {
        "id": "json_repair",
        "name": "json_repair",
        "category": "json",
        "description": "Validate and repair JSON text.",
        "parameters": {
            "type": "object",
            "required": ["text"],
            "properties": {
                "text": {"type": "string", "description": "JSON string to validate."},
            },
        },
    },
    {
        "id": "interactive_form",
        "name": "interactive_form",
        "category": "interaction",
        "description": "Display an interactive form to collect structured user input.",
        "parameters": {
            "type": "object",
            "required": ["id", "title", "fields"],
            "properties": {
                "id": {"type": "string", "description": "Form ID"},
                "title": {"type": "string", "description": "Form title"},
                "fields": {
                    "type": "array",
                    "items": {"type": "object"},
                    "description": "Array of fields",
                },
            },
        },
    },
    {
        "id": "webpage_reader",
        "name": "webpage_reader",
        "category": "utility",
        "description": "Read and scrape webpages.",
        "parameters": {
            "type": "object",
            "required": ["url"],
            "properties": {
                "url": {"type": "string", "description": "The URL to read."},
            },
        },
    },
]

# Aliases
TOOL_ALIASES: dict[str, str] = {
    # We might not need aliases for Agno tools if we use them directly
}

def resolve_tool_name(tool_name: str) -> str:
    return TOOL_ALIASES.get(tool_name, tool_name)

# Legacy support for listing custom tools
def list_tools() -> list[dict[str, Any]]:
    # Agno Toolkit Definitions for Frontend Display
    agno_tools = [
        {
            "id": "Tavily_web_search",
            "name": "Tavily Web Search",
            "category": "search",
            "description": "Web search using Tavily API.",
            "parameters": {"type": "object", "properties": {"query": {"type": "string"}}},
        },

        {
            "id": "calculator",
            "name": "Calculator",
            "category": "math",
            "description": "Perform mathematical calculations.",
            "parameters": {"type": "object", "properties": {"expression": {"type": "string"}}},
        },
        {
            "id": "yfinance",
            "name": "YFinance",
            "category": "finance",
            "description": "Stock market data.",
            "parameters": {"type": "object", "properties": {"symbol": {"type": "string"}}},
        },
        {
            "id": "arxiv",
            "name": "Arxiv Search",
            "category": "academic",
            "description": "Search academic papers on Arxiv.",
            "parameters": {"type": "object", "properties": {"query": {"type": "string"}}},
        },
        {
            "id": "wikipedia",
            "name": "Wikipedia",
            "category": "knowledge",
            "description": "Search Wikipedia.",
            "parameters": {"type": "object", "properties": {"query": {"type": "string"}}},
        },
         {
            "id": "duckduckgo",
            "name": "DuckDuckGo Search",
            "category": "search",
            "description": "Private web search.",
            "parameters": {"type": "object", "properties": {"query": {"type": "string"}}},
        },
    ]

    custom_tools_list = [
        {
            "id": tool["id"],
            "name": tool["name"],
            "category": tool["category"],
            "description": tool["description"],
            "parameters": tool["parameters"],
        }
        for tool in CUSTOM_TOOLS
    ]
    
    return custom_tools_list + agno_tools

def get_tool_definitions_by_ids(tool_ids: list[str]) -> list[dict[str, Any]]:
    """
    Get definitions for CUSTOM tools. 
    Note: Agno Toolkits inject their own definitions into the Agent.
    """
    if not tool_ids:
        return []

    id_set = {resolve_tool_name(str(id)) for id in tool_ids}
    return [
        {
            "type": "function",
            "function": {
                "name": tool["name"],
                "description": tool["description"],
                "parameters": tool["parameters"],
            },
        }
        for tool in CUSTOM_TOOLS
        if tool["id"] in id_set
    ]

# Implementations for CUSTOM tools
async def execute_local_tool(
    tool_name: str,
    args: dict[str, Any],
) -> dict[str, Any]:
    resolved_name = resolve_tool_name(tool_name)
    
    match resolved_name:
        case "local_time":
            return await _execute_local_time(args)
        case "summarize_text":
            return await _execute_summarize_text(args)
        case "extract_text":
            return await _execute_extract_text(args)
        case "json_repair":
            return await _execute_json_repair(args)
        case "interactive_form":
            return await _execute_interactive_form(args)
        case "webpage_reader":
            return await _execute_webpage_reader(args)
        case _:
            raise ValueError(f"Unknown local tool: {resolved_name}")

async def _execute_local_time(args: dict[str, Any]) -> dict[str, Any]:
    timezone = args.get("timezone") or "UTC"
    locale = args.get("locale") or "en-US"
    try:
        now = datetime.now()
        return {
            "timezone": timezone,
            "locale": locale,
            "formatted": now.strftime("%Y-%m-%d %H:%M:%S"),
            "iso": now.isoformat(),
        }
    except Exception as e:
        raise ValueError(f"Time error: {e}")

def _split_sentences(text: str) -> list[str]:
    sentences = re.split(r"[.!?。！？]+", text)
    return [s.strip() for s in sentences if s.strip()]

async def _execute_summarize_text(args: dict[str, Any]) -> dict[str, Any]:
    text = args.get("text", "")
    max_sentences = args.get("max_sentences", 3)
    max_chars = args.get("max_chars", 600)
    sentences = _split_sentences(text)[:max_sentences]
    summary = " ".join(sentences)
    if len(summary) > max_chars:
        summary = summary[:max_chars].strip()
    return {"summary": summary}

async def _execute_extract_text(args: dict[str, Any]) -> dict[str, Any]:
    text = args.get("text", "")
    query = args.get("query", "").lower()
    max_sentences = args.get("max_sentences", 5)
    sentences = _split_sentences(text)
    matches = [s for s in sentences if query in s.lower()] if query else sentences
    return {"extracted": matches[:max_sentences]}

async def _execute_json_repair(args: dict[str, Any]) -> dict[str, Any]:
    text = args.get("text", "")
    try:
        data = json.loads(text)
        return {"valid": True, "repaired": text, "data": data}
    except json.JSONDecodeError:
        try:
            repaired = text.strip()
            repaired = re.sub(r",\s*}", "}", repaired)
            repaired = re.sub(r",\s*]", "]", repaired)
            data = json.loads(repaired)
            return {"valid": False, "repaired": repaired, "data": data}
        except Exception as e:
            return {"valid": False, "error": f"Unable to repair JSON: {e}"}

async def _execute_interactive_form(args: dict[str, Any]) -> dict[str, Any]:
    return {
        "form_id": args.get("id"),
        "title": args.get("title"),
        "fields": args.get("fields", []),
        "status": "pending_user_input",
    }


async def _execute_webpage_reader(args: dict[str, Any]) -> dict[str, Any]:
    """Fetch webpage content using Jina AI reader."""
    url = args.get("url", "").strip()

    # Remove Jina AI prefix if already present
    normalized = re.sub(r"^https?://r\.jina\.ai/", "", url)
    request_url = f"https://r.jina.ai/{normalized}"

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                request_url,
                headers={"Accept": "text/plain"},
            )
            response.raise_for_status()
            content = response.text

            return {
                "url": normalized,
                "content": content,
                "source": "jina.ai",
            }
    except httpx.HTTPError as e:
        return {"error": f"Webpage read failed: {str(e)}"}

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

# Export constants expected by services/__init__.py
GLOBAL_TOOLS = CUSTOM_TOOLS
AGENT_TOOLS = [] # Agno Agent uses its own toolkits, so this can be empty or used for agent-specific custom tools
ALL_TOOLS = GLOBAL_TOOLS + AGENT_TOOLS
