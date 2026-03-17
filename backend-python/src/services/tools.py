"""
Local tool execution helpers (legacy support for non-Agno adapters).
"""

from __future__ import annotations

import ast
import asyncio
import json
import os
import re
from datetime import datetime
from typing import Any

import httpx

from .academic_domains import ACADEMIC_DOMAINS
from .html_widget_schema import build_html_widget_payload
from .skill_runtime import (
    execute_skill_script as execute_skill_script_runtime,
)
from .skill_runtime import (
    install_skill_dependency as install_skill_dependency_runtime,
)
from .tool_registry import (
    AGENT_TOOLS as REGISTRY_AGENT_TOOLS,
)
from .tool_registry import (
    ALL_TOOLS as REGISTRY_ALL_TOOLS,
)
from .tool_registry import (
    GLOBAL_TOOLS as REGISTRY_GLOBAL_TOOLS,
)
from .tool_registry import (
    LOCAL_TOOLS as REGISTRY_LOCAL_TOOLS,
)
from .tool_registry import (
    get_tool_definitions_by_ids as list_tool_definitions_by_ids,
)
from .tool_registry import (
    list_tools as list_tool_registry,
)
from .tool_registry import (
    resolve_tool_name,
)

CUSTOM_TOOLS = REGISTRY_LOCAL_TOOLS
EXTERNAL_SEARCH_TOOL_NAMES = {
    "web_search_using_tavily",
    "web_search_with_tavily",
    "extract_url_content",
    "web_search",
    "search_news",
    "search_arxiv_and_return_articles",
    "search_wikipedia",
}
FIXED_SEARCH_MAX_RESULTS = 5
AGENT_MEMORY_SCRIPT_COMMANDS = {
    "memory_store.py": "multi",
    "scripts/memory_store.py": "multi",
    "save_memory.py": "save",
    "scripts/save_memory.py": "save",
    "list_memories.py": "list",
    "scripts/list_memories.py": "list",
    "list_categories.py": "categories",
    "scripts/list_categories.py": "categories",
    "search_memories.py": "search",
    "scripts/search_memories.py": "search",
    "delete_memory.py": "delete",
    "scripts/delete_memory.py": "delete",
}


def _tool_timeout_seconds(default: float = 20.0) -> float:
    raw = os.getenv("QURIO_TOOL_TIMEOUT_SECONDS", str(default))
    try:
        value = float(raw)
        if value <= 0:
            return default
        return value
    except (TypeError, ValueError):
        return default


def _parse_loose_object(value: Any) -> dict[str, Any] | None:
    if isinstance(value, dict):
        return value
    if not isinstance(value, str):
        return None
    text = value.strip()
    if not text:
        return None
    for parser in (json.loads, ast.literal_eval):
        try:
            parsed = parser(text)
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            continue
    return None


def _coerce_agent_memory_args(script_path: str, raw_args: Any) -> list[str] | None:
    normalized_script = str(script_path or "").strip().replace("\\", "/").lower()
    script_mode = AGENT_MEMORY_SCRIPT_COMMANDS.get(normalized_script)
    if not script_mode:
        return None

    payload = _parse_loose_object(raw_args)
    if not payload:
        return None

    if script_mode == "multi":
        command = str(
            payload.get("command")
            or payload.get("action")
            or payload.get("operation")
            or ""
        ).strip().lower()
    else:
        command = script_mode

    if command in {"categories", "folders", "list-categories", "list-folders", "inspect"}:
        return ["categories"] if script_mode == "multi" else []

    if command in {"recall", "search", "find", "lookup"}:
        keyword = str(
            payload.get("keyword")
            or payload.get("query")
            or payload.get("text")
            or payload.get("term")
            or ""
        ).strip()
        category = str(payload.get("category") or "").strip()
        if not keyword:
            args = []
            if category:
                args.extend(["--category", category])
            if script_mode == "multi":
                args.insert(0, "list")
            return args
        args = ["--keyword", keyword]
        if category:
            args.extend(["--category", category])
        if script_mode == "multi":
            args.insert(0, "search")
        return args

    if command in {"list", "ls"}:
        category = str(payload.get("category") or "").strip()
        args = []
        if category:
            args.extend(["--category", category])
        if script_mode == "multi":
            args.insert(0, "list")
        return args

    if command in {"delete", "remove"}:
        category = str(payload.get("category") or "").strip()
        slug = str(payload.get("slug") or payload.get("name") or "").strip()
        if not category or not slug:
            return None
        args = ["--category", category, "--slug", slug]
        if script_mode == "multi":
            args.insert(0, "delete")
        return args

    if command in {"save", "remember", "store"}:
        category = str(payload.get("category") or "").strip()
        slug = str(payload.get("slug") or payload.get("name") or "").strip()
        summary = str(payload.get("summary") or "").strip()
        content = str(payload.get("content") or payload.get("text") or "").strip()
        if not category or not slug or not summary or not content:
            return None
        args = [
            "--category",
            category,
            "--slug",
            slug,
            "--summary",
            summary,
            "--content",
            content,
        ]
        title = str(payload.get("title") or "").strip()
        status = str(payload.get("status") or "").strip()
        tags = payload.get("tags")
        related = payload.get("related")
        overwrite = bool(payload.get("overwrite"))
        if title:
            args.extend(["--title", title])
        if status:
            args.extend(["--status", status])
        if isinstance(tags, list) and tags:
            args.extend(["--tags", ",".join(str(item).strip() for item in tags if str(item).strip())])
        if isinstance(related, list) and related:
            args.extend(["--related", ",".join(str(item).strip() for item in related if str(item).strip())])
        if overwrite:
            args.append("--overwrite")
        if script_mode == "multi":
            args.insert(0, "save")
        return args

    return None


def _normalize_agent_memory_list_args(script_path: str, raw_args: list[Any]) -> list[str]:
    normalized_script = str(script_path or "").strip().replace("\\", "/").lower()
    script_mode = AGENT_MEMORY_SCRIPT_COMMANDS.get(normalized_script)
    if not script_mode or script_mode == "multi":
        return [str(item) for item in raw_args]

    tokens = [str(item) for item in raw_args]
    if tokens and tokens[0].strip().lower() == script_mode:
        return tokens[1:]
    return tokens


def _is_agent_memory_search_call(script_path: str, raw_args: list[str]) -> bool:
    normalized_script = str(script_path or "").strip().replace("\\", "/").lower()
    script_mode = AGENT_MEMORY_SCRIPT_COMMANDS.get(normalized_script)
    if script_mode == "search":
        return True
    if script_mode == "multi" and raw_args:
        return raw_args[0].strip().lower() in {"search", "recall", "find", "lookup"}
    return False


def _extract_category_arg(raw_args: list[str]) -> str:
    for index, token in enumerate(raw_args):
        if token == "--category" and index + 1 < len(raw_args):
            return str(raw_args[index + 1]).strip()
    return ""


def _drop_category_arg(raw_args: list[str]) -> list[str]:
    next_args: list[str] = []
    skip_next = False
    for index, token in enumerate(raw_args):
        if skip_next:
            skip_next = False
            continue
        if token == "--category" and index + 1 < len(raw_args):
            skip_next = True
            continue
        next_args.append(token)
    return next_args


def _has_keyword_arg(raw_args: list[str]) -> bool:
    for index, token in enumerate(raw_args):
        if token == "--keyword" and index + 1 < len(raw_args):
            return bool(str(raw_args[index + 1]).strip())
    return False


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
        case "web_search_using_tavily":
            return await _execute_tavily_web_search(args, tool_config)
        case "web_search_with_tavily":
            return await _execute_tavily_web_search(args, tool_config, search_depth="advanced")
        case "search_arxiv_and_return_articles":
            return await _execute_tavily_academic_search(args, tool_config)
        case "web_search":
            return await _execute_tavily_web_search(args, tool_config)
        case "search_news":
            return await _execute_tavily_web_search(args, tool_config)
        case "search_wikipedia":
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
        case "install_skill_dependency":
            return await _execute_install_skill_dependency(args)
        case "execute_skill_script":
            return await _execute_execute_skill_script(args)
        case "webpage_reader":
            return await _execute_webpage_reader(args)
        case "Tavily_academic_search":
            return await _execute_tavily_academic_search(args, tool_config)
        case "extract_url_content":
            return await _execute_url_extract(args)
        case "render_html_widget":
            return await _execute_render_html_widget(args)
        case _:
            raise ValueError(f"Unknown local tool: {resolved_name}")


async def _execute_render_html_widget(args: dict[str, Any]) -> dict[str, Any]:
    return build_html_widget_payload(args)


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


async def _execute_install_skill_dependency(args: dict[str, Any]) -> dict[str, Any]:
    skill_id = str(args.get("skill_id") or "").strip()
    package_name = str(args.get("package_name") or "").strip()
    if not skill_id or not package_name:
        return {
            "success": False,
            "error": "skill_id and package_name are required",
            "skill_id": skill_id or None,
            "package_name": package_name or None,
        }
    try:
        return await install_skill_dependency_runtime(skill_id, package_name)
    except (FileNotFoundError, ValueError, RuntimeError) as exc:
        return {
            "success": False,
            "error": str(exc),
            "skill_id": skill_id,
            "package_name": package_name,
        }


async def _execute_execute_skill_script(args: dict[str, Any]) -> dict[str, Any]:
    skill_id = str(args.get("skill_id") or "").strip()
    script_path = str(args.get("script_path") or "").strip()
    raw_args = args.get("args") or []
    timeout_seconds = args.get("timeout_seconds") or 60.0
    if not skill_id or not script_path:
        return {
            "success": False,
            "error": "skill_id and script_path are required",
            "skill_id": skill_id or None,
            "script_path": script_path or None,
        }
    if skill_id == "agent-memory":
        coerced_args = _coerce_agent_memory_args(script_path, raw_args)
        if coerced_args:
            raw_args = coerced_args

    if not isinstance(raw_args, list):
        raw_args = [str(raw_args)]
    if skill_id == "agent-memory":
        raw_args = _normalize_agent_memory_list_args(script_path, raw_args)
    try:
        preflight_result: dict[str, Any] | None = None
        if skill_id == "agent-memory" and _is_agent_memory_search_call(script_path, raw_args):
            # Hard guardrail: memory retrieval must enumerate categories before search.
            preflight_result = await execute_skill_script_runtime(
                skill_id=skill_id,
                script_path="scripts/list_categories.py",
                args=[],
                timeout_seconds=float(timeout_seconds),
            )
            if not preflight_result.get("success"):
                return {
                    "success": False,
                    "error": "agent-memory preflight failed: unable to list categories before search",
                    "skill_id": skill_id,
                    "script_path": script_path,
                    "preflight": preflight_result,
                }
            category = _extract_category_arg(raw_args)
            if category:
                valid_categories: set[str] = set()
                try:
                    parsed = json.loads(str(preflight_result.get("stdout") or "{}"))
                    for item in parsed.get("items", []) or []:
                        name = str(item.get("category") or "").strip()
                        if name:
                            valid_categories.add(name)
                except Exception:
                    valid_categories = set()
                if valid_categories and category not in valid_categories:
                    raw_args = _drop_category_arg(raw_args)
            if not _has_keyword_arg(raw_args):
                category_for_list = _extract_category_arg(raw_args)
                list_args = ["--category", category_for_list] if category_for_list else []
                list_result = await execute_skill_script_runtime(
                    skill_id=skill_id,
                    script_path="scripts/list_memories.py",
                    args=list_args,
                    timeout_seconds=float(timeout_seconds),
                )
                list_result["preflight"] = preflight_result
                list_result["enforced_preflight"] = True
                list_result["fallback_from_search"] = True
                return list_result

        result = await execute_skill_script_runtime(
            skill_id=skill_id,
            script_path=script_path,
            args=[str(item) for item in raw_args],
            timeout_seconds=float(timeout_seconds),
        )
        if preflight_result is not None:
            result["preflight"] = preflight_result
            result["enforced_preflight"] = True
        return result
    except (FileNotFoundError, ValueError, RuntimeError) as exc:
        return {
            "success": False,
            "error": str(exc),
            "skill_id": skill_id,
            "script_path": script_path,
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
    search_depth: str = "basic",
) -> dict[str, Any]:
    query = str(args.get("query", "")).strip()
    max_results = FIXED_SEARCH_MAX_RESULTS
    if not query:
        raise ValueError("Missing required field: query")

    api_key = _resolve_tavily_api_key(tool_config)
    if not api_key:
        raise ValueError("Tavily API key not configured.")

    payload = {
        "api_key": api_key,
        "query": query,
        "search_depth": search_depth,
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
    max_results = FIXED_SEARCH_MAX_RESULTS
    try:
        min_score = float(args.get("min_score", 0.9))
    except Exception:
        min_score = 0.9
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
            if float(item.get("score") or 0.0) > min_score
        ],
        "query_type": "academic",
        "min_score": min_score,
    }


async def _execute_url_extract(args: dict[str, Any]) -> dict[str, Any]:
    urls = args.get("urls") or args.get("url") or ""
    if isinstance(urls, str):
        url_list = [u.strip() for u in urls.split(",") if u.strip()]
    elif isinstance(urls, list):
        url_list = [str(u).strip() for u in urls if str(u).strip()]
    else:
        url_list = []

    if not url_list:
        raise ValueError("Missing required field: urls")

    results = []
    for url in url_list:
        try:
            content_result = await _execute_webpage_reader({"url": url})
            results.append(
                {
                    "url": content_result.get("url") or url,
                    "content": content_result.get("content") or "",
                    "title": content_result.get("title") or "",
                }
            )
        except Exception as exc:
            results.append({"url": url, "error": str(exc)})

    return {"results": results}


def is_local_tool_name(tool_name: str) -> bool:
    resolved = resolve_tool_name(tool_name)
    return any(t["id"] == resolved for t in CUSTOM_TOOLS)


async def execute_tool_by_name(
    tool_name: str,
    args: dict[str, Any],
    tool_config: dict[str, Any] | None = None,
) -> dict[str, Any]:
    resolved_name = resolve_tool_name(tool_name)
    if is_local_tool_name(resolved_name) or resolved_name in EXTERNAL_SEARCH_TOOL_NAMES:
        timeout_sec = _tool_timeout_seconds()
        try:
            return await asyncio.wait_for(
                execute_local_tool(resolved_name, args, tool_config),
                timeout=timeout_sec,
            )
        except TimeoutError:
            return {
                "error": f"Tool '{resolved_name}' timed out after {timeout_sec:.1f}s",
                "timed_out": True,
                "tool": resolved_name,
                "args": args or {},
            }
        except Exception as exc:
            return {
                "error": str(exc),
                "timed_out": False,
                "tool": resolved_name,
                "args": args or {},
            }
    raise ValueError(f"Tool {resolved_name} not found")


GLOBAL_TOOLS = REGISTRY_GLOBAL_TOOLS
AGENT_TOOLS = REGISTRY_AGENT_TOOLS
ALL_TOOLS = REGISTRY_ALL_TOOLS
