"""
Agent registry built with Agno SDK (Agent + AgentOS).
"""

from __future__ import annotations

import os
from types import SimpleNamespace
from typing import Any

from agno.agent import Agent

# from agno.db.postgres import PostgresDb
# from agno.memory import MemoryManager
from agno.models.google import Gemini
from agno.models.openai import OpenAILike

# from agno.session.summary import SessionSummaryManager
from agno.utils.log import logger

from ..config import get_settings
from .custom_tools import (
    DuckDuckGoImageTools,
    DuckDuckGoVideoTools,
    DuckDuckGoWebSearchTools,
    QurioLocalTools,
    SerpApiImageTools,
)
from .tool_registry import AGNO_TOOLS, IMAGE_SEARCH_TOOLS, LOCAL_TOOLS, VIDEO_SEARCH_TOOLS, resolve_tool_name
from .user_tools import build_user_tools_toolkit

DEFAULT_MODELS: dict[str, str] = {
    "openai": os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
    "openai_compatibility": os.getenv("OPENAI_COMPAT_MODEL", "gpt-4o-mini"),
    "siliconflow": os.getenv("SILICONFLOW_MODEL", "Qwen/Qwen2.5-7B-Instruct"),
    "glm": os.getenv("GLM_MODEL", "glm-4-flash"),
    "deepseek": os.getenv("DEEPSEEK_MODEL", "deepseek-chat"),
    "volcengine": os.getenv("VOLCENGINE_MODEL", "doubao-seed-1-6-thinking-250615"),
    "modelscope": os.getenv("MODELSCOPE_MODEL", "AI-ModelScope/glm-4-9b-chat"),
    "kimi": os.getenv("KIMI_MODEL", "moonshot-v1-8k"),
    "gemini": os.getenv("GEMINI_MODEL", "gemini-2.0-flash-exp"),
    "nvidia": os.getenv("NVIDIA_MODEL", "deepseek-ai/deepseek-r1"),
    "minimax": os.getenv("MINIMAX_MODEL", "minimax-m2"),
}

DEFAULT_BASE_URLS: dict[str, str] = {
    "openai": os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1"),
    "openai_compatibility": os.getenv("OPENAI_COMPAT_BASE_URL", "https://api.openai.com/v1"),
    "siliconflow": os.getenv("SILICONFLOW_BASE_URL", "https://api.siliconflow.cn/v1"),
    "glm": os.getenv("GLM_BASE_URL", "https://open.bigmodel.cn/api/paas/v4"),
    "deepseek": os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1"),
    "volcengine": os.getenv("VOLCENGINE_BASE_URL", "https://ark.cn-beijing.volces.com/api/v3"),
    "modelscope": os.getenv("MODELSCOPE_BASE_URL", "https://api-inference.modelscope.cn/v1"),
    "kimi": os.getenv("KIMI_BASE_URL", "https://api.moonshot.cn/v1"),
    "nvidia": os.getenv("NVIDIA_BASE_URL", "https://integrate.api.nvidia.com/v1"),
    "minimax": os.getenv("MINIMAX_BASE_URL", "https://api.minimax.io/v1"),
}

# These will be initialized within functions using get_settings() to ensure .env is loaded
# MEMORY_LITE_PROVIDER = ...
# MEMORY_LITE_MODEL = ...
# MEMORY_LITE_BASE_URL = ...
# MEMORY_AGENT_API_KEY = ...


# Global database instance to avoid multiple table definitions in SQLAlchemy
# Global database instance to avoid multiple table definitions in SQLAlchemy
# _agent_db was removed as we use DbAdapter pattern.



def _build_model(provider: str, api_key: str | None, base_url: str | None, model: str | None):
    provider_key = provider or "openai"
    model_id = model or DEFAULT_MODELS.get(provider_key) or DEFAULT_MODELS["openai"]
    resolved_base = base_url or DEFAULT_BASE_URLS.get(provider_key) or DEFAULT_BASE_URLS["openai"]

    if provider_key == "gemini":
        return Gemini(id=model_id, api_key=api_key)

    return OpenAILike(id=model_id, api_key=api_key, base_url=resolved_base)



def _merge_model_dict_attr(model: Any, attr: str, payload: dict[str, Any]) -> None:
    if not payload:
        return
    current = getattr(model, attr, None)
    if current is None:
        setattr(model, attr, dict(payload))
    elif isinstance(current, dict):
        merged = {**current, **payload}
        setattr(model, attr, merged)


def _apply_common_params(model: Any, request: Any) -> None:
    if request.temperature is not None and hasattr(model, "temperature"):
        model.temperature = request.temperature
    if request.top_p is not None and hasattr(model, "top_p"):
        model.top_p = request.top_p
    if request.frequency_penalty is not None and hasattr(model, "frequency_penalty"):
        model.frequency_penalty = request.frequency_penalty
    if request.presence_penalty is not None and hasattr(model, "presence_penalty"):
        model.presence_penalty = request.presence_penalty

    if request.top_k is not None:
        if hasattr(model, "top_k"):
            model.top_k = request.top_k
        else:
            _merge_model_dict_attr(model, "extra_body", {"top_k": request.top_k})


def _apply_thinking_params(model: Any, provider: str, thinking: dict[str, Any] | bool | None) -> None:
    if not thinking:
        return

    if provider == "gemini":
        if isinstance(thinking, dict):
            config = thinking.get("thinkingConfig") or thinking.get("thinking_config") or {}
            include = config.get("includeThoughts") or config.get("include_thoughts")
            budget = config.get("thinkingBudget") or config.get("thinking_budget")
            level = config.get("thinkingLevel") or config.get("thinking_level")
            if include is not None and hasattr(model, "include_thoughts"):
                model.include_thoughts = include
            if budget is not None and hasattr(model, "thinking_budget"):
                model.thinking_budget = budget
            if level is not None and hasattr(model, "thinking_level"):
                model.thinking_level = level
        elif hasattr(model, "include_thoughts"):
            model.include_thoughts = True
        return

    if provider in {"siliconflow", "modelscope"}:
        budget = None
        if isinstance(thinking, dict):
            budget = thinking.get("budget_tokens") or thinking.get("budgetTokens")
        if budget is None:
            budget = 1024
        model_id_lower = str(getattr(model, "id", "") or "").lower()
        is_siliconflow_kimi_thinking = (
            provider == "siliconflow"
            and "kimi" in model_id_lower
            and "thinking" in model_id_lower
        )
        # SiliconFlow Kimi-thinking models may reject `enable_thinking`.
        if is_siliconflow_kimi_thinking:
            _merge_model_dict_attr(model, "extra_body", {"thinking_budget": budget})
            current_extra = getattr(model, "extra_body", None)
            if isinstance(current_extra, dict) and "enable_thinking" in current_extra:
                merged = dict(current_extra)
                merged.pop("enable_thinking", None)
                setattr(model, "extra_body", merged)
        else:
            _merge_model_dict_attr(
                model,
                "extra_body",
                {"enable_thinking": True, "thinking_budget": budget},
            )
        # _merge_model_dict_attr(
        #     model,
        #     "request_params",
        #     {"enable_thinking": True, "thinking_budget": budget},
        # )
        return

    if provider == "nvidia":
        _merge_model_dict_attr(model, "extra_body", {"chat_template_kwargs": {"thinking": True}})
        return

    if provider == "minimax":
        if isinstance(thinking, dict) and isinstance(thinking.get("extra_body"), dict):
            _merge_model_dict_attr(model, "extra_body", thinking.get("extra_body"))
        else:
            _merge_model_dict_attr(model, "extra_body", {"reasoning_split": True})
        return

    if provider in {"glm", "deepseek", "volcengine"}:
        if isinstance(thinking, dict) and thinking.get("type"):
            payload = {"thinking": {"type": thinking.get("type")}}
            _merge_model_dict_attr(model, "extra_body", payload)
            # _merge_model_dict_attr(model, "request_params", payload)
        return

    if provider == "kimi":
        if isinstance(thinking, dict):
            max_tokens = thinking.get("max_tokens")
            temperature = thinking.get("temperature")
            if max_tokens is not None and hasattr(model, "max_tokens"):
                model.max_tokens = max_tokens
            if temperature is not None and hasattr(model, "temperature"):
                model.temperature = temperature
        return

    if provider == "openai_compatibility":
        if isinstance(thinking, dict):
            extra_body = thinking.get("extra_body")
            if isinstance(extra_body, dict):
                _merge_model_dict_attr(model, "extra_body", extra_body)
        return


def _apply_model_settings(model: Any, request: Any) -> None:
    _apply_common_params(model, request)
    _apply_thinking_params(model, request.provider, request.thinking)


def _collect_enabled_tool_names(request: Any) -> list[str]:
    names: list[str] = []
    if request.provider != "gemini":
        for tool_id in request.tool_ids or []:
            names.append(resolve_tool_name(str(tool_id)))
    for tool_def in request.tools or []:
        if hasattr(tool_def, "model_dump"):
            tool_def = tool_def.model_dump()
        name = tool_def.get("function", {}).get("name") if isinstance(tool_def, dict) else None
        if name:
            names.append(resolve_tool_name(name))
    for user_tool in request.user_tools or []:
        if getattr(user_tool, "name", None):
            names.append(str(user_tool.name))
        elif isinstance(user_tool, dict) and user_tool.get("name"):
            names.append(str(user_tool["name"]))
    return names


def _build_tools(request: Any) -> list[Any]:
    enabled_names = set(_collect_enabled_tool_names(request))
    if not enabled_names and not request.user_tools:
        return []
    serpapi_api_key = getattr(request, "serpapi_api_key", None)

    local_tool_names = {tool["name"] for tool in LOCAL_TOOLS}
    include_local = sorted([name for name in enabled_names if name in local_tool_names])
    tools: list[Any] = []

    if include_local:
        tools.append(
            QurioLocalTools(
                tavily_api_key=request.tavily_api_key,
                include_tools=include_local,
                prefetched_memory_domains=getattr(request, "memory_domains_prefetch", None),
            )
        )

    agno_tool_names = {tool["name"] for tool in AGNO_TOOLS}
    include_agno = sorted([name for name in enabled_names if name in agno_tool_names])

    # Always include zero-config image/video search tools by default if not explicitly disabled
    # SerpApi-based tools are only included if API key is configured
    if not getattr(request, "skip_default_tools", False):
        # Zero-config tools (DuckDuckGo) - always include
        default_image_tools = {"duckduckgo_image_search"}
        default_video_tools = {"duckduckgo_video_search"}

        # SerpApi-based tools - only include if API key is available
        serpapi_image_tools = {"google_image_search", "serpapi_image_search", "bing_image_search"}
        serpapi_video_tools = {"search_youtube"}

        default_tools = default_image_tools | default_video_tools
        if serpapi_api_key:
            default_tools = default_tools | serpapi_image_tools | serpapi_video_tools

        include_agno = sorted(list(set(include_agno) | default_tools))

    if include_agno:
        tools.extend(_build_agno_toolkits(request, include_agno))

    user_toolkit = build_user_tools_toolkit(
        [tool.model_dump() if hasattr(tool, "model_dump") else tool for tool in request.user_tools or []]
    )
    if user_toolkit:
        tools.append(user_toolkit)

    mcp_url = os.getenv("MCP_SERVER_URL")
    if mcp_url:
        try:
            from agno.tools.mcp import MCPTools
        except Exception:
            MCPTools = None
        if MCPTools:
            tools.append(MCPTools(url=mcp_url, transport=os.getenv("MCP_TRANSPORT", "streamable-http")))

    return tools


def _build_agno_toolkits(request: Any, include_agno: list[str]) -> list[Any]:
    toolkits: list[Any] = []
    include_set = set(include_agno)
    serpapi_api_key = getattr(request, "serpapi_api_key", None)

    tavily_tools = {"web_search_using_tavily", "web_search_with_tavily", "extract_url_content"}
    if include_set.intersection(tavily_tools):
        try:
            from agno.tools.tavily import TavilyTools
        except Exception:
            TavilyTools = None
        if TavilyTools:
            selected = [name for name in include_agno if name in tavily_tools]
            toolkits.append(TavilyTools(api_key=request.tavily_api_key, include_tools=selected))

    websearch_tools = {"web_search", "search_news"}
    if include_set.intersection(websearch_tools):
        selected = [name for name in include_agno if name in websearch_tools]
        backend = getattr(request, "search_backend", None) or "auto"
        toolkits.append(
            DuckDuckGoWebSearchTools(
                include_tools=selected,
                backend=backend,
            )
        )

    arxiv_tools = {"search_arxiv_and_return_articles", "read_arxiv_papers"}
    if include_set.intersection(arxiv_tools):
        try:
            from agno.tools.arxiv import ArxivTools
        except Exception:
            ArxivTools = None
        if ArxivTools:
            selected = [name for name in include_agno if name in arxiv_tools]
            toolkits.append(ArxivTools(include_tools=selected))

    wikipedia_tools = {"search_wikipedia"}
    if include_set.intersection(wikipedia_tools):
        try:
            from agno.tools.wikipedia import WikipediaTools
        except Exception:
            WikipediaTools = None
        if WikipediaTools:
            toolkits.append(WikipediaTools(include_tools=["search_wikipedia"]))

    yfinance_tools = {
        "get_current_stock_price",
        "get_company_info",
        "get_stock_fundamentals",
        "get_income_statements",
        "get_key_financial_ratios",
        "get_analyst_recommendations",
        "get_company_news",
        "get_technical_indicators",
        "get_historical_stock_prices",
    }
    if include_set.intersection(yfinance_tools):
        try:
            from agno.tools.yfinance import YFinanceTools
        except Exception:
            YFinanceTools = None
        if YFinanceTools:
            selected = [name for name in include_agno if name in yfinance_tools]
            toolkits.append(YFinanceTools(include_tools=selected))

    image_search_tools = {
        "duckduckgo_image_search",
        "google_image_search",
        "serpapi_image_search",
        "bing_image_search",
    }
    if include_set.intersection(image_search_tools):
        # DuckDuckGo Image Search (Custom) - always available, no config needed
        if "duckduckgo_image_search" in include_set:
            toolkits.append(DuckDuckGoImageTools(include_tools=["duckduckgo_image_search"]))

        # SerpApi Image Search (Custom) - only add if API key is configured
        serpapi_tools = {
            "google_image_search",
            "serpapi_image_search",
            "bing_image_search",
        }
        serpapi_include = sorted([name for name in include_set if name in serpapi_tools])
        # Only add SerpApi tools if API key is available
        if serpapi_include and serpapi_api_key:
            toolkits.append(
                SerpApiImageTools(
                    api_key=serpapi_api_key, include_tools=serpapi_include
                )
            )

    video_search_tools = {
        "duckduckgo_video_search",
        "search_youtube",
    }
    if include_set.intersection(video_search_tools):
        # DuckDuckGo Video Search (Custom) - always available, no config needed
        if "duckduckgo_video_search" in include_set:
            toolkits.append(DuckDuckGoVideoTools(include_tools=["duckduckgo_video_search"]))

        # YouTube Search via SerpApi - only add if API key is configured
        if "search_youtube" in include_set and serpapi_api_key:
            try:
                from agno.tools.serpapi import SerpApiTools as AgnoSerpApiTools
            except Exception:
                AgnoSerpApiTools = None
            if AgnoSerpApiTools:
                toolkits.append(
                    AgnoSerpApiTools(
                        api_key=serpapi_api_key,
                        enable_search_google=False,
                        enable_search_youtube=True,
                    )
                )

    return toolkits


def get_summary_model(request: Any) -> Any | None:
    """
    Get the lite model for session summary generation from environment variables.
    
    This is a simplified implementation that uses global configuration.
    Future enhancement: Support per-agent lite_model from database.
    
    Returns:
        Agno model instance for summary generation, or None if unavailable
    """
    settings = get_settings()
    try:
        # Priority: Request params > Global Settings
        # Priority: Request params (summary_*) > Global Settings (summary_*)
        lite_provider = getattr(request, "summary_provider", None) or settings.summary_lite_provider
        lite_model = getattr(request, "summary_model", None) or settings.summary_lite_model
        lite_api_key = getattr(request, "summary_api_key", None) or settings.summary_agent_api_key
        lite_base_url = getattr(request, "summary_base_url", None) or settings.summary_lite_base_url

        if not lite_model or not lite_api_key:
            logger.warning("Lite Model not configured (checked request summary_* params and SUMMARY_LITE_MODEL env var)")
            return None

        source = "Request-Specific" if getattr(request, "summary_model", None) else "Global-Default"
        logger.info(f"[{source}] Selected Lite Model for Session Summary: {lite_provider}/{lite_model}")

        # If no base_url provided, use the default for the provider
        resolved_base = lite_base_url or DEFAULT_BASE_URLS.get(lite_provider) or DEFAULT_BASE_URLS["openai"]

        summary_model = _build_model(lite_provider, lite_api_key, resolved_base, lite_model)

        # Disable native structured outputs for summary model to ensure robust parsing with non-OpenAI providers (like GLM)
        # This only affects this specific summary_model instance.
        if hasattr(summary_model, "supports_native_structured_outputs"):
            summary_model.supports_native_structured_outputs = False

        return summary_model

    except Exception as exc:
        logger.warning(f"Failed to build lite_model for session summary: {exc}")
        return None



def build_agent(request: Any = None, **kwargs: Any) -> Agent:
    # Backward-compatible shim for legacy build_agent(provider=..., api_key=...) calls.
    if request is None or kwargs:
        provider = request if isinstance(request, str) else kwargs.get("provider")
        request = SimpleNamespace(
            provider=provider or "openai",
            api_key=kwargs.get("api_key"),
            base_url=kwargs.get("base_url"),
            model=kwargs.get("model"),
            tavily_api_key=kwargs.get("tavily_api_key"),
            temperature=kwargs.get("temperature"),
            top_p=kwargs.get("top_p"),
            top_k=kwargs.get("top_k"),
            frequency_penalty=kwargs.get("frequency_penalty"),
            presence_penalty=kwargs.get("presence_penalty"),
            thinking=kwargs.get("thinking"),
            tool_ids=kwargs.get("tool_ids"),
            tools=kwargs.get("tools"),
            user_tools=kwargs.get("user_tools"),
            tool_choice=kwargs.get("tool_choice"),
        )

    model = _build_model(request.provider, request.api_key, request.base_url, request.model)
    _apply_model_settings(model, request)
    tools = _build_tools(request)
    # memory_kwargs = _build_memory_kwargs(request)
    tool_choice = request.tool_choice
    if tool_choice is None and tools:
        tool_choice = "auto"

    # 1. Conditional instructions: Multi-form guidance & Image/Video rendering
    enabled_names = set(_collect_enabled_tool_names(request))
    # Add image and video search tools to enabled_names set since they are forced
    image_search_names = {tool["name"] for tool in IMAGE_SEARCH_TOOLS}
    video_search_names = {tool["name"] for tool in VIDEO_SEARCH_TOOLS}
    enabled_names.update(image_search_names)
    enabled_names.update(video_search_names)

    instructions_list = []
    if "interactive_form" in enabled_names:
        instructions_list.append(
            "When using the interactive_form tool to collect user information: "
            "If the user's initial responses lack critical details needed to fulfill their request, "
            "you MUST call interactive_form again to gather the missing specific information. "
            "Do not proceed with incomplete information. "
            "However, limit to 2-3 forms maximum per conversation to respect user time."
        )

    if "duckduckgo_image_search" in enabled_names or "google_image_search" in enabled_names:
        instructions_list.append(
            "When explaining concepts that can benefit from visual aids (like Logo, diagrams, or photos), "
            "you should use the image search tools to find relevant images. "
            "ALWAYS render images in your response using markdown format: ![caption](url). "
            "Place images appropriately within your explanation to enhance user understanding."
        )

    if "duckduckgo_video_search" in enabled_names or "search_youtube" in enabled_names:
        instructions_list.append(
            "When users ask about tutorials, demonstrations, or topics that benefit from video content, "
            "you should use the video search tools to find relevant videos. "
            "ALWAYS include video links in your response using markdown format with descriptive text. "
            "Provide context about why each video is relevant to the user's query."
        )

    instructions = "\n\n".join(instructions_list) if instructions_list else None

    # 2. Agent Construction (Stateless / Manual Context)
    # We do NOT inject 'db' or 'memory' here.
    # Session context (history + summary) is injected manually in stream_chat.py

    return Agent(
        id=f"qurio-{request.provider}",
        name=f"Qurio {request.provider} Agent",
        model=model,
        tools=tools or None,
        markdown=True,
        tool_choice=tool_choice,
        instructions=instructions,
    )



def build_memory_agent(
    user_id: str | None = None,
    provider: str | None = None,
    model: str | None = None,
    base_url: str | None = None,
    api_key: str | None = None,
) -> Agent:
    settings = get_settings()
    resolved_provider = provider or settings.memory_lite_provider
    resolved_model = model or settings.memory_lite_model
    resolved_api_key = api_key or settings.memory_agent_api_key or os.getenv("OPENAI_API_KEY")
    resolved_base_url = (
        base_url
        or DEFAULT_BASE_URLS.get(resolved_provider)
        or DEFAULT_BASE_URLS["openai"]
    )

    memory_request = SimpleNamespace(
        provider=resolved_provider,
        api_key=resolved_api_key,
        base_url=resolved_base_url,
        model=resolved_model,
        tavily_api_key=os.getenv("TAVILY_API_KEY"),
        temperature=None,
        top_p=None,
        top_k=None,
        frequency_penalty=None,
        presence_penalty=None,
        thinking=None,
        tool_ids=[],
        tools=None,
        user_tools=None,
        tool_choice=None,
        enable_long_term_memory=True,
        database_provider="supabase",
        user_id=user_id,
    )
    return build_agent(memory_request)


def get_agent_for_provider(request: Any) -> Agent:
    return build_agent(request)
