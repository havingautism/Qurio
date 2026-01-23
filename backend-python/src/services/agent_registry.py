"""
Agent registry built with Agno SDK (Agent + AgentOS).
"""

from __future__ import annotations

import os
from types import SimpleNamespace
from typing import Any, Dict, List

from agno.agent import Agent
from agno.models.google import Gemini
from agno.models.openai import OpenAILike

from .custom_tools import QurioLocalTools
from .tool_registry import AGNO_TOOLS, LOCAL_TOOLS, resolve_tool_name
from .user_tools import build_user_tools_toolkit


DEFAULT_MODELS: Dict[str, str] = {
    "openai": os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
    "openai_compatibility": os.getenv("OPENAI_COMPAT_MODEL", "gpt-4o-mini"),
    "siliconflow": os.getenv("SILICONFLOW_MODEL", "Qwen/Qwen2.5-7B-Instruct"),
    "glm": os.getenv("GLM_MODEL", "glm-4-flash"),
    "modelscope": os.getenv("MODELSCOPE_MODEL", "AI-ModelScope/glm-4-9b-chat"),
    "kimi": os.getenv("KIMI_MODEL", "moonshot-v1-8k"),
    "gemini": os.getenv("GEMINI_MODEL", "gemini-2.0-flash-exp"),
    "nvidia": os.getenv("NVIDIA_MODEL", "deepseek-ai/deepseek-r1"),
    "minimax": os.getenv("MINIMAX_MODEL", "minimax-m2"),
}

DEFAULT_BASE_URLS: Dict[str, str] = {
    "openai": os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1"),
    "openai_compatibility": os.getenv("OPENAI_COMPAT_BASE_URL", "https://api.openai.com/v1"),
    "siliconflow": os.getenv("SILICONFLOW_BASE_URL", "https://api.siliconflow.cn/v1"),
    "glm": os.getenv("GLM_BASE_URL", "https://open.bigmodel.cn/api/paas/v4"),
    "modelscope": os.getenv("MODELSCOPE_BASE_URL", "https://api-inference.modelscope.cn/v1"),
    "kimi": os.getenv("KIMI_BASE_URL", "https://api.moonshot.cn/v1"),
    "nvidia": os.getenv("NVIDIA_BASE_URL", "https://integrate.api.nvidia.com/v1"),
    "minimax": os.getenv("MINIMAX_BASE_URL", "https://api.minimax.io/v1"),
}




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

    if provider == "glm":
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

    local_tool_names = {tool["name"] for tool in LOCAL_TOOLS}
    include_local = sorted([name for name in enabled_names if name in local_tool_names])
    tools: List[Any] = []

    if include_local:
        tools.append(QurioLocalTools(tavily_api_key=request.tavily_api_key, include_tools=include_local))

    agno_tool_names = {tool["name"] for tool in AGNO_TOOLS}
    include_agno = sorted([name for name in enabled_names if name in agno_tool_names])
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
        try:
            from agno.tools.websearch import WebSearchTools
        except Exception:
            WebSearchTools = None
        if WebSearchTools:
            selected = [name for name in include_agno if name in websearch_tools]
            backend = getattr(request, "search_backend", None) or "auto"
            toolkits.append(
                WebSearchTools(
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

    return toolkits


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

    tool_choice = request.tool_choice
    if tool_choice is None and tools:
        tool_choice = "auto"

    return Agent(
        id=f"qurio-{request.provider}",
        name=f"Qurio {request.provider} Agent",
        model=model,
        tools=tools or None,
        add_history_to_context=False,
        markdown=True,
        tool_choice=tool_choice,
    )


def get_agent_for_provider(request: Any) -> Agent:
    return build_agent(request)
