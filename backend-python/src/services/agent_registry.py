"""
Agent registry built with Agno SDK (Agent + AgentOS).
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from types import SimpleNamespace
from typing import Any

from agno.agent import Agent

# from agno.db.postgres import PostgresDb
# from agno.memory import MemoryManager
from agno.models.deepseek import DeepSeek
from agno.models.google import Gemini
try:
    from agno.models.huggingface import HuggingFace
except Exception:  # pragma: no cover - optional dependency
    HuggingFace = None
from agno.models.nvidia import Nvidia
try:
    from agno.models.litellm import LiteLLMOpenAI
except Exception:  # pragma: no cover - optional dependency
    LiteLLMOpenAI = None
try:
    from agno.models.openrouter import OpenRouter
except Exception:  # pragma: no cover - optional dependency
    OpenRouter = None
from agno.models.openai import OpenAILike
from agno.models.siliconflow import Siliconflow
from agno.skills import LocalSkills, Skills

# from agno.session.summary import SessionSummaryManager
from agno.utils.log import logger

from ..config import get_settings
from ..models.db import DbFilter, DbQueryRequest
from .custom_tools import (
    DuckDuckGoImageTools,
    DuckDuckGoVideoTools,
    DuckDuckGoWebSearchTools,
    QurioLocalTools,
    SerpApiImageTools,
)
from .db_service import get_db_adapter
from .tool_registry import (
    AGNO_TOOLS,
    IMAGE_SEARCH_TOOLS,
    LOCAL_TOOLS,
    VIDEO_SEARCH_TOOLS,
    resolve_tool_name,
)
from .user_tools import build_user_tools_toolkit

try:
    from agno.tools.exa import ExaTools
except Exception:
    ExaTools = None

try:
    from agno.tools.hackernews import HackerNewsTools
except Exception:
    HackerNewsTools = None

EXA_SEARCH_TOOL_SET = {"search_exa"}
EXA_ALLOWED_CATEGORIES = {
    "company",
    "research paper",
    "news",
    "pdf",
    "github",
    "tweet",
    "personal site",
    "linkedin profile",
    "financial report",
}
EXA_TIMEOUT_SECONDS = max(
    15,
    int(os.getenv("EXA_TOOLS_TIMEOUT_SECONDS", os.getenv("EXA_MCP_TIMEOUT_SECONDS", "45"))),
)

DEFAULT_MODELS: dict[str, str] = {
    "openai": os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
    "openai_compatibility": os.getenv("OPENAI_COMPAT_MODEL", "gpt-4o-mini"),
    "openrouter": os.getenv("OPENROUTER_MODEL", "openai/gpt-4o-mini"),
    "litellm_openai": os.getenv("LITELLM_MODEL", "gpt-5-mini"),
    "huggingface": os.getenv(
        "HUGGINGFACE_MODEL",
        "meta-llama/Meta-Llama-3.1-8B-Instruct",
    ),
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
    "openrouter": os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"),
    "litellm_openai": os.getenv("LITELLM_BASE_URL", "http://0.0.0.0:4000"),
    "huggingface": os.getenv("HUGGINGFACE_BASE_URL", ""),
    "siliconflow": os.getenv("SILICONFLOW_BASE_URL", "https://api.siliconflow.cn/v1"),
    "glm": os.getenv("GLM_BASE_URL", "https://open.bigmodel.cn/api/paas/v4"),
    "deepseek": os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1"),
    "volcengine": os.getenv("VOLCENGINE_BASE_URL", "https://ark.cn-beijing.volces.com/api/v3"),
    "modelscope": os.getenv("MODELSCOPE_BASE_URL", "https://api-inference.modelscope.cn/v1"),
    "kimi": os.getenv("KIMI_BASE_URL", "https://api.moonshot.cn/v1"),
    "nvidia": os.getenv("NVIDIA_BASE_URL", "https://integrate.api.nvidia.com/v1"),
    "minimax": os.getenv("MINIMAX_BASE_URL", "https://api.minimax.io/v1"),
}

OFFICIAL_PROVIDER_CACHE_SUPPORTED = {"nvidia", "siliconflow", "deepseek"}
AGNO_RESPONSE_CACHE_DIR = (
    Path(__file__).resolve().parents[2] / ".cache" / "agno" / "model_responses"
)
_cache_ttl_raw = os.getenv("AGNO_RESPONSE_CACHE_TTL_SECONDS", "3600").strip()
AGNO_RESPONSE_CACHE_TTL_SECONDS = int(_cache_ttl_raw) if _cache_ttl_raw else None

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
    resolved_base = base_url or DEFAULT_BASE_URLS.get(provider_key) or None

    if provider_key == "gemini":
        return Gemini(id=model_id, api_key=api_key)
    if provider_key == "openrouter":
        if OpenRouter is None:
            raise ImportError("OpenRouter support requires agno.models.openrouter and its dependencies")
        return OpenRouter(id=model_id, api_key=api_key, base_url=resolved_base or DEFAULT_BASE_URLS["openrouter"])
    if provider_key == "litellm_openai":
        if LiteLLMOpenAI is None:
            raise ImportError("LiteLLM support requires agno.models.litellm and its dependencies")
        return LiteLLMOpenAI(id=model_id, api_key=api_key, base_url=resolved_base or DEFAULT_BASE_URLS["litellm_openai"])
    if provider_key == "huggingface":
        if HuggingFace is None:
            raise ImportError("HuggingFace support requires agno.models.huggingface and its dependencies")
        return HuggingFace(id=model_id, api_key=api_key, base_url=resolved_base or None)
    if provider_key == "nvidia":
        return Nvidia(id=model_id, api_key=api_key, base_url=resolved_base)
    if provider_key == "siliconflow":
        return Siliconflow(id=model_id, api_key=api_key, base_url=resolved_base)
    if provider_key == "deepseek":
        return DeepSeek(id=model_id, api_key=api_key, base_url=resolved_base)

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


def _apply_response_cache_params(model: Any, request: Any) -> None:
    if getattr(request, "provider", None) not in OFFICIAL_PROVIDER_CACHE_SUPPORTED:
        return

    enabled = bool(getattr(request, "enable_response_cache", False))
    if not hasattr(model, "cache_response"):
        return

    model.cache_response = enabled
    if not enabled:
        model.cache_ttl = None
        model.cache_dir = None
        return

    model.cache_ttl = AGNO_RESPONSE_CACHE_TTL_SECONDS
    model.cache_dir = str(AGNO_RESPONSE_CACHE_DIR)


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
    _apply_response_cache_params(model, request)


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
    # Disable interactive forms in expert mode (team mode)
    is_expert = getattr(request, "expert_mode", False) or bool(getattr(request, "team_agent_ids", []))
    if is_expert:
        names = [n for n in names if n != "interactive_form"]

    return names


def _has_selected_skills(request: Any) -> bool:
    """Check if any manual/external skills are selected in the request."""
    raw_skill_ids = getattr(request, "skill_ids", None)
    if isinstance(raw_skill_ids, list):
        return any(str(item or "").strip() for item in raw_skill_ids)
    if isinstance(raw_skill_ids, str):
        return bool(raw_skill_ids.strip())
    return False


def _has_skills(request: Any) -> bool:
    """Check if the agent will have any active skills (internal or external)."""
    if getattr(request, "enable_long_term_memory", False):
        return True
    if not getattr(request, "enable_skills", False):
        return False

    # 1. Check for manual/external skills
    if _has_selected_skills(request):
        return True

    # 2. Check for internal skills.
    # Note: agent-memory and skill-creator are handled specifically, but other
    # internal skills are loaded by default if enable_skills is True.
    internal_skills_dir = os.path.join(os.path.dirname(__file__), '..', '_internal_skills')
    if os.path.isdir(internal_skills_dir):
        for item in os.listdir(internal_skills_dir):
            if item in ("agent-memory", "skill-creator"):
                continue
            if os.path.isdir(os.path.join(internal_skills_dir, item)):
                return True

    return False


def _build_tools(request: Any) -> list[Any]:
    enabled_names = set(_collect_enabled_tool_names(request))
    if (
        not enabled_names
        and not request.user_tools
        and not getattr(request, "enable_skills", False)
        and not getattr(request, "enable_long_term_memory", False)
    ):
        return []
    serpapi_api_key = getattr(request, "serpapi_api_key", None)

    local_tool_names = {tool["name"] for tool in LOCAL_TOOLS}
    include_local = sorted([name for name in enabled_names if name in local_tool_names])

    # Inject skill execution tools if ANY skill (internal or external) is present
    if _has_skills(request):
        include_local = sorted(
            set(include_local) | {"execute_skill_script", "install_skill_dependency"}
        )
    tools: list[Any] = []

    if include_local:
        tools.append(
            QurioLocalTools(
                tavily_api_key=request.tavily_api_key,
                include_tools=include_local,
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
        backend = getattr(request, "search_backend", None) or "auto"
        if backend == "exa":
            exa_toolkit = _build_exa_toolkit(
                getattr(request, "exa_api_key", None),
                getattr(request, "exa_search_category", None),
            )
            if exa_toolkit:
                toolkits.append(exa_toolkit)
            else:
                logger.warning("Exa backend requested but ExaTools is unavailable or API key is missing.")
        else:
            selected = [name for name in include_agno if name in websearch_tools]
            toolkits.append(
                DuckDuckGoWebSearchTools(
                    include_tools=selected,
                    backend=backend,
                )
            )

    if include_set.intersection(EXA_SEARCH_TOOL_SET) and not (
        (getattr(request, "search_backend", None) or "auto") == "exa"
        and include_set.intersection(websearch_tools)
    ):
        exa_toolkit = _build_exa_toolkit(
            getattr(request, "exa_api_key", None),
            getattr(request, "exa_search_category", None),
        )
        if exa_toolkit:
            toolkits.append(exa_toolkit)
        else:
            logger.warning("Exa tool requested but ExaTools is unavailable or API key is missing.")

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
        "yfinance_tools",
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
            # Keep YFinance toolkit initialization aligned with Agno's default usage.
            # Some SDK versions expose different subsets/names, which can make
            # include_tools fail with "tool not present in toolkit".
            toolkits.append(YFinanceTools())

    hackernews_tools = {
        "hackernews_tools",
        "get_top_hackernews_stories",
        "get_user_details",
    }
    if include_set.intersection(hackernews_tools) and HackerNewsTools:
        toolkits.append(HackerNewsTools())

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


def _normalize_exa_category(category: str | None) -> str | None:
    normalized = str(category or "").strip().lower()
    if not normalized or normalized == "auto":
        return None
    return normalized if normalized in EXA_ALLOWED_CATEGORIES else None


def _build_exa_toolkit(exa_api_key: str | None, category: str | None = None) -> Any | None:
    if ExaTools is None:
        return None
    trimmed_key = str(exa_api_key or os.getenv("EXA_API_KEY") or "").strip()
    if not trimmed_key:
        return None
    return ExaTools(
        api_key=trimmed_key,
        enable_search=True,
        enable_get_contents=False,
        enable_find_similar=False,
        enable_answer=False,
        timeout=EXA_TIMEOUT_SECONDS,
        category=_normalize_exa_category(category),
    )


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
    if _has_skills(request):
        instructions_list.append(
            "[SKILL EXECUTION PROTOCOL] For any active skill, you MUST read and follow that skill's SKILL.md instructions "
            "before deciding tool/script workflow."
        )
        instructions_list.append(
            "Treat SKILL.md as authoritative for script selection, argument format, and step order. "
            "Do not replace required skill workflow with ad-hoc reasoning."
        )
        instructions_list.append(
            "If a skill defines bundled scripts, execute them via execute_skill_script and rely on script output. "
            "Do not merely summarize what the script would do."
        )
        instructions_list.append(
            "Do not invent enum-like values (for example category names) when a skill requires runtime discovery from tool output."
        )

    if "interactive_form" in enabled_names:
        instructions_list.append(
            "When using the interactive_form tool to collect user information: "
            "If the user's initial responses lack critical details needed to fulfill their request, "
            "you MUST call interactive_form again to gather the missing specific information. "
            "Do not proceed with incomplete information. "
            "However, limit to 2-3 forms maximum per conversation to respect user time."
        )
        if getattr(request, "enable_skills", False) and _has_selected_skills(request):
            instructions_list.append(
                "When a skill tells you to run a bundled script, do not merely summarize or restate the script. "
                "Use execute_skill_script to actually run the file and rely on its stdout/stderr."
            )
            instructions_list.append(
                "When a skill script fails because of a missing Python dependency "
                "(for example ModuleNotFoundError or ImportError), do not pretend it succeeded. "
                "First explain the missing package briefly, then use interactive_form to ask for explicit approval "
                "before installing anything. Do NOT ask for approval in plain text if interactive_form is available. "
                "For dependency approval, keep the form minimal: include the package name in the form title or description, "
                "and ask only for an approval choice when skill_id and package_name are already known from context. "
                "Do NOT ask the user to retype known values like skill_id or package_name. "
                "Only after the user approves may you call install_skill_dependency. "
                "If the user declines, stop and report that installation was skipped."
            )

    if "duckduckgo_image_search" in enabled_names or "google_image_search" in enabled_names:
        instructions_list.append(
            "When a response would benefit from images, use the image search tools to find relevant images. "
            "Hard rule: do not invent, guess, stitch together, or complete any image URL. "
            "Only use an image URL if a tool, database, or API explicitly returned a real image URL field such as image_url, url, or an equivalent field. "
            "Do not use placeholder or example URLs such as https://example.com/xxx.png. "
            "If no real image URL is available, do not output any image link and do not use markdown image syntax ![](). "
            "If the response format is structured JSON, set image_url to null or images to []."
        )

    if "duckduckgo_video_search" in enabled_names or "search_youtube" in enabled_names:
        instructions_list.append(
            "When users ask about tutorials, demonstrations, or topics that benefit from video content, "
            "you should use the video search tools to find relevant videos. "
            "ALWAYS include video links in your response using markdown format with descriptive text. "
            "Provide context about why each video is relevant to the user's query."
        )

    if getattr(request, "search_backend", None) == "exa" and (
        "web_search" in enabled_names or bool(enabled_names.intersection(EXA_SEARCH_TOOL_SET))
    ):
        exa_category = _normalize_exa_category(getattr(request, "exa_search_category", None))
        if exa_category:
            instructions_list.append(
                f"Exa search is available via search_exa and is constrained to the '{exa_category}' category."
            )
        else:
            instructions_list.append(
                "Exa search is available via search_exa. Use it for current web information, and choose a category when it helps."
            )

    instructions = "\n\n".join(instructions_list) if instructions_list else None

    # 2. Agent Construction (Stateless / Manual Context)
    # We do NOT inject 'db' or 'memory' here.
    # Session context (history + summary) is injected manually in stream_chat.py

    skills = None
    if getattr(request, "enable_skills", False) or getattr(request, "enable_long_term_memory", False):
        skills_dir = os.path.join(os.path.dirname(__file__), '..', '..', '.skills')
        internal_skills_dir = os.path.join(os.path.dirname(__file__), '..', '_internal_skills')
        requested_skills = getattr(request, "skill_ids", [])
        if isinstance(requested_skills, str):
            try:
                requested_skills = json.loads(requested_skills)
            except (json.JSONDecodeError, TypeError):
                requested_skills = []

        paths: list[str] = []

        # Inject built-in agent-memory skill if long term memory is enabled
        if getattr(request, "enable_long_term_memory", False):
            am_path = os.path.join(internal_skills_dir, "agent-memory")
            if os.path.isdir(am_path):
                paths.append(am_path)

        # Inject any other internal skills by default (except for specific non-autoloading skills)
        if os.path.isdir(internal_skills_dir):
            for item in os.listdir(internal_skills_dir):
                if item in ("agent-memory", "skill-creator"):
                    continue
                item_path = os.path.join(internal_skills_dir, item)
                if os.path.isdir(item_path):
                    paths.append(item_path)

        if requested_skills and getattr(request, "enable_skills", False):
            for skill_id in requested_skills:
                # Built-in agent-memory is already injected by enable_long_term_memory.
                if skill_id == "agent-memory" and getattr(request, "enable_long_term_memory", False):
                    continue
                internal_skill_path = os.path.join(internal_skills_dir, skill_id)
                external_skill_path = os.path.join(skills_dir, skill_id)

                if os.path.isdir(internal_skill_path):
                    paths.append(internal_skill_path)
                elif os.path.isdir(external_skill_path):
                    paths.append(external_skill_path)

        if paths:
            # Deduplicate paths (same skill may be added by multiple branches).
            # Prefer first-seen path to keep deterministic load order.
            unique_paths: list[str] = []
            seen: set[str] = set()
            for raw_path in paths:
                norm = os.path.realpath(raw_path)
                if norm in seen:
                    continue
                seen.add(norm)
                unique_paths.append(raw_path)
            skills = Skills(loaders=[LocalSkills(path) for path in unique_paths])

    # Merge personalized prompt with tool-derived instructions
    personalized = getattr(request, "personalized_prompt", None)
    if personalized:
        if instructions:
            instructions = f"{personalized}\n\n{instructions}"
        else:
            instructions = personalized

    # Use resolved agent name/description if available (for Team member identification)
    agent_id = getattr(request, "agent_id", None) or f"qurio-{request.provider}"
    agent_name = getattr(request, "agent_name", None) or f"Qurio {request.provider} Agent"
    agent_description = getattr(request, "agent_description", None)

    return Agent(
        id=agent_id,
        name=agent_name,
        description=agent_description,
        role=agent_description,
        model=model,
        tools=tools or None,
        markdown=True,
        tool_choice=tool_choice,
        instructions=instructions,
        skills=skills,
    )



# Mapping of provider to user_settings key for API keys
_PROVIDER_KEY_MAP: dict[str, str] = {
    "gemini": "googleApiKey",
    "openai": "OpenAICompatibilityKey",
    "openai_compatibility": "OpenAICompatibilityKey",
    "openrouter": "OpenRouterKey",
    "litellm_openai": "LiteLLMKey",
    "huggingface": "HuggingFaceKey",
    "siliconflow": "SiliconFlowKey",
    "glm": "GlmKey",
    "deepseek": "DeepSeekKey",
    "volcengine": "VolcengineKey",
    "modelscope": "ModelScopeKey",
    "kimi": "KimiKey",
    "nvidia": "NvidiaKey",
    "minimax": "MinimaxKey",
}


def _get_provider_credentials(provider: str) -> tuple[str | None, str | None]:
    """
    Get API key and base URL for a provider.

    Priority: user_settings table -> environment variables.
    """
    api_key: str | None = None
    base_url = DEFAULT_BASE_URLS.get(provider)

    # 1. Try to get API key from user_settings table
    db_key = _PROVIDER_KEY_MAP.get(provider)
    if db_key:
        try:
            adapter = get_db_adapter()
            if adapter:
                req = DbQueryRequest(
                    action="select",
                    table="user_settings",
                    filters=[DbFilter(op="eq", column="key", value=db_key)],
                    maybe_single=True,
                )
                result = adapter.execute(req)
                if result.data:
                    data = result.data
                    if isinstance(data, list) and len(data) > 0:
                        data = data[0]
                    if isinstance(data, dict):
                        api_key = data.get("value")
        except Exception as e:
            logger.debug(f"Failed to get API key from user_settings for {provider}: {e}")

    # 2. Fallback to environment variables
    if not api_key:
        provider_upper = provider.upper().replace("-", "_")
        api_key = os.getenv(f"{provider_upper}_API_KEY")
    if not api_key and provider == "openrouter":
        api_key = os.getenv("OPENROUTER_API_KEY", "")
    if not api_key and provider == "litellm_openai":
        api_key = os.getenv("LITELLM_API_KEY", "")
    if not api_key and provider == "huggingface":
        api_key = os.getenv("HF_TOKEN", os.getenv("HUGGINGFACE_API_KEY", ""))

    return api_key, base_url


def resolve_agent_config(agent_id: str, base_request: Any) -> Any:
    """Fetch agent configuration from database and merge with base request secrets."""
    import copy

    adapter = get_db_adapter()
    if not adapter:
        return base_request

    try:
        query_req = DbQueryRequest(
            action="select",
            table="agents",
            filters=[DbFilter(op="eq", column="id", value=agent_id)],
            maybe_single=True
        )
        response = adapter.execute(query_req)
        if response.error:
            logger.warning(f"[resolve_agent_config] DB error for agent_id={agent_id}: {response.error}")
            return base_request
        if not response.data:
            logger.warning(f"[resolve_agent_config] No agent found with id={agent_id}")
            return base_request

        # Handle case where data might be a list or a single dict
        agent_data = response.data
        if isinstance(agent_data, list):
            if len(agent_data) == 0:
                return base_request
            agent_data = agent_data[0]
        new_req = copy.deepcopy(base_request)

        # Override provider and get corresponding credentials from settings
        agent_provider = agent_data.get("provider")
        if agent_provider:
            new_req.provider = agent_provider
            # Get API key and base URL for this provider from environment
            api_key, base_url = _get_provider_credentials(agent_provider)
            if api_key:
                new_req.api_key = api_key
            if base_url:
                new_req.base_url = base_url

        new_req.model = agent_data.get("default_model") or base_request.model
        new_req.tool_ids = agent_data.get("tool_ids") or []
        new_req.skill_ids = agent_data.get("skill_ids") or []

        # Handle instructions (personalized prompt)
        # We'll store it in a custom attribute that build_agent can pick up
        new_req.personalized_prompt = agent_data.get("prompt")

        # Store agent name and description for proper identification in Teams
        new_req.agent_id = agent_id  # Store the original agent_id
        new_req.agent_name = agent_data.get("name")
        new_req.agent_emoji = agent_data.get("emoji")
        new_req.agent_description = agent_data.get("description")
        logger.info(f"[resolve_agent_config] Resolved agent: id={agent_id}, name={new_req.agent_name}, provider={agent_provider}")

        # Override generation params if configured
        if not agent_data.get("use_global_model_settings"):
            if agent_data.get("temperature") is not None:
                new_req.temperature = agent_data.get("temperature")
            if agent_data.get("top_p") is not None:
                new_req.top_p = agent_data.get("top_p")
            if agent_data.get("frequency_penalty") is not None:
                new_req.frequency_penalty = agent_data.get("frequency_penalty")
            if agent_data.get("presence_penalty") is not None:
                new_req.presence_penalty = agent_data.get("presence_penalty")

        return new_req
    except Exception as e:
        logger.error(f"Failed to resolve agent config for {agent_id}: {e}")
        return base_request


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
        database_provider=os.getenv("DATABASE_PROVIDER") or "default",
        user_id=user_id,
        enable_skills=False,  # Helper agent: keep skills disabled
    )
    return build_agent(memory_request)


def get_agent_for_provider(request: Any) -> Agent:
    return build_agent(request)


def build_team(request: Any, members: list[Agent]) -> Any:
    """Build an Agno Team from a list of member agents."""
    from agno.team import Team
    from agno.team.mode import TeamMode

    # Map requested team mode string to TeamMode enum
    mode_str = getattr(request, "team_mode", "route")
    try:
        team_mode = TeamMode(mode_str)
    except Exception:
        team_mode = TeamMode.route

    # Build a leader agent to inherit tools, skills, and personalised prompt
    leader_agent = build_agent(request)

    instructions = (
        "You are the Team Leader coordinating a group of expert agents. "
        "Analyze the user's request. Based on the expertise of your team members, "
        "delegate sub-tasks or questions to them. Finally, synthesize and summarize their findings into a comprehensive response."
    )

    # Prepend leader's own instructions if they exist
    if leader_agent.instructions:
        instructions = f"{leader_agent.instructions}\n\n{instructions}"

    team = Team(
        name=getattr(request, "agent_name", "Expert Team"),
        members=members,
        model=leader_agent.model,
        tools=leader_agent.tools,
        mode=team_mode,
        instructions=instructions,
        markdown=True,
        stream_member_events=True,  # Ensure member events are streamed
        # Only enable member-to-member context sharing for coordinate mode.
        # Other modes either do not benefit (`route`, `broadcast`) or are currently disabled (`tasks`).
        share_member_interactions=team_mode == TeamMode.coordinate,
    )
    # Set agent_id manually as Team constructor might not support it directly
    team.agent_id = getattr(request, "agent_id", None)
    return team
