"""
Local tools service for Qurio backend.
Implements built-in tools like calculator, local_time, search, etc.
"""

import asyncio
import json
import re
from datetime import datetime
from typing import Any

import httpx


# Tool definitions
GLOBAL_TOOLS = [
    {
        "id": "Tavily_web_search",
        "name": "Tavily_web_search",
        "category": "search",
        "description": "Search the web for current information using Tavily API.",
        "parameters": {
            "type": "object",
            "required": ["query"],
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Search query.",
                },
                "max_results": {
                    "type": "integer",
                    "description": "Maximum number of results to return (default 5).",
                },
            },
        },
    },
]

AGENT_TOOLS = [
    {
        "id": "calculator",
        "name": "calculator",
        "category": "math",
        "description": "Evaluate a math expression safely.",
        "parameters": {
            "type": "object",
            "required": ["expression"],
            "properties": {
                "expression": {
                    "type": "string",
                    "description": 'Math expression, e.g. "(2+3)*4/5".',
                },
            },
        },
    },
    {
        "id": "local_time",
        "name": "local_time",
        "category": "time",
        "description": "Get current local date and time for a timezone.",
        "parameters": {
            "type": "object",
            "properties": {
                "timezone": {
                    "type": "string",
                    "description": 'IANA timezone, e.g. "Asia/Shanghai".',
                },
                "locale": {
                    "type": "string",
                    "description": 'Locale for formatting, e.g. "zh-CN".',
                },
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
                "text": {
                    "type": "string",
                    "description": "Text to summarize.",
                },
                "max_sentences": {
                    "type": "integer",
                    "description": "Maximum number of sentences to return.",
                },
                "max_chars": {
                    "type": "integer",
                    "description": "Maximum length of summary in characters.",
                },
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
                "text": {
                    "type": "string",
                    "description": "Text to extract from.",
                },
                "query": {
                    "type": "string",
                    "description": "Keyword or phrase to match.",
                },
                "max_sentences": {
                    "type": "integer",
                    "description": "Maximum number of sentences to return.",
                },
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
                "text": {
                    "type": "string",
                    "description": "JSON string to validate or repair.",
                },
            },
        },
    },
    {
        "id": "webpage_reader",
        "name": "webpage_reader",
        "category": "web",
        "description": "Fetch webpage content and return JSON.",
        "parameters": {
            "type": "object",
            "required": ["url"],
            "properties": {
                "url": {
                    "type": "string",
                    "description": 'Target webpage URL (e.g., https://example.com).',
                },
            },
        },
    },
    {
        "id": "Tavily_academic_search",
        "name": "Tavily_academic_search",
        "category": "search",
        "description": "Search academic journals, papers, and scholarly resources using Tavily API with advanced search depth. Results are limited to peer-reviewed sources, preprint servers, and trusted academic databases.",
        "parameters": {
            "type": "object",
            "required": ["query"],
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Academic search query (e.g., research topic, paper title, author name).",
                },
                "max_results": {
                    "type": "integer",
                    "description": "Maximum number of academic results to return (default 5).",
                },
            },
        },
    },
    {
        "id": "interactive_form",
        "name": "interactive_form",
        "category": "interaction",
        "description": "Display an interactive form to collect structured user input. Use this when you need specific information from the user in a structured format.",
        "parameters": {
            "type": "object",
            "required": ["id", "title", "fields"],
            "properties": {
                "id": {
                    "type": "string",
                    "description": "Unique identifier for this form",
                },
                "title": {
                    "type": "string",
                    "description": "Form title displayed to user",
                },
                "fields": {
                    "type": "array",
                    "description": "Array of field definitions with id, label, type, required, placeholder",
                    "items": {"type": "object"},
                },
            },
        },
    },
]

ALL_TOOLS = GLOBAL_TOOLS + AGENT_TOOLS

# Tool aliases
TOOL_ALIASES: dict[str, str] = {
    "web_search": "Tavily_web_search",
    "academic_search": "Tavily_academic_search",
}


def resolve_tool_name(tool_name: str) -> str:
    """Resolve tool name alias."""
    return TOOL_ALIASES.get(tool_name, tool_name)


def list_tools() -> list[dict[str, Any]]:
    """List all available agent tools."""
    return [
        {
            "id": tool["id"],
            "name": tool["name"],
            "category": tool["category"],
            "description": tool["description"],
            "parameters": tool["parameters"],
        }
        for tool in AGENT_TOOLS
    ]


def get_tool_definitions_by_ids(tool_ids: list[str]) -> list[dict[str, Any]]:
    """Get tool definitions by IDs."""
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
        for tool in ALL_TOOLS
        if tool["id"] in id_set
    ]


def is_local_tool_name(tool_name: str) -> bool:
    """Check if tool name is a local tool."""
    resolved = resolve_tool_name(tool_name)
    return any(tool["name"] == resolved or tool["id"] == tool_name for tool in ALL_TOOLS)


# Tool implementations
async def execute_tool_by_name(
    tool_name: str,
    args: dict[str, Any],
    tool_config: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Execute a tool by name with given arguments.

    Args:
        tool_name: Name of the tool to execute
        args: Tool arguments
        tool_config: Optional tool configuration (e.g., API keys)

    Returns:
        Tool execution result

    Raises:
        ValueError: If tool name is unknown or arguments are invalid
    """
    tool_config = tool_config or {}
    resolved_name = resolve_tool_name(tool_name)

    # Find tool schema
    tool_schema = next((t for t in ALL_TOOLS if t["name"] == resolved_name), None)
    if not tool_schema:
        raise ValueError(f"Unknown tool: {tool_name}")

    # Validate arguments
    _validate_tool_args(tool_schema, args)

    # Execute tool
    match resolved_name:
        case "calculator":
            return await _execute_calculator(args)
        case "local_time":
            return await _execute_local_time(args)
        case "summarize_text":
            return await _execute_summarize_text(args)
        case "extract_text":
            return await _execute_extract_text(args)
        case "json_repair":
            return await _execute_json_repair(args)
        case "webpage_reader":
            return await _execute_webpage_reader(args)
        case "Tavily_web_search":
            return await _execute_tavily_web_search(args, tool_config)
        case "Tavily_academic_search":
            return await _execute_tavily_academic_search(args, tool_config)
        case "interactive_form":
            return await _execute_interactive_form(args)
        case _:
            raise ValueError(f"Tool not implemented: {resolved_name}")


def _validate_tool_args(tool_schema: dict[str, Any], args: dict[str, Any]) -> None:
    """Validate tool arguments against schema."""
    required = tool_schema["parameters"].get("required", [])
    properties = tool_schema["parameters"].get("properties", {})

    # Check required fields
    for field in required:
        if field not in args:
            raise ValueError(f"Missing required argument: {field}")

    # Type validation (basic)
    for field, value in args.items():
        if field in properties:
            expected_type = properties[field].get("type")
            if expected_type == "string" and not isinstance(value, str):
                raise ValueError(f"Field '{field}' must be a string")
            elif expected_type == "integer" and not isinstance(value, int):
                raise ValueError(f"Field '{field}' must be an integer")
            elif expected_type == "array" and not isinstance(value, list):
                raise ValueError(f"Field '{field}' must be an array")


# Individual tool implementations
async def _execute_calculator(args: dict[str, Any]) -> dict[str, Any]:
    """Evaluate math expression safely."""
    expression = args.get("expression", "")
    try:
        # Safe evaluation: only allow numbers and math operations
        allowed_chars = set("0123456789+-*/.() ")
        if not all(c in allowed_chars or c.isalnum() for c in expression):
            raise ValueError("Invalid characters in expression")

        result = eval(expression, {"__builtins__": {}}, {})
        return {"result": result}
    except Exception as e:
        raise ValueError(f"Calculator error: {e}")


async def _execute_local_time(args: dict[str, Any]) -> dict[str, Any]:
    """Get current local time for timezone."""
    timezone = args.get("timezone") or "UTC"
    locale = args.get("locale") or "en-US"

    try:
        now = datetime.now()
        formatted = now.strftime("%Y-%m-%d %H:%M:%S")
        return {
            "timezone": timezone,
            "locale": locale,
            "formatted": formatted,
            "iso": now.isoformat(),
        }
    except Exception as e:
        raise ValueError(f"Time error: {e}")


def _split_sentences(text: str) -> list[str]:
    """Split text into sentences."""
    sentences = re.split(r"[.!?。！？]+", text)
    return [s.strip() for s in sentences if s.strip()]


async def _execute_summarize_text(args: dict[str, Any]) -> dict[str, Any]:
    """Summarize text by extracting leading sentences."""
    text = args.get("text", "")
    max_sentences = args.get("max_sentences", 3)
    max_chars = args.get("max_chars", 600)

    sentences = _split_sentences(text)[:max_sentences]
    summary = " ".join(sentences)
    if len(summary) > max_chars:
        summary = summary[:max_chars].strip()

    return {"summary": summary}


async def _execute_extract_text(args: dict[str, Any]) -> dict[str, Any]:
    """Extract sentences matching query keyword."""
    text = args.get("text", "")
    query = args.get("query", "").lower()
    max_sentences = args.get("max_sentences", 5)

    sentences = _split_sentences(text)
    matches = (
        [s for s in sentences if query in s.lower()]
        if query
        else sentences
    )

    return {"extracted": matches[:max_sentences]}


async def _execute_json_repair(args: dict[str, Any]) -> dict[str, Any]:
    """Validate and repair JSON."""
    text = args.get("text", "")

    try:
        data = json.loads(text)
        return {"valid": True, "repaired": text, "data": data}
    except json.JSONDecodeError:
        try:
            # Try to repair common JSON issues
            repaired = text.strip()
            repaired = re.sub(r",\s*}", "}", repaired)  # Remove trailing commas
            repaired = re.sub(r",\s*]", "]", repaired)
            data = json.loads(repaired)
            return {"valid": False, "repaired": repaired, "data": data}
        except json.JSONDecodeError as e:
            return {
                "valid": False,
                "error": f"Unable to repair JSON: {e}",
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
        raise ValueError(f"Webpage read failed: {e}")


def _resolve_tavily_api_key(tool_config: dict[str, Any]) -> str:
    """Resolve Tavily API key from configuration."""
    return (
        tool_config.get("tavilyApiKey")
        or tool_config.get("searchApiKey")
        or ""
    )


async def _execute_tavily_web_search(
    args: dict[str, Any],
    tool_config: dict[str, Any],
) -> dict[str, Any]:
    """Execute web search using Tavily API."""
    query = args.get("query", "")
    max_results = args.get("max_results", 5)
    api_key = _resolve_tavily_api_key(tool_config)

    if not api_key:
        raise ValueError("Tavily API key not configured")

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                "https://api.tavily.com/search",
                json={
                    "api_key": api_key,
                    "query": query,
                    "search_depth": "basic",
                    "include_answer": True,
                    "max_results": max_results,
                },
            )
            response.raise_for_status()
            data = response.json()

            return {
                "answer": data.get("answer", ""),
                "results": [
                    {
                        "title": r.get("title", ""),
                        "url": r.get("url", ""),
                        "content": r.get("content", ""),
                    }
                    for r in data.get("results", [])
                ],
            }
    except httpx.HTTPError as e:
        raise ValueError(f"Search failed: {e}")


# Academic domains for academic search
ACADEMIC_DOMAINS = [
    "arxiv.org",
    "scholar.google.com",
    "researchgate.net",
    "academia.edu",
    "semanticscholar.org",
    "pubmed.ncbi.nlm.nih.gov",
    "ieeexplore.ieee.org",
    "dl.acm.org",
    "springer.com",
    "sciencedirect.com",
    "nature.com",
    "science.org",
    "cell.com",
]


async def _execute_tavily_academic_search(
    args: dict[str, Any],
    tool_config: dict[str, Any],
) -> dict[str, Any]:
    """Execute academic search using Tavily API."""
    query = args.get("query", "")
    max_results = args.get("max_results", 5)
    api_key = _resolve_tavily_api_key(tool_config)

    if not api_key:
        raise ValueError("Tavily API key not configured")

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                "https://api.tavily.com/search",
                json={
                    "api_key": api_key,
                    "query": query,
                    "search_depth": "advanced",
                    "include_domains": ACADEMIC_DOMAINS,
                    "include_answer": True,
                    "max_results": max_results,
                },
            )
            response.raise_for_status()
            data = response.json()

            return {
                "answer": data.get("answer", ""),
                "results": [
                    {
                        "title": r.get("title", ""),
                        "url": r.get("url", ""),
                        "content": r.get("content", ""),
                    }
                    for r in data.get("results", [])
                ],
            }
    except httpx.HTTPError as e:
        raise ValueError(f"Academic search failed: {e}")


async def _execute_interactive_form(args: dict[str, Any]) -> dict[str, Any]:
    """Execute interactive form (returns form definition for frontend)."""
    return {
        "form_id": args.get("id"),
        "title": args.get("title"),
        "fields": args.get("fields", []),
        "status": "pending_user_input",
    }
