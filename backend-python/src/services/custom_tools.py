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
from .skill_runtime import (
    execute_skill_script as execute_skill_script_runtime,
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
        prefetched_memory_domains: list[dict[str, Any]] | None = None,
    ) -> None:
        self._tavily_api_key = tavily_api_key
        self._prefetched_memory_domains = (
            prefetched_memory_domains if isinstance(prefetched_memory_domains, list) else []
        )
        tools = [
            self.calculator,
            self.local_time,
            self.summarize_text,
            self.extract_text,
            self.json_repair,
            interactive_form,
            self.install_skill_dependency,
            self.execute_skill_script,
            self.webpage_reader,
            self.tavily_web_search,
            self.tavily_academic_search,
            self.memory_retrieve,
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
        except Exception as exc:
            return {"valid": False, "error": f"Unable to repair JSON: {exc}"}

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
        args: list[str] | None = None,
        timeout_seconds: float = 60.0,
    ) -> dict[str, Any]:
        """
        Execute one script located under `.skills/<skill_id>/scripts/`.

        Args:
            skill_id: Existing skill id containing the script.
            script_path: Relative path like scripts/foo.py or scripts/foo.sh.
            args: Optional positional arguments.
            timeout_seconds: Optional timeout before aborting execution.
        """
        resolved_timeout = float(timeout_seconds) if timeout_seconds else 60.0
        return _run_async_tool_sync(
            lambda: self._execute_skill_script_async(
                skill_id=skill_id,
                script_path=script_path,
                args=args,
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

    def _normalize_aliases(self, aliases: Any) -> list[str]:
        if isinstance(aliases, list):
            return [str(item).strip() for item in aliases if str(item).strip()]
        if isinstance(aliases, str):
            stripped = aliases.strip()
            if not stripped:
                return []
            if stripped.startswith("["):
                try:
                    parsed = json.loads(stripped)
                    if isinstance(parsed, list):
                        return [str(item).strip() for item in parsed if str(item).strip()]
                except Exception:
                    return []
            return [stripped]
        return []

    def _normalize_prefetched_domains(self) -> list[dict[str, Any]]:
        normalized: list[dict[str, Any]] = []
        for row in self._prefetched_memory_domains or []:
            if not isinstance(row, dict):
                continue
            domain_key = str(row.get("domain_key") or "").strip()
            if not domain_key:
                continue
            latest_summary = row.get("latest_summary")
            if not isinstance(latest_summary, dict):
                latest_summary = None
            normalized.append(
                {
                    "id": row.get("id"),
                    "domain_key": domain_key,
                    "aliases": self._normalize_aliases(row.get("aliases")),
                    "scope": str(row.get("scope") or "").strip(),
                    "updated_at": row.get("updated_at"),
                    "latest_summary": latest_summary,
                }
            )
        return normalized

    def _load_domain_summaries(
        self,
        domain_ids: list[Any],
        database_provider: str | None = None,
    ) -> dict[str, dict[str, Any]]:
        if not domain_ids:
            return {}
        try:
            from ..models.db import DbFilter, DbOrder, DbQueryRequest
            from .db_service import get_db_adapter

            adapter = get_db_adapter(database_provider)
            if not adapter:
                return {}

            req = DbQueryRequest(
                providerId=adapter.config.id,
                action="select",
                table="memory_summaries",
                columns=["id", "domain_id", "summary", "updated_at"],
                filters=[DbFilter(op="in", column="domain_id", values=domain_ids)],
                order=[DbOrder(column="updated_at", ascending=False)],
                limit=max(1, len(domain_ids) * 3),
            )
            res = adapter.execute(req)
            rows = res.data if isinstance(res.data, list) else []

            by_domain: dict[str, dict[str, Any]] = {}
            for row in rows:
                if not isinstance(row, dict):
                    continue
                domain_id = row.get("domain_id")
                if domain_id is None:
                    continue
                key = str(domain_id)
                if key in by_domain:
                    continue
                by_domain[key] = row
            return by_domain
        except Exception:
            return {}

    def _load_all_memory_domains(
        self,
        user_id: str | None = None,
        database_provider: str | None = None,
    ) -> list[dict[str, Any]]:
        try:
            from ..models.db import DbFilter, DbOrder, DbQueryRequest
            from .db_service import get_db_adapter

            adapter = get_db_adapter(database_provider)
            if not adapter:
                return []

            filters: list[DbFilter] = []
            if user_id:
                filters.append(DbFilter(op="eq", column="user_id", value=user_id))

            req = DbQueryRequest(
                providerId=adapter.config.id,
                action="select",
                table="memory_domains",
                columns=["id", "domain_key", "aliases", "scope", "updated_at"],
                filters=filters or None,
                order=[DbOrder(column="updated_at", ascending=False)],
                limit=200,
            )
            res = adapter.execute(req)
            rows = res.data if isinstance(res.data, list) else []
            normalized: list[dict[str, Any]] = []
            for row in rows:
                if not isinstance(row, dict):
                    continue
                domain_key = str(row.get("domain_key") or "").strip()
                if not domain_key:
                    continue
                normalized.append(
                    {
                        "id": row.get("id"),
                        "domain_key": domain_key,
                        "aliases": self._normalize_aliases(row.get("aliases")),
                        "scope": str(row.get("scope") or "").strip(),
                        "updated_at": row.get("updated_at"),
                        "latest_summary": None,
                    }
                )
            return normalized
        except Exception:
            return []

    @tool(
        name="memory_retrieve",
        description=(
            "Two-step memory retrieval: list domains first, then fetch summaries for selected domain_keys."
        ),
    )
    def memory_retrieve(
        self,
        action: str = "list",
        query: str = "",
        domain_keys: Any = None,
        include_summary: bool = False,
        limit: int = 8,
        user_id: str | None = None,
        database_provider: str | None = None,
    ) -> str:
        try:
            normalized_limit = max(1, min(int(limit or 8), 20))
        except Exception:
            normalized_limit = 8

        resolved_keys: list[str] = []
        if isinstance(domain_keys, list):
            resolved_keys = [str(item).strip() for item in domain_keys if str(item).strip()]
        elif isinstance(domain_keys, dict):
            resolved_keys = [
                str(key).strip()
                for key, value in domain_keys.items()
                if str(key).strip() and bool(value)
            ]
        elif isinstance(domain_keys, str):
            raw = domain_keys.strip()
            if raw:
                if raw.startswith("["):
                    try:
                        parsed = json.loads(raw)
                        if isinstance(parsed, list):
                            resolved_keys = [
                                str(item).strip() for item in parsed if str(item).strip()
                            ]
                    except Exception:
                        resolved_keys = []
                elif "," in raw:
                    resolved_keys = [part.strip() for part in raw.split(",") if part.strip()]
                else:
                    resolved_keys = [raw]

        action_raw = str(action or "").strip().lower()
        action_alias = {
            "list": "list",
            "domains": "list",
            "list_domains": "list",
            "select": "list",
            "fetch": "fetch",
            "summary": "fetch",
            "summaries": "fetch",
            "fetch_summary": "fetch",
            "fetch_summaries": "fetch",
        }
        resolved_action = action_alias.get(action_raw, "fetch" if include_summary else "list")

        domains = self._normalize_prefetched_domains()
        source = "prefetch"
        if not domains:
            domains = self._load_all_memory_domains(
                user_id=user_id,
                database_provider=database_provider,
            )
            source = "database"

        query_lower = str(query or "").strip().lower()
        key_set = {k.lower() for k in resolved_keys}

        def _score(item: dict[str, Any]) -> int:
            domain_key = str(item.get("domain_key") or "").lower()
            aliases = [str(alias).lower() for alias in item.get("aliases") or []]
            scope = str(item.get("scope") or "").lower()
            text = f"{domain_key} {' '.join(aliases)} {scope}".strip()
            if key_set:
                return 100 if domain_key in key_set else 0
            if not query_lower:
                return 1
            score = 0
            if query_lower in text:
                score += 10
            for token in re.split(r"[\s,;|]+", query_lower):
                token = token.strip()
                if len(token) < 2:
                    continue
                if token in text:
                    score += 1
            return score

        ranked = []
        for item in domains:
            score = _score(item)
            if score <= 0:
                continue
            ranked.append((score, item))
        ranked.sort(key=lambda pair: pair[0], reverse=True)

        selected = [item for _, item in ranked[:normalized_limit]]
        if not selected and resolved_action == "list" and not query_lower and not key_set:
            selected = domains[:normalized_limit]

        if resolved_action == "fetch" and not selected and not key_set and not query_lower:
            return json.dumps(
                {
                    "status": "invalid_request",
                    "error": "For action='fetch', provide domain_keys (preferred) or query.",
                    "instruction": (
                        "Step 1: call memory_retrieve(action='list', include_summary=false). "
                        "Step 2: pick domain_keys and call memory_retrieve(action='fetch', domain_keys=[...], include_summary=true)."
                    ),
                },
                ensure_ascii=False,
            )

        effective_include_summary = bool(include_summary and resolved_action == "fetch")
        summary_map: dict[str, dict[str, Any]] = {}
        if effective_include_summary:
            missing_ids: list[Any] = []
            for domain in selected:
                latest = domain.get("latest_summary")
                summary_text = (latest or {}).get("summary") if isinstance(latest, dict) else None
                if not str(summary_text or "").strip() and domain.get("id") is not None:
                    missing_ids.append(domain.get("id"))
            summary_map = self._load_domain_summaries(
                domain_ids=missing_ids,
                database_provider=database_provider,
            )

        result_domains: list[dict[str, Any]] = []
        for domain in selected:
            latest = domain.get("latest_summary") if isinstance(domain.get("latest_summary"), dict) else {}
            row: dict[str, Any] = {
                "id": domain.get("id"),
                "domain_key": domain.get("domain_key"),
                "aliases": domain.get("aliases") or [],
                "scope": domain.get("scope") or "",
                "updated_at": domain.get("updated_at"),
            }
            if effective_include_summary:
                summary_row = summary_map.get(str(domain.get("id")))
                row["summary"] = latest.get("summary") or (summary_row or {}).get("summary")
            result_domains.append(row)

        payload = {
            "status": "ok",
            "action": resolved_action,
            "source": source,
            "query": query,
            "matched_count": len(result_domains),
            "domains": result_domains,
        }
        return json.dumps(payload, ensure_ascii=False)

    def _load_existing_memory_summary(
        self,
        domain_key: str,
        user_id: str | None = None,
        database_provider: str | None = None,
    ) -> dict[str, Any] | None:
        try:
            from ..models.db import DbFilter, DbOrder, DbQueryRequest
            from .db_service import get_db_adapter

            adapter = get_db_adapter(database_provider)
            if not adapter:
                return None

            # Single-user deployment: lookup only by domain_key and take latest row.
            filters = [DbFilter(op="eq", column="domain_key", value=domain_key)]

            domain_req = DbQueryRequest(
                providerId=adapter.config.id,
                action="select",
                table="memory_domains",
                columns=["id", "domain_key", "aliases", "scope", "user_id"],
                filters=filters,
                order=[DbOrder(column="updated_at", ascending=False)],
                limit=1,
            )
            domain_res = adapter.execute(domain_req)
            domain_row = domain_res.data[0] if isinstance(domain_res.data, list) and domain_res.data else None
            if domain_res.error or not domain_row or not isinstance(domain_row, dict):
                return None

            domain_id = domain_row.get("id")
            if not domain_id:
                return None

            summary_req = DbQueryRequest(
                providerId=adapter.config.id,
                action="select",
                table="memory_summaries",
                columns=["id", "domain_id", "summary", "updated_at"],
                filters=[DbFilter(op="eq", column="domain_id", value=domain_id)],
                order=[DbOrder(column="updated_at", ascending=False)],
                limit=1,
            )
            summary_res = adapter.execute(summary_req)
            summary_row = (
                summary_res.data[0]
                if isinstance(summary_res.data, list) and summary_res.data
                else None
            )

            return {
                "domain_id": domain_id,
                "domain_key": domain_row.get("domain_key"),
                "user_id": domain_row.get("user_id"),
                "aliases": domain_row.get("aliases"),
                "scope": domain_row.get("scope"),
                "summary_id": (summary_row or {}).get("id"),
                "summary": (summary_row or {}).get("summary"),
                "updated_at": (summary_row or {}).get("updated_at"),
            }
        except Exception:
            return None

    @tool(
        name="memory_update",
        description=(
            "Manage long-term memory for a specific domain. "
            "Prefer reusing an existing domain_key whenever possible. "
            "Use operation='add' to append/create, operation='upsert' to update/overwrite, "
            "and operation='delete' to remove a memory domain. "
            "For operation='upsert' on an existing domain, set based_on_existing=true "
            "after reviewing existing_memory."
        ),
    )
    def memory_update(
        self,
        domain_key: str,
        summary: str | None = None,
        based_on_existing: bool = False,
        aliases: Any = None,
        scope: str = "",
        operation: str = "upsert",
        user_id: str | None = None,
        database_provider: str | None = None,
    ) -> str:
        """
        No-op implementation for backend. The real save happens on the frontend asynchronously.
        Resilience: Handles models that pass aliases as stringified JSON arrays instead of proper lists.
        """
        if not str(domain_key or "").strip():
            return json.dumps(
                {
                    "status": "invalid_request",
                    "error": "domain_key is required",
                },
                ensure_ascii=False,
            )

        operation_raw = str(operation or "upsert").strip().lower()
        operation_aliases = {
            "create": "add",
            "insert": "add",
            "add": "add",
            "update": "upsert",
            "modify": "upsert",
            "edit": "upsert",
            "upsert": "upsert",
            "overwrite": "upsert",
            "replace": "upsert",
            "delete": "delete",
            "remove": "delete",
            "del": "delete",
        }
        resolved_operation = operation_aliases.get(operation_raw)
        if not resolved_operation:
            return json.dumps(
                {
                    "status": "invalid_request",
                    "error": "operation must be one of: add, upsert, delete",
                },
                ensure_ascii=False,
            )

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
                parsed = json.loads(aliases)
                if isinstance(parsed, list):
                    actual_aliases = parsed
            except (ValueError, json.JSONDecodeError):
                pass

        existing_memory = self._load_existing_memory_summary(
            domain_key=domain_key,
            user_id=user_id,
            database_provider=database_provider,
        )

        if resolved_operation == "upsert" and not str(summary or "").strip():
            payload = {
                "status": "needs_summary",
                "operation": "upsert",
                "domain_key": domain_key,
                "existing_memory": existing_memory,
                "instruction": (
                    "Read existing_memory.summary if present, then call memory_update again "
                    "with operation='upsert', based_on_existing=true, and a full replacement summary."
                ),
            }
            return json.dumps(payload, ensure_ascii=False)

        if (
            resolved_operation == "upsert"
            and existing_memory
            and str(existing_memory.get("summary") or "").strip()
            and based_on_existing is not True
        ):
            payload = {
                "status": "needs_reference_existing",
                "operation": "upsert",
                "domain_key": domain_key,
                "existing_memory": existing_memory,
                "instruction": (
                    "This domain already has memory. Re-read existing_memory.summary, then call "
                    "memory_update again with based_on_existing=true and the rewritten full summary."
                ),
            }
            return json.dumps(payload, ensure_ascii=False)

        if resolved_operation == "add" and not str(summary or "").strip():
            return json.dumps(
                {
                    "status": "invalid_request",
                    "operation": "add",
                    "domain_key": domain_key,
                    "error": "summary is required when operation is add",
                    "instruction": "Retry memory_update with a non-empty summary.",
                },
                ensure_ascii=False,
            )

        # Frontend reads tool args and applies async DB write.
        if resolved_operation == "delete":
            payload = {
                "status": "accepted",
                "operation": "delete",
                "domain_key": domain_key,
                "existing_memory": existing_memory,
                "message": f"Memory delete accepted for domain '{domain_key}'.",
            }
            return json.dumps(payload, ensure_ascii=False)
        if resolved_operation == "add":
            payload = {
                "status": "accepted",
                "operation": "add",
                "domain_key": domain_key,
                "user_id": user_id,
                "aliases": actual_aliases,
                "scope": scope,
                "summary": summary,
                "existing_memory": existing_memory,
                "message": f"Memory add accepted for domain '{domain_key}'.",
            }
            return json.dumps(payload, ensure_ascii=False)

        payload = {
            "status": "accepted",
            "operation": "upsert",
            "domain_key": domain_key,
            "user_id": user_id,
            "based_on_existing": based_on_existing,
            "aliases": actual_aliases,
            "scope": scope,
            "summary": summary,
            "existing_memory": existing_memory,
            "message": f"Memory upsert accepted for domain '{domain_key}'.",
        }
        return json.dumps(payload, ensure_ascii=False)

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
