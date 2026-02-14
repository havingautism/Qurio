"""
Tool registry and helpers for Qurio (aligned with Node.js backend tools).
"""

from __future__ import annotations

from typing import Any

TOOL_ALIASES: dict[str, str] = {}

GLOBAL_TOOLS: list[dict[str, Any]] = [
    {
        "id": "Tavily_web_search",
        "name": "Tavily_web_search",
        "category": "search",
        "description": "Search the web for current information using Tavily API.",
        "parameters": {
            "type": "object",
            "required": ["query"],
            "properties": {
                "query": {"type": "string", "description": "Search query."},
                "max_results": {
                    "type": "integer",
                    "description": "Maximum number of results to return (default 5).",
                },
            },
        },
    },
]

AGENT_TOOLS: list[dict[str, Any]] = [
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
                "text": {"type": "string", "description": "Text to extract from."},
                "query": {"type": "string", "description": "Keyword or phrase to match."},
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
                "text": {"type": "string", "description": "JSON string to validate or repair."},
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
                "url": {"type": "string", "description": "Target webpage URL (e.g., https://example.com)."},
            },
        },
    },
    {
        "id": "Tavily_academic_search",
        "name": "Tavily_academic_search",
        "category": "search",
        "description": (
            "Search academic journals, papers, and scholarly resources using Tavily API with advanced search depth. "
            "Results are limited to peer-reviewed sources, preprint servers, and trusted academic databases."
        ),
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
        "description": (
            "Display an interactive form to collect structured user input. "
            "Use this when you need specific information from the user in a structured format."
        ),
        "parameters": {
            "type": "object",
            "required": ["id", "title", "fields"],
            "properties": {
                "id": {"type": "string", "description": "Unique identifier for this form"},
                "title": {"type": "string", "description": "Form title displayed to user"},
                "description": {"type": "string", "description": "Optional form description"},
                "fields": {
                    "type": "array",
                    "description": "Form fields to collect",
                    "items": {
                        "type": "object",
                        "required": ["name", "label", "type"],
                        "properties": {
                            "name": {"type": "string", "description": "Field identifier"},
                            "label": {"type": "string", "description": "Field label"},
                            "type": {
                                "type": "string",
                                "enum": ["text", "number", "select", "checkbox", "range"],
                                "description": "Field type",
                            },
                            "required": {"type": "boolean", "description": "Is this field required"},
                            "options": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": "Options for select/checkbox fields",
                            },
                            "default": {"description": "Default value"},
                            "min": {"type": "number", "description": "Min value for number/range"},
                            "max": {"type": "number", "description": "Max value for number/range"},
                            "step": {"type": "number", "description": "Step for number/range"},
                        },
                    },
                },
            },
        },
    },
    {
        "id": "memory_retrieve",
        "name": "memory_retrieve",
        "category": "memory",
        "description": (
            "Two-step long-term memory retrieval. "
            "Step 1: action='list' returns domain_key/aliases/scope only (no summary). "
            "Step 2: action='fetch' with selected domain_keys returns summaries."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["list", "fetch"],
                    "description": "Retrieval stage: list domains first, then fetch summaries by selected domain_keys.",
                },
                "query": {
                    "type": "string",
                    "description": "Optional query for domain filtering in list stage.",
                },
                "domain_keys": {
                    "description": "Selected domain keys for fetch stage. Supports string array or object map {key:true}.",
                },
                "include_summary": {
                    "type": "boolean",
                    "description": "Set true with action='fetch' to return summaries. Default false.",
                },
                "limit": {
                    "type": "integer",
                    "description": "Maximum number of domains to return (default 8, max 20).",
                },
                "user_id": {
                    "type": "string",
                    "description": "Optional user id for DB fallback retrieval.",
                },
                "database_provider": {
                    "type": "string",
                    "description": "Optional DB provider id/type for fallback retrieval.",
                },
            },
        },
    },
    {
        "id": "memory_update",
        "name": "memory_update",
        "category": "memory",
        "description": (
            "Manage long-term memory for a user domain. "
            "Prefer reusing an existing domain_key whenever possible. "
            "Use operation='add' to append/create, operation='upsert' to update/overwrite, "
            "and operation='delete' to remove a memory domain. "
            "For operation='upsert' on an existing domain, set based_on_existing=true "
            "after reading existing memory."
        ),
        "parameters": {
            "type": "object",
            "required": ["domain_key", "operation"],
            "properties": {
                "operation": {
                    "type": "string",
                    "enum": ["add", "upsert", "delete"],
                    "description": "Memory operation type: add, upsert (overwrite update), or delete.",
                },
                "domain_key": {
                    "type": "string",
                    "description": (
                        'Memory domain key (e.g. "music", "career", "personal_intro"). '
                        "Prefer existing keys for semantically similar updates; create a new key only for clearly new topics."
                    ),
                },
                "summary": {
                    "type": "string",
                    "description": (
                        "Summary content. Required for operation=add. "
                        "For operation=upsert, you may omit summary in the first call to fetch existing memory, "
                        "then call again with the full replacement summary."
                    ),
                },
                "based_on_existing": {
                    "type": "boolean",
                    "description": (
                        "Set true when operation=upsert for an existing domain, indicating the new summary "
                        "was rewritten from existing memory."
                    ),
                },
                "aliases": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Optional synonyms or related tags for this domain.",
                },
                "scope": {
                    "type": "string",
                    "description": "Optional description of what this domain covers.",
                },
                "user_id": {
                    "type": "string",
                    "description": "User ID used to locate memory rows for read/update/delete.",
                },
                "database_provider": {
                    "type": "string",
                    "description": "Optional DB provider id/type for memory lookup, e.g. supabase-main or sqlite-local.",
                },
            },
        },
    },
]

AGNO_TOOLS: list[dict[str, Any]] = [
    {
        "id": "web_search_using_tavily",
        "name": "web_search_using_tavily",
        "category": "agno",
        "description": "Search the web using Tavily (standard search).",
        "parameters": {
            "type": "object",
            "required": ["query"],
            "properties": {
                "query": {"type": "string", "description": "Search query."},
                "max_results": {
                    "type": "integer",
                    "description": "Maximum number of results to return (default 5).",
                },
            },
        },
    },
    {
        "id": "web_search_with_tavily",
        "name": "web_search_with_tavily",
        "category": "agno",
        "description": "Search the web using Tavily (search context mode).",
        "parameters": {
            "type": "object",
            "required": ["query"],
            "properties": {
                "query": {"type": "string", "description": "Search query."},
            },
        },
    },
    {
        "id": "extract_url_content",
        "name": "extract_url_content",
        "category": "agno",
        "description": "Extract content from one or more URLs using Tavily extract API.",
        "parameters": {
            "type": "object",
            "required": ["urls"],
            "properties": {
                "urls": {
                    "type": "string",
                    "description": "Single URL or comma-separated URLs to extract.",
                },
            },
        },
    },
    {
        "id": "web_search",
        "name": "web_search",
        "category": "agno",
        "description": "Search the web using WebSearchTools backend (DuckDuckGo/Google/Bing/Brave/Yandex/Yahoo).",
        "parameters": {
            "type": "object",
            "required": ["query"],
            "properties": {
                "query": {"type": "string", "description": "Search query."},
                "max_results": {
                    "type": "integer",
                    "description": "Maximum number of results to return (default 5).",
                },
            },
        },
    },
    {
        "id": "search_news",
        "name": "search_news",
        "category": "agno",
        "description": "Search news using WebSearchTools backend (DuckDuckGo/Google/Bing/Brave/Yandex/Yahoo).",
        "parameters": {
            "type": "object",
            "required": ["query"],
            "properties": {
                "query": {"type": "string", "description": "News query."},
                "max_results": {
                    "type": "integer",
                    "description": "Maximum number of results to return (default 5).",
                },
            },
        },
    },
    {
        "id": "search_arxiv_and_return_articles",
        "name": "search_arxiv_and_return_articles",
        "category": "agno",
        "description": "Search arXiv and return articles metadata.",
        "parameters": {
            "type": "object",
            "required": ["query"],
            "properties": {
                "query": {"type": "string", "description": "Search query."},
                "num_articles": {
                    "type": "integer",
                    "description": "Number of articles to return (default 10).",
                },
            },
        },
    },
    {
        "id": "read_arxiv_papers",
        "name": "read_arxiv_papers",
        "category": "agno",
        "description": "Download and read arXiv papers by id list.",
        "parameters": {
            "type": "object",
            "required": ["id_list"],
            "properties": {
                "id_list": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "List of arXiv paper ids (e.g. 2103.03404v1).",
                },
                "pages_to_read": {
                    "type": "integer",
                    "description": "Limit number of pages to read (optional).",
                },
            },
        },
    },
    {
        "id": "search_wikipedia",
        "name": "search_wikipedia",
        "category": "agno",
        "description": "Search Wikipedia and return a summary.",
        "parameters": {
            "type": "object",
            "required": ["query"],
            "properties": {
                "query": {"type": "string", "description": "Wikipedia query."},
            },
        },
    },
    {
        "id": "get_current_stock_price",
        "name": "get_current_stock_price",
        "category": "agno",
        "description": "Get the current stock price for a symbol (Yahoo Finance).",
        "parameters": {
            "type": "object",
            "required": ["symbol"],
            "properties": {
                "symbol": {"type": "string", "description": "Stock symbol, e.g. AAPL."},
            },
        },
    },
    {
        "id": "get_company_info",
        "name": "get_company_info",
        "category": "agno",
        "description": "Get company profile and overview (Yahoo Finance).",
        "parameters": {
            "type": "object",
            "required": ["symbol"],
            "properties": {
                "symbol": {"type": "string", "description": "Stock symbol."},
            },
        },
    },
    {
        "id": "get_stock_fundamentals",
        "name": "get_stock_fundamentals",
        "category": "agno",
        "description": "Get stock fundamentals (Yahoo Finance).",
        "parameters": {
            "type": "object",
            "required": ["symbol"],
            "properties": {
                "symbol": {"type": "string", "description": "Stock symbol."},
            },
        },
    },
    {
        "id": "get_income_statements",
        "name": "get_income_statements",
        "category": "agno",
        "description": "Get income statements (Yahoo Finance).",
        "parameters": {
            "type": "object",
            "required": ["symbol"],
            "properties": {
                "symbol": {"type": "string", "description": "Stock symbol."},
            },
        },
    },
    {
        "id": "get_key_financial_ratios",
        "name": "get_key_financial_ratios",
        "category": "agno",
        "description": "Get key financial ratios (Yahoo Finance).",
        "parameters": {
            "type": "object",
            "required": ["symbol"],
            "properties": {
                "symbol": {"type": "string", "description": "Stock symbol."},
            },
        },
    },
    {
        "id": "get_analyst_recommendations",
        "name": "get_analyst_recommendations",
        "category": "agno",
        "description": "Get analyst recommendations (Yahoo Finance).",
        "parameters": {
            "type": "object",
            "required": ["symbol"],
            "properties": {
                "symbol": {"type": "string", "description": "Stock symbol."},
            },
        },
    },
    {
        "id": "get_company_news",
        "name": "get_company_news",
        "category": "agno",
        "description": "Get company news (Yahoo Finance).",
        "parameters": {
            "type": "object",
            "required": ["symbol"],
            "properties": {
                "symbol": {"type": "string", "description": "Stock symbol."},
            },
        },
    },
    {
        "id": "get_technical_indicators",
        "name": "get_technical_indicators",
        "category": "agno",
        "description": "Get technical indicators (Yahoo Finance).",
        "parameters": {
            "type": "object",
            "required": ["symbol"],
            "properties": {
                "symbol": {"type": "string", "description": "Stock symbol."},
            },
        },
    },
    {
        "id": "get_historical_stock_prices",
        "name": "get_historical_stock_prices",
        "category": "agno",
        "description": "Get historical stock prices (Yahoo Finance).",
        "parameters": {
            "type": "object",
            "required": ["symbol"],
            "properties": {
                "symbol": {"type": "string", "description": "Stock symbol."},
                "period": {
                    "type": "string",
                    "description": "Period (e.g. 1mo, 6mo, 1y).",
                },
                "interval": {
                    "type": "string",
                    "description": "Interval (e.g. 1d, 1wk).",
                },
            },
        },
    },
]

IMAGE_SEARCH_TOOLS: list[dict[str, Any]] = [
    {
        "id": "duckduckgo_image_search",
        "name": "duckduckgo_image_search",
        "category": "search",
        "description": "Search for images using DuckDuckGo. Returns a list of image results with titles and URLs.",
        "parameters": {
            "type": "object",
            "required": ["query"],
            "properties": {
                "query": {"type": "string", "description": "Search query."},
                "max_results": {
                    "type": "integer",
                    "description": "Maximum number of results to return (default 5).",
                },
            },
        },
    },
    {
        "id": "bing_image_search",
        "name": "bing_image_search",
        "category": "search",
        "description": "Search for images on Bing using SerpApi.",
        "parameters": {
            "type": "object",
            "required": ["query"],
            "properties": {
                "query": {"type": "string", "description": "Search query."},
            },
        },
    },
    {
        "id": "google_image_search",
        "name": "google_image_search",
        "category": "search",
        "description": "Search for images on Google using SerpApi.",
        "parameters": {
            "type": "object",
            "required": ["query"],
            "properties": {
                "query": {"type": "string", "description": "Search query."},
            },
        },
    },
    {
        "id": "serpapi_image_search",
        "name": "serpapi_image_search",
        "category": "search",
        "description": "Search for images using various engines via SerpApi (Google, Bing, etc.).",
        "parameters": {
            "type": "object",
            "required": ["query"],
            "properties": {
                "query": {"type": "string", "description": "Search query."},
                "engine": {
                    "type": "string",
                    "description": "The search engine to use (e.g., google_images, bing_images). Default is google_images.",
                },
                "max_results": {
                    "type": "integer",
                    "description": "Maximum number of results to return (default 5).",
                },
            },
        },
    },
]

VIDEO_SEARCH_TOOLS: list[dict[str, Any]] = [
    {
        "id": "duckduckgo_video_search",
        "name": "duckduckgo_video_search",
        "category": "search",
        "description": "Search for videos using DuckDuckGo. Returns a list of video results with titles, URLs, and thumbnails.",
        "parameters": {
            "type": "object",
            "required": ["query"],
            "properties": {
                "query": {"type": "string", "description": "Search query."},
                "max_results": {
                    "type": "integer",
                    "description": "Maximum number of results to return (default 5).",
                },
            },
        },
    },
    {
        "id": "search_youtube",
        "name": "search_youtube",
        "category": "search",
        "description": "Search for videos on YouTube using SerpApi.",
        "parameters": {
            "type": "object",
            "required": ["query"],
            "properties": {
                "query": {"type": "string", "description": "Search query."},
            },
        },
    },
]

LOCAL_TOOLS: list[dict[str, Any]] = GLOBAL_TOOLS + AGENT_TOOLS
ALL_TOOLS: list[dict[str, Any]] = (
    LOCAL_TOOLS + AGNO_TOOLS + IMAGE_SEARCH_TOOLS + VIDEO_SEARCH_TOOLS
)


def resolve_tool_name(tool_name: str) -> str:
    return TOOL_ALIASES.get(tool_name, tool_name)


def list_tools() -> list[dict[str, Any]]:
    return [
        {
            "id": tool["id"],
            "name": tool["name"],
            "category": tool["category"],
            "description": tool["description"],
            "parameters": tool["parameters"],
        }
        for tool in ALL_TOOLS
    ]


def get_tool_definitions_by_ids(tool_ids: list[str]) -> list[dict[str, Any]]:
    if not tool_ids:
        return []
    id_set = {resolve_tool_name(str(tool_id)) for tool_id in tool_ids}
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
