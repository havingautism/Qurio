"""
Custom local tools implemented as an Agno Toolkit.
"""

from __future__ import annotations

import ast
import asyncio
import concurrent.futures
import inspect
import json
import operator
import os
import re
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

import httpx
from agno.tools import Toolkit, tool

try:
    from ddgs import DDGS
except Exception:  # pragma: no cover - backward compatibility only
    from duckduckgo_search import DDGS

from .academic_domains import ACADEMIC_DOMAINS
from .html_widget_schema import build_html_widget_payload
from .skill_runtime import (
    execute_skill_script as execute_skill_script_runtime,
)
from .skill_runtime import (
    install_skill_dependency as install_skill_dependency_runtime,
)

FIXED_SEARCH_MAX_RESULTS = 5


def _tool_timeout_seconds(default: float = 20.0) -> float:
    raw = os.getenv("QURIO_TOOL_TIMEOUT_SECONDS", str(default))
    try:
        value = float(raw)
        if value <= 0:
            return default
        return value
    except (TypeError, ValueError):
        return default


def _run_blocking_with_timeout(fn: Any, timeout_sec: float | None = None) -> Any:
    timeout = timeout_sec if timeout_sec and timeout_sec > 0 else _tool_timeout_seconds()
    executor = concurrent.futures.ThreadPoolExecutor(max_workers=1)
    future = executor.submit(fn)
    try:
        return future.result(timeout=timeout)
    except concurrent.futures.TimeoutError as exc:
        future.cancel()
        # IMPORTANT: do not wait for the worker thread to finish, otherwise the timeout
        # handler itself can block and make the UI appear "stuck".
        executor.shutdown(wait=False, cancel_futures=True)
        raise TimeoutError(f"Tool execution timed out after {timeout:.1f}s") from exc
    finally:
        # If the future already completed (success/error), normal shutdown is safe.
        if future.done():
          executor.shutdown(wait=True, cancel_futures=False)


def _run_async_tool_sync(coro_factory: Any, timeout_sec: float | None = None) -> Any:
    return _run_blocking_with_timeout(lambda: asyncio.run(coro_factory()), timeout_sec=timeout_sec)


def _create_ddgs_client() -> Any:
    """
    Create a DDGS client with safe defaults to avoid long blocking calls.

    Notes:
    - Force impersonate="random" to avoid warnings about missing specific presets
      (e.g. firefox_109) in certain primp/ddgs combinations.
    - Apply request timeout to reduce hanging risk during provider/network issues.
    - Keep backward compatibility for older DDGS signatures.
    """
    timeout_sec = 12
    try:
        sig = inspect.signature(DDGS)
        supports_timeout = "timeout" in sig.parameters
        supports_impersonate = "impersonate" in sig.parameters
    except Exception:
        supports_timeout = True
        supports_impersonate = True

    kwargs: dict[str, Any] = {}
    if supports_timeout:
        kwargs["timeout"] = timeout_sec

    # Prefer a stable supported preset over ddgs/primp defaults that may log
    # warnings like "chrome_100 does not exist". If unsupported, fallback cleanly.
    impersonate_candidates = ["random", "chrome", "chrome_120", "chrome_124", None]
    if supports_impersonate:
        for preset in impersonate_candidates:
            try:
                if preset is None:
                    return DDGS(**kwargs)
                return DDGS(**kwargs, impersonate=preset)
            except TypeError:
                # Signature mismatch in older packages; continue fallback chain.
                continue
            except Exception as exc:
                if "Impersonate" in str(exc):
                    continue
                raise

    try:
        return DDGS(**kwargs)
    except TypeError:
        return DDGS()


def _normalize_list_input(val: Any) -> list[str]:
    """
    Robustly convert Any input to a list of strings.
    Handles:
    1. Actual lists: [1, 2] -> ["1", "2"]
    2. Stringified JSON lists: '["a", "b"]' -> ["a", "b"]
    3. Comma-separated strings: 'a, b' -> ["a", "b"]
    4. Single strings: 'a' -> ["a"]
    """
    if isinstance(val, list):
        return [str(i) for i in val]
    if isinstance(val, str):
        val = val.strip()
        if not val:
            return []
        if val.startswith("[") and val.endswith("]"):
            try:
                parsed = json.loads(val)
                if isinstance(parsed, list):
                    return [str(i) for i in parsed]
            except Exception:
                pass
        # Fallback to comma-separated if it's not a valid JSON list but contains commas
        if "," in val:
            return [i.strip() for i in val.split(",") if i.strip()]
        return [val]
    return []


@tool(
    name="interactive_form",
    external_execution=True,
    description=(
        "Display an interactive form to collect structured user input. "
        "This tool will pause execution and wait for user to submit the form. "
        "Use concise payloads: fields can be minimal and backend will fill defaults. "
        "At minimum provide a field name (or a short field label string)."
    )
)
def interactive_form(
    fields: list[dict[str, Any]] | list[str],
    id: str | None = None,
    title: str | None = None,
    description: str | None = None,
) -> str:
    """
    Display an interactive form to collect user input.

    Args:
        id: Optional identifier for the form
        title: Optional form title displayed to the user
        description: Optional form description
        fields: List of form fields, each containing:
            - name (str): Field identifier (preferred)
            - label (str): Display label (optional)
            - type (str): text, number, select, checkbox, range (optional)
            - required (bool): Whether field is required (optional)
            - placeholder (str): Placeholder text (optional)
            - options (list[str]): Options for select fields (optional)
            - min/max/step (number): Range constraints (optional)
            - unit (str): Unit for number fields (optional)
    """
    # This tool is executed externally by the frontend
    return "Form displayed"


class DuckDuckGoImageTools(Toolkit):
    def __init__(self, include_tools: list[str] | None = None) -> None:
        super().__init__(
            name="DuckDuckGoImageTools",
            tools=[self.duckduckgo_image_search],
            include_tools=include_tools,
        )

    @tool
    def duckduckgo_image_search(self, query: str) -> str:
        """
        Search for images using DuckDuckGo. Returns a list of image results with titles and URLs.

        Args:
            query (str): The search query.
        Returns:
            str: JSON string containing the image results.
        """
        limit = FIXED_SEARCH_MAX_RESULTS
        try:
            def _search():
                with _create_ddgs_client() as ddgs:
                    results = ddgs.images(query, max_results=limit)
                    return [
                        {
                            "title": r.get("title"),
                            "image": r.get("image"),
                            "url": r.get("url"),
                            "source": r.get("source"),
                        }
                        for r in results
                    ]

            output = _run_blocking_with_timeout(_search)
            return json.dumps(output, ensure_ascii=False)
        except TimeoutError as e:
            return json.dumps(
                {"query": query, "results": [], "error": str(e), "timed_out": True},
                ensure_ascii=False,
            )
        except Exception as e:
            return f"Error searching DuckDuckGo images: {str(e)}"

class DuckDuckGoVideoTools(Toolkit):
    """Video search using DuckDuckGo - zero config, always available."""

    def __init__(self, include_tools: list[str] | None = None) -> None:
        super().__init__(
            name="DuckDuckGoVideoTools",
            tools=[self.duckduckgo_video_search],
            include_tools=include_tools,
        )

    @tool
    def duckduckgo_video_search(self, query: str) -> str:
        """
        Search for videos using DuckDuckGo. Returns a list of video results with titles, URLs, and thumbnails.

        Args:
            query (str): The search query.
        Returns:
            str: JSON string containing the video results with title, url, thumbnail, source, duration.
        """
        limit = FIXED_SEARCH_MAX_RESULTS
        try:
            def _search():
                with _create_ddgs_client() as ddgs:
                    results = ddgs.videos(query, max_results=limit)
                    return [
                        {
                            "title": r.get("title"),
                            "url": r.get("content"),  # Video page URL
                            "thumbnail": r.get("image"),  # Thumbnail image URL
                            "source": r.get("author") or r.get("upstream") or "DuckDuckGo",
                            "duration": r.get("duration"),
                            "published": r.get("published"),
                        }
                        for r in results
                    ]

            output = _run_blocking_with_timeout(_search)
            return json.dumps(output, ensure_ascii=False)
        except TimeoutError as e:
            return json.dumps(
                {"query": query, "results": [], "error": str(e), "timed_out": True},
                ensure_ascii=False,
            )
        except Exception as e:
            return f"Error searching DuckDuckGo videos: {str(e)}"


class DuckDuckGoWebSearchTools(Toolkit):
    """Web/news search using DuckDuckGo with safe no-result handling."""

    def __init__(self, include_tools: list[str] | None = None, backend: str = "auto") -> None:
        self._backend = backend or "auto"
        super().__init__(
            name="DuckDuckGoWebSearchTools",
            tools=[self.web_search, self.search_news],
            include_tools=include_tools,
        )

    @tool
    def web_search(self, query: str) -> str:
        q = str(query or "").strip()
        limit = FIXED_SEARCH_MAX_RESULTS
        if not q:
            return json.dumps({"query": q, "results": [], "error": "Missing query"}, ensure_ascii=False)
        try:
            def _search():
                with _create_ddgs_client() as ddgs:
                    results = ddgs.text(query=q, max_results=limit, backend=self._backend)
                    return [
                        {
                            "title": item.get("title"),
                            "url": item.get("href") or item.get("url"),
                            "content": item.get("body") or item.get("snippet") or "",
                        }
                        for item in (results or [])
                    ]

            normalized = _run_blocking_with_timeout(_search)
            return json.dumps({"query": q, "results": normalized}, ensure_ascii=False)
        except TimeoutError as exc:
            return json.dumps(
                {"query": q, "results": [], "error": str(exc), "timed_out": True},
                ensure_ascii=False,
            )
        except Exception as exc:
            # ddgs raises on empty set in some versions; make it non-fatal.
            if "No results found" in str(exc):
                return json.dumps({"query": q, "results": []}, ensure_ascii=False)
            return json.dumps({"query": q, "results": [], "error": str(exc)}, ensure_ascii=False)

    @tool
    def search_news(self, query: str) -> str:
        q = str(query or "").strip()
        limit = FIXED_SEARCH_MAX_RESULTS
        if not q:
            return json.dumps({"query": q, "results": [], "error": "Missing query"}, ensure_ascii=False)
        try:
            def _search():
                with _create_ddgs_client() as ddgs:
                    results = ddgs.news(keywords=q, max_results=limit)
                    return [
                        {
                            "title": item.get("title"),
                            "url": item.get("url"),
                            "content": item.get("body") or item.get("excerpt") or "",
                            "date": item.get("date"),
                            "source": item.get("source"),
                        }
                        for item in (results or [])
                    ]

            normalized = _run_blocking_with_timeout(_search)
            return json.dumps({"query": q, "results": normalized}, ensure_ascii=False)
        except TimeoutError as exc:
            return json.dumps(
                {"query": q, "results": [], "error": str(exc), "timed_out": True},
                ensure_ascii=False,
            )
        except Exception as exc:
            if "No results found" in str(exc):
                return json.dumps({"query": q, "results": []}, ensure_ascii=False)
            return json.dumps({"query": q, "results": [], "error": str(exc)}, ensure_ascii=False)


class SerpApiImageTools(Toolkit):
    def __init__(self, api_key: str | None = None, include_tools: list[str] | None = None) -> None:
        self._api_key = api_key
        super().__init__(
            name="SerpApiImageTools",
            tools=[
                self.google_image_search,
                self.serpapi_image_search,
                self.bing_image_search,
            ],
            include_tools=include_tools,
        )

    @tool
    def google_image_search(self, query: str) -> str:
        """
        Search for images on Google using SerpApi. Returns a list of image results with titles and URLs.

        Args:
            query (str): The search query.
        Returns:
            str: JSON string containing the image results.
        """
        return _run_async_tool_sync(lambda: self._serpapi_search(query, engine="google_images"), 30.0)

    @tool
    def bing_image_search(self, query: str) -> str:
        """
        Search for images on Bing using SerpApi.

        Args:
            query (str): The search query.
        """
        return _run_async_tool_sync(lambda: self._serpapi_search(query, engine="bing_images"), 30.0)

    @tool
    def serpapi_image_search(self, query: str, engine: str = "google_images") -> str:
        """
        Search for images using various engines via SerpApi.
        Supported engines include: google_images, bing_images, yahoo_images.

        Args:
            query (str): The search query.
            engine (str): The search engine to use (default: google_images).
        Returns:
            str: JSON string containing the image results.
        """
        return _run_async_tool_sync(lambda: self._serpapi_search(query, engine=engine), 30.0)

    async def _serpapi_search(self, query: str, engine: str) -> str:
        """
        Internal helper for SerpApi search logic.
        """
        limit = FIXED_SEARCH_MAX_RESULTS
        api_key = self._api_key or os.getenv("SERPAPI_API_KEY")
        if not api_key:
            return "Error: SerpApi API key not configured."

        url = "https://serpapi.com/search"
        params = {
            "engine": engine,
            "q": query,
            "api_key": api_key,
        }

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(url, params=params)
                response.raise_for_status()
                data = response.json()

                # Most SerpApi image engines use 'images_results'
                results = data.get("images_results", [])
                output = []
                for r in results[:limit]:
                    # Harmonize different engine result structures if necessary
                    # For google_images, it's 'original' or 'thumbnail'
                    # For others, it's usually 'original' or 'thumbnail' as well
                    img_url = r.get("original") or r.get("thumbnail") or r.get("image")
                    output.append({
                        "title": r.get("title"),
                        "image": img_url,
                        "url": r.get("link"),
                        "source": r.get("source"),
                    })
                return json.dumps(output, ensure_ascii=False)
        except httpx.TimeoutException:
            return json.dumps(
                {"query": query, "results": [], "error": "Tool request timed out", "timed_out": True},
                ensure_ascii=False,
            )
        except Exception as e:
            return f"Error searching {engine} via SerpApi: {str(e)}"






class QurioLocalTools(Toolkit):
    def __init__(
        self,
        tavily_api_key: str | None = None,
        include_tools: list[str] | None = None,
    ) -> None:
        self._tavily_api_key = tavily_api_key
        tools = [
            self.calculator,
            self.local_time,
            self.summarize_text,
            self.extract_text,
            self.json_repair,
            self.render_html_widget,
            interactive_form,
            self.install_skill_dependency,
            self.execute_skill_script,
            self.webpage_reader,
            self.tavily_web_search,
            self.tavily_academic_search,
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
        except Exception as exc:
            return {"valid": False, "error": f"Unable to repair JSON: {exc}"}

    @tool(
        name="render_html_widget",
        description=(
            "Render a safe HTML widget for visual display. "
            "Use when structured visual output is more useful than plain text."
        ),
    )
    def render_html_widget(self, html: str, title: str = "", height: int = 360) -> dict[str, Any]:
        return build_html_widget_payload({"html": html, "title": title, "height": height})

    @tool(
        name="install_skill_dependency",
        description=(
            "Install a Python package into a skill-scoped virtual environment. "
            "Use only after the user explicitly approves installation, ideally via interactive_form."
        ),
    )
    def install_skill_dependency(self, skill_id: str, package_name: str) -> dict[str, Any]:
        """
        Install one Python package into `.skills/<skill_id>/.venv`.

        Args:
            skill_id: Existing skill id whose isolated environment should be used.
            package_name: Single package name containing only letters, numbers, and hyphens.
        """
        return _run_async_tool_sync(
            lambda: self._install_skill_dependency_async(skill_id, package_name),
            180.0,
        )

    async def _install_skill_dependency_async(
        self,
        skill_id: str,
        package_name: str,
    ) -> dict[str, Any]:
        try:
            return await install_skill_dependency_runtime(skill_id, package_name)
        except FileNotFoundError as exc:
            return {"success": False, "error": str(exc), "skill_id": skill_id, "package_name": package_name}
        except ValueError as exc:
            return {"success": False, "error": str(exc), "skill_id": skill_id, "package_name": package_name}
        except RuntimeError as exc:
            return {"success": False, "error": str(exc), "skill_id": skill_id, "package_name": package_name}

    @tool(
        name="execute_skill_script",
        description=(
            "Execute a script from a skill's scripts directory. "
            "Supports Python and Bash scripts and returns stdout/stderr."
        ),
    )
    def execute_skill_script(
        self,
        skill_id: str,
        script_path: str,
        args: Any = None,
        timeout_seconds: Any = 60.0,
    ) -> dict[str, Any]:
        """
        Execute one script located under `.skills/<skill_id>/scripts/`.

        Args:
            skill_id: Existing skill id containing the script.
            script_path: Relative path like scripts/foo.py or scripts/foo.sh.
            args: Optional CLI token array (for example: ["--keyword", "cat"]).
            timeout_seconds: Optional timeout before aborting execution.
        """
        try:
            resolved_timeout = float(timeout_seconds) if timeout_seconds else 60.0
        except (ValueError, TypeError):
            resolved_timeout = 60.0

        normalized_args = _normalize_list_input(args)
        return _run_async_tool_sync(
            lambda: self._execute_skill_script_async(
                skill_id=skill_id,
                script_path=script_path,
                args=normalized_args,
                timeout_seconds=resolved_timeout,
            ),
            resolved_timeout + 5.0,
        )

    async def _execute_skill_script_async(
        self,
        skill_id: str,
        script_path: str,
        args: list[str] | None = None,
        timeout_seconds: float = 60.0,
    ) -> dict[str, Any]:
        try:
            return await execute_skill_script_runtime(
                skill_id=skill_id,
                script_path=script_path,
                args=args,
                timeout_seconds=timeout_seconds,
            )
        except FileNotFoundError as exc:
            return {"success": False, "error": str(exc), "skill_id": skill_id, "script_path": script_path}
        except ValueError as exc:
            return {"success": False, "error": str(exc), "skill_id": skill_id, "script_path": script_path}
        except RuntimeError as exc:
            return {"success": False, "error": str(exc), "skill_id": skill_id, "script_path": script_path}

    @tool(name="webpage_reader", description="Read and scrape webpages, auto-detecting platform (WeChat, X/Twitter, Bilibili, YouTube, XHS, Telegram, RSS, etc.).")
    def webpage_reader(self, url: str) -> dict[str, Any]:
        """
        Fetch webpage or platform content and return structured text.

        Priority:
        1. x-reader (UniversalReader) — auto-detects platform and uses the best fetcher
        2. Jina.ai — generic fallback for any URL
        """
        return _run_async_tool_sync(lambda: self._webpage_reader_async(url), 30.0)

    async def _webpage_reader_async(self, url: str) -> dict[str, Any]:
        normalized = re.sub(r"^https?://r\.jina\.ai/", "", (url or "").strip())
        if not normalized:
            return {"error": "Missing required field: url"}

        # --- Attempt 1: x-reader UniversalReader ---
        try:
            from x_reader.reader import UniversalReader  # type: ignore[import]
            reader = UniversalReader()
            result = await asyncio.wait_for(reader.read(normalized), timeout=25.0)
            if result and getattr(result, "content", None):
                platform = str(getattr(result, "platform", "") or "unknown")
                return {
                    "url": normalized,
                    "title": getattr(result, "title", None) or "",
                    "content": result.content,
                    "source": f"x-reader/{platform}",
                    "platform": platform,
                }
        except ImportError:
            # x-reader not installed; fall through to Jina.ai
            pass
        except Exception as xr_err:
            # x-reader failed (network error, anti-scraping, etc.); log and fall through
            import logging
            logging.getLogger(__name__).warning(
                "x-reader failed for %s, falling back to Jina.ai: %s", normalized, xr_err
            )

        # --- Attempt 2: Jina.ai fallback ---
        request_url = f"https://r.jina.ai/{normalized}"
        try:
            timeout = httpx.Timeout(connect=8.0, read=18.0, write=8.0, pool=8.0)
            async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
                response = await client.get(request_url, headers={"Accept": "text/plain"})
                response.raise_for_status()
                content = response.text
            return {"url": normalized, "content": content, "source": "jina.ai"}
        except httpx.TimeoutException:
            return {
                "url": normalized,
                "error": "Webpage read timed out",
                "source": "jina.ai",
                "timed_out": True,
            }
        except httpx.ReadTimeout:
            return {
                "url": normalized,
                "error": "Webpage read timed out",
                "source": "jina.ai",
                "timed_out": True,
            }
        except httpx.HTTPError as exc:
            return {
                "url": normalized,
                "error": f"Webpage read failed: {exc}",
                "source": "jina.ai",
            }

    @tool(name="Tavily_web_search", description="Search the web for current information using Tavily API.")
    def tavily_web_search(self, query: str) -> dict[str, Any]:
        return _run_async_tool_sync(lambda: self._tavily_web_search_async(query), 30.0)

    async def _tavily_web_search_async(self, query: str) -> dict[str, Any]:
        limit = FIXED_SEARCH_MAX_RESULTS
        api_key = self._resolve_tavily_api_key()
        if not api_key:
            raise ValueError("Tavily API key not configured.")
        payload = {
            "api_key": api_key,
            "query": query,
            "search_depth": "basic",
            "include_answer": True,
            "max_results": limit,
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                response = await client.post("https://api.tavily.com/search", json=payload)
                response.raise_for_status()
                data = response.json()
            except httpx.TimeoutException:
                return {
                    "query": query,
                    "answer": "",
                    "results": [],
                    "error": "Tool request timed out",
                    "timed_out": True,
                }
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
    def tavily_academic_search(self, query: str, min_score: float = 0.9) -> dict[str, Any]:
        return _run_async_tool_sync(
            lambda: self._tavily_academic_search_async(query, min_score),
            30.0,
        )

    async def _tavily_academic_search_async(
        self,
        query: str,
        min_score: float = 0.9,
    ) -> dict[str, Any]:
        limit = FIXED_SEARCH_MAX_RESULTS
        try:
            score_threshold = float(min_score)
        except Exception:
            score_threshold = 0.9
        api_key = self._resolve_tavily_api_key()
        if not api_key:
            raise ValueError("Tavily API key not configured.")
        payload = {
            "api_key": api_key,
            "query": query,
            "search_depth": "advanced",
            "include_domains": ACADEMIC_DOMAINS,
            "include_answer": True,
            "max_results": limit,
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                response = await client.post("https://api.tavily.com/search", json=payload)
                response.raise_for_status()
                data = response.json()
            except httpx.TimeoutException:
                return {
                    "query": query,
                    "answer": "",
                    "results": [],
                    "query_type": "academic",
                    "error": "Tool request timed out",
                    "timed_out": True,
                }
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
                if float(item.get("score") or 0.0) > score_threshold
            ],
            "query_type": "academic",
            "min_score": score_threshold,
        }

    def _split_sentences(self, text: str) -> list[str]:
        parts = re.split(r"[.!?\u3002\uff01\uff1f]+", text or "")
        return [s.strip() for s in parts if s.strip()]

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
