from __future__ import annotations

from fastapi import Request


def get_secret_header(request: Request, header_name: str) -> str | None:
    value = request.headers.get(header_name)
    if value is None:
        return None
    trimmed = str(value).strip()
    return trimmed or None


def get_llm_api_key(request: Request) -> str | None:
    return get_secret_header(request, "x-llm-api-key")


def apply_stream_secret_headers(request: Request, body: dict) -> dict:
    payload = dict(body)

    header_to_body = {
        "x-llm-api-key": "apiKey",
        "x-tavily-api-key": "tavilyApiKey",
        "x-serpapi-api-key": "serpapiApiKey",
        "x-exa-api-key": "exaApiKey",
        "x-summary-api-key": "summaryApiKey",
        "x-memory-api-key": "memoryApiKey",
    }

    for header_name, body_key in header_to_body.items():
        header_value = get_secret_header(request, header_name)
        if header_value:
            payload[body_key] = header_value

    return payload
