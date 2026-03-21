from __future__ import annotations

import asyncio
import json
import uuid
from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Iterable

from agno.utils.log import logger



@dataclass(slots=True)
class SearchFilterDecision:
    original_results: list[dict[str, Any]]
    filtered_results: list[dict[str, Any]]
    original_count: int
    filtered_count: int
    applied: bool
    fallback_reason: str | None
    selected_ids: list[str]


def normalize_search_candidates(raw_results: Any) -> list[dict[str, Any]]:
    if not isinstance(raw_results, list):
        return []

    candidates: list[dict[str, Any]] = []
    for index, item in enumerate(raw_results, start=1):
        if not isinstance(item, dict):
            continue
        candidate = dict(item)
        candidate_id = str(candidate.get("id") or f"search-{index}").strip()
        if not candidate_id:
            candidate_id = f"search-{index}"
        candidate["id"] = candidate_id
        candidate["originalIndex"] = index - 1
        candidates.append(candidate)
    return candidates


def _normalize_selected_ids(selected_ids: Iterable[Any] | None) -> list[str]:
    if not selected_ids:
        return []
    normalized: list[str] = []
    for item in selected_ids:
        value = str(item or "").strip()
        if value:
            normalized.append(value)
    return normalized


def apply_search_selection(
    candidates: list[dict[str, Any]],
    selected_ids: Iterable[Any] | None,
) -> SearchFilterDecision:
    original_results = [dict(item) for item in candidates if isinstance(item, dict)]
    original_count = len(original_results)
    normalized_selected_ids = _normalize_selected_ids(selected_ids)

    if original_count == 0:
        return SearchFilterDecision(
            original_results=[],
            filtered_results=[],
            original_count=0,
            filtered_count=0,
            applied=False,
            fallback_reason="empty_candidates",
            selected_ids=[],
        )

    if not normalized_selected_ids:
        return SearchFilterDecision(
            original_results=original_results,
            filtered_results=original_results,
            original_count=original_count,
            filtered_count=original_count,
            applied=False,
            fallback_reason="empty_selection",
            selected_ids=[],
        )

    selected_lookup = {item for item in normalized_selected_ids}
    filtered_results = [
        item for item in original_results if str(item.get("id") or "").strip() in selected_lookup
    ]

    if not filtered_results:
        return SearchFilterDecision(
            original_results=original_results,
            filtered_results=original_results,
            original_count=original_count,
            filtered_count=original_count,
            applied=False,
            fallback_reason="invalid_selection_ids",
            selected_ids=[],
        )

    return SearchFilterDecision(
        original_results=original_results,
        filtered_results=filtered_results,
        original_count=original_count,
        filtered_count=len(filtered_results),
        applied=True,
        fallback_reason=None,
        selected_ids=[str(item.get("id") or "").strip() for item in filtered_results if item.get("id")],
    )


def _safe_json_parse(text: str | None) -> Any | None:
    if not text or not isinstance(text, str):
        return None
    stripped = text.strip()
    if not stripped:
        return None
    try:
        return json.loads(stripped)
    except Exception:
        pass
    start = stripped.find("{")
    end = stripped.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(stripped[start : end + 1])
        except Exception:
            pass
    start = stripped.find("[")
    end = stripped.rfind("]")
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(stripped[start : end + 1])
        except Exception:
            pass
    return None


def _extract_selected_ids(model_output: Any) -> list[str]:
    parsed = model_output
    if isinstance(model_output, str):
        parsed = _safe_json_parse(model_output)
    if isinstance(parsed, dict):
        raw_ids = parsed.get("selected_ids") or parsed.get("selectedIds") or []
        if isinstance(raw_ids, list):
            return [str(item).strip() for item in raw_ids if str(item).strip()]
    if isinstance(parsed, list):
        return [str(item).strip() for item in parsed if str(item).strip()]
    return []


def _build_search_filter_payload(
    payload: dict[str, Any],
    decision: SearchFilterDecision,
    *,
    tool_name: str,
    query: str,
    status: str,
    results_override: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    filtered_payload = dict(payload)
    filtered_payload["results"] = (
        results_override if results_override is not None else decision.filtered_results
    )
    filtered_payload["search_filter"] = {
        "tool_name": tool_name,
        "query": query,
        "status": status,
        "applied": decision.applied,
        "original_count": decision.original_count,
        "filtered_count": decision.filtered_count,
        "selected_ids": decision.selected_ids,
        "fallback_reason": decision.fallback_reason,
        "original_results": decision.original_results,
        "filtered_results": decision.filtered_results,
    }
    return filtered_payload


def _log_search_filter_event(
    *,
    tool_name: str,
    query: str,
    status: str,
    original_count: int,
    filtered_count: int,
    reason: str | None = None,
) -> None:
    message = (
        "Search result filtering %s: tool=%s query=%r original=%s filtered=%s"
        % (status, tool_name, query, original_count, filtered_count)
    )
    if reason:
        message += f" reason={reason}"
    if status == "filtered":
        logger.info(message)
    else:
        logger.warning(message)


async def maybe_filter_search_results(
    *,
    tool_name: str,
    query: str,
    payload: dict[str, Any],
    search_result_filter_provider: str | None = None,
    search_result_filter_model: str | None = None,
    search_result_filter_api_key: str | None = None,
    search_result_filter_base_url: str | None = None,
    summary_provider: str | None = None,
    summary_model: str | None = None,
    summary_api_key: str | None = None,
    summary_base_url: str | None = None,
    completion_runner: Callable[..., Awaitable[dict[str, Any]]] | None = None,
) -> dict[str, Any]:
    allowed_tools = {"web_search", "search_news"}
    base_results = payload.get("results") if isinstance(payload, dict) else None
    if tool_name not in allowed_tools:
        original_count = len(normalize_search_candidates(base_results))
        _log_search_filter_event(
            tool_name=tool_name,
            query=query,
            status="skipped",
            original_count=original_count,
            filtered_count=original_count,
            reason="tool_not_supported",
        )
        return {
            **payload,
            "results": base_results if isinstance(base_results, list) else [],
            "search_filter": {
                "tool_name": tool_name,
                "query": query,
                "status": "skipped",
                "applied": False,
                "original_count": original_count,
                "filtered_count": original_count,
                "selected_ids": [],
                "fallback_reason": "tool_not_supported",
            },
        }

    candidates = normalize_search_candidates(payload.get("results"))
    original_count = len(candidates)
    if original_count == 0:
        decision = apply_search_selection(candidates, [])
        _log_search_filter_event(
            tool_name=tool_name,
            query=query,
            status="unavailable",
            original_count=decision.original_count,
            filtered_count=decision.filtered_count,
            reason=decision.fallback_reason,
        )
        return _build_search_filter_payload(
            payload,
            decision,
            tool_name=tool_name,
            query=query,
            status="unavailable",
            results_override=base_results if isinstance(base_results, list) else [],
        )

    provider = str(search_result_filter_provider or summary_provider or "").strip()
    model = str(search_result_filter_model or summary_model or "").strip()
    api_key = str(search_result_filter_api_key or summary_api_key or "").strip()
    base_url = search_result_filter_base_url or summary_base_url
    if not provider or not model or not api_key:
        decision = apply_search_selection(candidates, [])
        _log_search_filter_event(
            tool_name=tool_name,
            query=query,
            status="unavailable",
            original_count=decision.original_count,
            filtered_count=decision.filtered_count,
            reason=decision.fallback_reason or "filter_config_missing",
        )
        return _build_search_filter_payload(
            payload,
            decision,
            tool_name=tool_name,
            query=query,
            status="unavailable",
            results_override=base_results if isinstance(base_results, list) else [],
        )

    runner = completion_runner
    if runner is None:
        from .llm_utils import run_chat_completion as runner  # local import to avoid cycles

    prompt_candidates = []
    for candidate in candidates[:10]:
        prompt_candidates.append(
            {
                "id": candidate["id"],
                "title": candidate.get("title") or "",
                "url": candidate.get("url") or candidate.get("link") or "",
                "snippet": candidate.get("content")
                or candidate.get("snippet")
                or candidate.get("summary")
                or "",
            }
        )

    system_prompt = (
        "You are a search result reranker.\n"
        "Select only the most relevant candidates for the user's query.\n"
        "Rules:\n"
        "- Return JSON only.\n"
        "- Only choose from the provided candidate ids.\n"
        "- Do not invent new ids, urls, titles, or facts.\n"
        "- Prefer a small but sufficient set that still covers the query.\n"
        "- For broad, current, or exploratory queries, keep multiple relevant candidates when available.\n"
        "- If nothing is relevant, return an empty selected_ids array.\n"
    )
    user_prompt = (
        f"User query: {query}\n\n"
        f"Candidates:\n{json.dumps(prompt_candidates, ensure_ascii=False, indent=2)}\n\n"
        'Return {"selected_ids": [...]} only.'
    )
    try:
        response = await asyncio.wait_for(
            runner(
                provider=provider,
                api_key=api_key,
                model=model,
                base_url=base_url,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.0,
                response_format={"type": "json_object"},
                tools=None,
                tool_choice=None,
                thinking=False,
                context_message_limit=None,
            ),
            timeout=10.0,
        )
    except Exception as exc:
        _log_search_filter_event(
            tool_name=tool_name,
            query=query,
            status="fallback",
            original_count=original_count,
            filtered_count=original_count,
            reason=f"exception:{type(exc).__name__}",
        )
        logger.warning("Search result filtering fallback details: %s", exc, exc_info=True)
        decision = apply_search_selection(candidates, [])
        return _build_search_filter_payload(
            {
                **payload,
                "results": base_results if isinstance(base_results, list) else [],
            },
            decision,
            tool_name=tool_name,
            query=query,
            status="fallback",
            results_override=base_results if isinstance(base_results, list) else [],
        )

    selected_ids = _extract_selected_ids(response.get("content"))
    decision = apply_search_selection(candidates, selected_ids)
    status = "filtered" if decision.applied else "fallback"
    _log_search_filter_event(
        tool_name=tool_name,
        query=query,
        status=status,
        original_count=decision.original_count,
        filtered_count=decision.filtered_count,
        reason=decision.fallback_reason,
    )
    return _build_search_filter_payload(
        {
            **payload,
            "results": decision.filtered_results if decision.applied else (base_results if isinstance(base_results, list) else []),
        },
        decision,
        tool_name=tool_name,
        query=query,
        status=status,
        results_override=(
            decision.filtered_results if decision.applied else (base_results if isinstance(base_results, list) else [])
        ),
    )
