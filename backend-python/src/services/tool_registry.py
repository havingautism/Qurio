"""
Tool registry and helpers for Qurio (aligned with Node.js backend tools).
"""

from __future__ import annotations

from typing import Any

TOOL_ALIASES: dict[str, str] = {
    "web_search_using_tavily": "Tavily_web_search",
    "get_top_hackernews_stories": "hackernews_tools",
    "get_user_details": "hackernews_tools",
    "get_current_stock_price": "yfinance_tools",
    "get_company_info": "yfinance_tools",
    "get_stock_fundamentals": "yfinance_tools",
    "get_income_statements": "yfinance_tools",
    "get_key_financial_ratios": "yfinance_tools",
    "get_analyst_recommendations": "yfinance_tools",
    "get_company_news": "yfinance_tools",
    "get_technical_indicators": "yfinance_tools",
    "get_historical_stock_prices": "yfinance_tools",
}

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
                "min_score": {
                    "type": "number",
                    "description": "Only keep results with score strictly greater than this value (default 0.9).",
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
            "required": ["fields"],
            "properties": {
                "id": {"type": "string", "description": "Optional identifier for this form"},
                "title": {"type": "string", "description": "Optional form title displayed to user"},
                "description": {"type": "string", "description": "Optional form description"},
                "fields": {
                    "type": "array",
                    "description": "Form fields to collect. Minimal mode supported.",
                    "items": {
                        "anyOf": [
                            {"type": "string", "description": "Short field label, backend will normalize."},
                            {
                                "type": "object",
                                "properties": {
                                    "name": {"type": "string", "description": "Field identifier (preferred)"},
                                    "label": {"type": "string", "description": "Field label (optional)"},
                                    "type": {
                                        "type": "string",
                                        "enum": ["text", "number", "select", "checkbox", "range"],
                                        "description": "Field type (optional, defaults to text)",
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
                        ],
                    },
                },
            },
        },
    },
    {
        "id": "install_skill_dependency",
        "name": "install_skill_dependency",
        "category": "skills",
        "description": (
            "Install a Python dependency into a skill-scoped virtual environment. "
            "Use only after the user explicitly approves installation."
        ),
        "parameters": {
            "type": "object",
            "required": ["skill_id", "package_name"],
            "properties": {
                "skill_id": {
                    "type": "string",
                    "description": "Existing local skill id whose isolated environment should receive the package.",
                },
                "package_name": {
                    "type": "string",
                    "description": "Single Python package name. Letters, numbers, and hyphens only.",
                },
            },
        },
    },
    {
        "id": "execute_skill_script",
        "name": "execute_skill_script",
        "category": "skills",
        "description": (
            "Execute a script from a skill's scripts directory. "
            "Supports Python and Bash scripts and returns stdout/stderr."
        ),
        "parameters": {
            "type": "object",
            "required": ["skill_id", "script_path"],
            "properties": {
                "skill_id": {
                    "type": "string",
                    "description": "Existing local skill id containing the target script.",
                },
                "script_path": {
                    "type": "string",
                    "description": "Relative path under scripts/, e.g. scripts/run_task.py or scripts/setup.sh.",
                },
                "args": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Optional positional arguments passed to the script.",
                },
                "timeout_seconds": {
                    "type": "number",
                    "description": "Optional timeout in seconds. Default 60.",
                },
            },
        },
    },
    {
        "id": "render_html_widget",
        "name": "render_html_widget",
        "category": "visualization",
        "description": (
            "Render a safe HTML widget for richer visualization in chat. "
            "Use this when tabular, timeline, board, or card layouts are clearer than plain text."
        ),
        "parameters": {
            "type": "object",
            "required": ["html"],
            "properties": {
                "title": {
                    "type": "string",
                    "description": "Optional widget title shown above the iframe.",
                },
                "html": {
                    "type": "string",
                    "description": "HTML content for the widget body. Keep it self-contained.",
                },
                "height": {
                    "type": "integer",
                    "description": "Optional widget height in pixels. Defaults to 360.",
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
            },
        },
    },
    {
        "id": "search_exa",
        "name": "search_exa",
        "category": "agno",
        "description": "Search the web using Exa with optional category filtering.",
        "parameters": {
            "type": "object",
            "required": ["query"],
            "properties": {
                "query": {"type": "string", "description": "Search query."},
                "num_results": {
                    "type": "integer",
                    "description": "Number of search results to return (default 5).",
                },
                "category": {
                    "type": "string",
                    "enum": [
                        "company",
                        "research paper",
                        "news",
                        "pdf",
                        "github",
                        "tweet",
                        "personal site",
                        "linkedin profile",
                        "financial report",
                    ],
                    "description": "Optional Exa category filter.",
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
        "id": "yfinance_tools",
        "name": "yfinance_tools",
        "category": "agno",
        "description": "Yahoo Finance toolkit for stock price, company profile, fundamentals, news, and historical data.",
        "parameters": {
            "type": "object",
            "properties": {},
        },
    },
    {
        "id": "hackernews_tools",
        "name": "hackernews_tools",
        "category": "news",
        "description": "Hacker News toolkit for top stories and user profile lookups.",
        "parameters": {
            "type": "object",
            "properties": {},
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
