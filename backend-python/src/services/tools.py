"""
Local tool execution helpers (legacy support for non-Agno adapters).
"""

from __future__ import annotations

import json
import os
import re
from datetime import datetime
from typing import Any

import httpx

from .academic_domains import ACADEMIC_DOMAINS
from .tool_registry import (
    ALL_TOOLS as REGISTRY_ALL_TOOLS,
    AGENT_TOOLS as REGISTRY_AGENT_TOOLS,
    GLOBAL_TOOLS as REGISTRY_GLOBAL_TOOLS,
    LOCAL_TOOLS as REGISTRY_LOCAL_TOOLS,
    get_tool_definitions_by_ids as list_tool_definitions_by_ids,
    list_tools as list_tool_registry,
    resolve_tool_name,
)

CUSTOM_TOOLS = REGISTRY_LOCAL_TOOLS


def list_tools() -> list[dict[str, Any]]:
    return list_tool_registry()


def get_tool_definitions_by_ids(tool_ids: list[str]) -> list[dict[str, Any]]:
    return list_tool_definitions_by_ids(tool_ids)


async def execute_local_tool(
    tool_name: str,
    args: dict[str, Any],
    tool_config: dict[str, Any] | None = None,
) -> dict[str, Any]:
    resolved_name = resolve_tool_name(tool_name)

    match resolved_name:
        case "Tavily_web_search":
            return await _execute_tavily_web_search(args, tool_config)
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
        case "Tavily_academic_search":
            return await _execute_tavily_academic_search(args, tool_config)
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
    except Exception as exc:
        raise ValueError(f"Time error: {exc}")


def _split_sentences(text: str) -> list[str]:
    sentences = re.split(r"[.!?\u3002\uff01\uff1f]+", text or "")
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
        except Exception as exc:
            return {"valid": False, "error": f"Unable to repair JSON: {exc}"}


async def _execute_interactive_form(args: dict[str, Any]) -> dict[str, Any]:
    return {
        "form_id": args.get("id"),
        "title": args.get("title"),
        "fields": args.get("fields", []),
        "status": "pending_user_input",
    }


async def _execute_webpage_reader(args: dict[str, Any]) -> dict[str, Any]:
    url = args.get("url", "").strip()
    normalized = re.sub(r"^https?://r\.jina\.ai/", "", url)
    request_url = f"https://r.jina.ai/{normalized}"

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(request_url, headers={"Accept": "text/plain"})
            response.raise_for_status()
            content = response.text
            return {
                "url": normalized,
                "content": content,
                "source": "jina.ai",
            }
    except httpx.HTTPError as exc:
        return {"error": f"Webpage read failed: {str(exc)}"}


def _resolve_tavily_api_key(tool_config: dict[str, Any] | None) -> str:
    if tool_config and tool_config.get("tavilyApiKey"):
        return str(tool_config["tavilyApiKey"])
    if tool_config and tool_config.get("searchProvider") == "tavily":
        if tool_config.get("searchApiKey"):
            return str(tool_config["searchApiKey"])
    env_key = os.getenv("TAVILY_API_KEY") or os.getenv("PUBLIC_TAVILY_API_KEY")
    return env_key or ""


async def _execute_tavily_web_search(
    args: dict[str, Any],
    tool_config: dict[str, Any] | None = None,
) -> dict[str, Any]:
    query = str(args.get("query", "")).strip()
    max_results = int(args.get("max_results") or 5)
    if not query:
        raise ValueError("Missing required field: query")

    api_key = _resolve_tavily_api_key(tool_config)
    if not api_key:
        raise ValueError("Tavily API key not configured.")

    payload = {
        "api_key": api_key,
        "query": query,
        "search_depth": "basic",
        "include_answer": True,
        "max_results": max_results,
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post("https://api.tavily.com/search", json=payload)
        response.raise_for_status()
        data = response.json()

    return {
        "answer": data.get("answer"),
        "results": [
            {
                "title": item.get("title"),
                "url": item.get("url"),
                "content": item.get("content"),
            }
            for item in data.get("results", []) or []
        ],
    }


async def _execute_tavily_academic_search(
    args: dict[str, Any],
    tool_config: dict[str, Any] | None = None,
) -> dict[str, Any]:
    query = str(args.get("query", "")).strip()
    max_results = int(args.get("max_results") or 5)
    if not query:
        raise ValueError("Missing required field: query")

    api_key = _resolve_tavily_api_key(tool_config)
    if not api_key:
        raise ValueError("Tavily API key not configured.")

    payload = {
        "api_key": api_key,
        "query": query,
        "search_depth": "advanced",
        "include_domains": ACADEMIC_DOMAINS,
        "include_answer": True,
        "max_results": max_results,
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post("https://api.tavily.com/search", json=payload)
        response.raise_for_status()
        data = response.json()

    return {
        "answer": data.get("answer"),
        "results": [
            {
                "title": item.get("title"),
                "url": item.get("url"),
                "content": item.get("content"),
                "score": item.get("score"),
            }
            for item in data.get("results", []) or []
        ],
        "query_type": "academic",
    }


def is_local_tool_name(tool_name: str) -> bool:
    resolved = resolve_tool_name(tool_name)
    return any(t["id"] == resolved for t in CUSTOM_TOOLS)


async def execute_tool_by_name(
    tool_name: str,
    args: dict[str, Any],
    tool_config: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if is_local_tool_name(tool_name):
        return await execute_local_tool(tool_name, args, tool_config)
    raise ValueError(f"Tool {tool_name} not found")


GLOBAL_TOOLS = REGISTRY_GLOBAL_TOOLS
AGENT_TOOLS = REGISTRY_AGENT_TOOLS
ALL_TOOLS = REGISTRY_ALL_TOOLS
