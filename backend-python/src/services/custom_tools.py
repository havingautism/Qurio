"""
Custom local tools implemented as an Agno Toolkit.
"""

from __future__ import annotations

import ast
import json
import operator
import os
import re
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

import httpx
from agno.tools import Function, Toolkit, tool

from .academic_domains import ACADEMIC_DOMAINS


def _interactive_form_impl(id: str, title: str, fields: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "form_id": id,
        "title": title,
        "fields": fields,
        "status": "pending_user_input",
    }


interactive_form = Function(
    name="interactive_form",
    description="Display an interactive form to collect structured user input.",
    parameters={
        "type": "object",
        "properties": {
            "id": {"type": "string"},
            "title": {"type": "string"},
            "fields": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": ["name", "label", "type"],
                    "properties": {
                        "name": {"type": "string", "description": "Field identifier"},
                        "label": {"type": "string", "description": "Display label for the field"},
                        "type": {"type": "string", "enum": ["text", "number", "select", "checkbox", "range"]},
                        "required": {"type": "boolean"},
                        "placeholder": {"type": "string"},
                        "options": {"type": "array", "items": {"type": "string"}},
                        "min": {"type": "number"},
                        "max": {"type": "number"},
                        "step": {"type": "number"},
                        "unit": {"type": "string"},
                        "default": {"type": ["string", "number"]},
                    },
                    "additionalProperties": False,
                },
            },
        },
        "required": ["id", "title", "fields"],
        "additionalProperties": False,
    },
    strict=True,
    entrypoint=_interactive_form_impl,
)


class QurioLocalTools(Toolkit):
    def __init__(self, tavily_api_key: str | None = None, include_tools: list[str] | None = None) -> None:
        self._tavily_api_key = tavily_api_key
        tools = [
            self.calculator,
            self.local_time,
            self.summarize_text,
            self.extract_text,
            self.json_repair,
            interactive_form,
            self.webpage_reader,
            self.webpage_reader,
            self.tavily_web_search,
            self.tavily_academic_search,
            self.memory_update,
        ]
        super().__init__(name="QurioLocalTools", tools=tools, include_tools=include_tools)

    @tool(name="calculator", description="Evaluate a math expression safely.")
    def calculator(self, expression: str) -> dict[str, Any]:
        value = _safe_eval_math(expression)
        return {"result": value}

    @tool(name="local_time", description="Get current local date and time for a timezone.")
    def local_time(self, timezone: str = "UTC", locale: str = "en-US") -> dict[str, Any]:
        try:
            tzinfo = ZoneInfo(timezone)
            now = datetime.now(tzinfo)
        except Exception:
            now = datetime.now()
        return {
            "timezone": timezone,
            "locale": locale,
            "formatted": now.strftime("%Y-%m-%d %H:%M:%S"),
            "iso": now.isoformat(),
        }

    @tool(name="summarize_text", description="Summarize text by extracting leading sentences.")
    def summarize_text(self, text: str, max_sentences: int = 3, max_chars: int = 600) -> dict[str, Any]:
        sentences = self._split_sentences(text)[:max_sentences]
        summary = " ".join(sentences)
        if len(summary) > max_chars:
            summary = summary[:max_chars].strip()
        return {"summary": summary}

    @tool(name="extract_text", description="Extract relevant sentences by query keyword.")
    def extract_text(self, text: str, query: str = "", max_sentences: int = 5) -> dict[str, Any]:
        query_lower = (query or "").lower()
        sentences = self._split_sentences(text)
        matches = [s for s in sentences if query_lower in s.lower()] if query_lower else sentences
        return {"extracted": matches[:max_sentences]}

    @tool(name="json_repair", description="Validate and repair JSON text.")
    def json_repair(self, text: str) -> dict[str, Any]:
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

    @tool(name="webpage_reader", description="Read and scrape webpages.")
    async def webpage_reader(self, url: str) -> dict[str, Any]:
        normalized = re.sub(r"^https?://r\.jina\.ai/", "", url.strip())
        request_url = f"https://r.jina.ai/{normalized}"
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(request_url, headers={"Accept": "text/plain"})
            response.raise_for_status()
            content = response.text
        return {"url": normalized, "content": content, "source": "jina.ai"}

    @tool(name="Tavily_web_search", description="Search the web for current information using Tavily API.")
    async def tavily_web_search(self, query: str, max_results: int = 5) -> dict[str, Any]:
        api_key = self._resolve_tavily_api_key()
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

    @tool(
        name="Tavily_academic_search",
        description="Search academic sources using Tavily API with advanced depth.",
    )
    async def tavily_academic_search(self, query: str, max_results: int = 5) -> dict[str, Any]:
        api_key = self._resolve_tavily_api_key()
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

    def _split_sentences(self, text: str) -> list[str]:
        parts = re.split(r"[.!?\u3002\uff01\uff1f]+", text or "")
        return [s.strip() for s in parts if s.strip()]

    @tool(
        name="memory_update",
        description="Updates or adds a specific domain of long-term memory about the user.",
    )
    def memory_update(self, domain_key: str, summary: str, aliases: Any = None, scope: str = "") -> str:
        """
        No-op implementation for backend. The real save happens on the frontend asynchronously.
        Resilience: Handles models that pass aliases as stringified JSON arrays instead of proper lists.
        """
        # Actual validation/parsing of aliases is handled here to satisfy Pydantic
        actual_aliases = []
        if isinstance(aliases, list):
            actual_aliases = aliases
        elif isinstance(aliases, dict):
            # Handle dictionary-style aliases (keys and string values)
            actual_aliases = [str(k) for k in aliases.keys()] + [
                str(v) for v in aliases.values() if isinstance(v, (str, int, float))
            ]
        elif isinstance(aliases, str) and aliases.strip().startswith("["):
            try:
                import json

                parsed = json.loads(aliases)
                if isinstance(parsed, list):
                    actual_aliases = parsed
            except:
                pass

        return f"Memory domain '{domain_key}' updated successfully."

    def _resolve_tavily_api_key(self) -> str:
        if self._tavily_api_key:
            return self._tavily_api_key
        env_key = os.getenv("TAVILY_API_KEY") or os.getenv("PUBLIC_TAVILY_API_KEY")
        return env_key or ""


def _safe_eval_math(expression: str) -> float:
    if not isinstance(expression, str) or not expression.strip():
        raise ValueError("Expression is required")
    sanitized = expression.replace("^", "**")

    try:
        node = ast.parse(sanitized, mode="eval")
    except SyntaxError as exc:
        raise ValueError(f"Invalid expression: {exc}") from exc

    operators = {
        ast.Add: operator.add,
        ast.Sub: operator.sub,
        ast.Mult: operator.mul,
        ast.Div: operator.truediv,
        ast.FloorDiv: operator.floordiv,
        ast.Mod: operator.mod,
        ast.Pow: operator.pow,
        ast.UAdd: operator.pos,
        ast.USub: operator.neg,
    }

    def _eval(node_obj: ast.AST) -> float:
        if isinstance(node_obj, ast.Expression):
            return _eval(node_obj.body)
        if isinstance(node_obj, ast.Constant):
            if isinstance(node_obj.value, (int, float)):
                return float(node_obj.value)
            raise ValueError("Unsupported constant")
        if isinstance(node_obj, ast.Num):
            return float(node_obj.n)
        if isinstance(node_obj, ast.BinOp):
            if type(node_obj.op) not in operators:
                raise ValueError("Unsupported operator")
            return operators[type(node_obj.op)](_eval(node_obj.left), _eval(node_obj.right))
        if isinstance(node_obj, ast.UnaryOp):
            if type(node_obj.op) not in operators:
                raise ValueError("Unsupported operator")
            return operators[type(node_obj.op)](_eval(node_obj.operand))
        raise ValueError("Unsupported expression")

    return _eval(node)
