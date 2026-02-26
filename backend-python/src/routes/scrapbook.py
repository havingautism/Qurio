"""
Scrapbook API routes.

Endpoints:
  GET  /scrapbook           — list entries (filter by platform, search by q)
  POST /scrapbook           — create entry, optionally fetch URL + AI-generate title/summary
  DELETE /scrapbook/{id}    — delete entry
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from pydantic import BaseModel, Field

from ..services.db_service import get_db_adapter
from ..services.generation import generate_emoji
from ..services.llm_utils import run_agent_completion, safe_json_parse
from ..models.db import DbFilter, DbOrder, DbQueryRequest
from ..models.stream_chat import StreamChatRequest

router = APIRouter(tags=["scrapbook"])
logger = logging.getLogger(__name__)

_UTC_FMT = "%Y-%m-%dT%H:%M:%SZ"


def _utc_now() -> str:
    return datetime.utcnow().strftime(_UTC_FMT)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _extract_domain(url: str) -> str:
    """Extract the main domain from a URL (e.g. 'juejin.cn' from 'https://juejin.cn/post/123')."""
    from urllib.parse import urlparse
    try:
        netloc = urlparse(url).netloc.lower()
        # Strip 'www.' prefix for cleaner display
        if netloc.startswith('www.'):
            netloc = netloc[4:]
        return netloc or 'unknown'
    except Exception:
        return 'unknown'


def _detect_platform_from_url(url: str) -> str:
    """Guess the platform from the URL pattern. Returns domain name for unknown platforms."""
    url_lower = url.lower()
    if 'youtube.com' in url_lower or 'youtu.be' in url_lower:
        return 'youtube'
    if 'bilibili.com' in url_lower or 'b23.tv' in url_lower:
        return 'bilibili'
    if 'xiaohongshu.com' in url_lower or 'xhslink.com' in url_lower or 'xhs.link' in url_lower:
        return 'xhs'
    if 'mp.weixin.qq.com' in url_lower or 'weixin.qq.com' in url_lower:
        return 'wechat'
    if 'twitter.com' in url_lower or 'x.com' in url_lower:
        return 'twitter'
    if 't.me' in url_lower or 'telegram.org' in url_lower:
        return 'telegram'
    # For unknown platforms, return 'unknown' so they group under the "其他" filter
    return 'unknown'


async def _fetch_url_content(url: str) -> dict[str, str]:
    """
    Fetch content from a URL using x-reader (UniversalReader).
    Returns dict with: title, content, platform.
    Falls back to empty strings on failures.
    """
    try:
        from x_reader.reader import UniversalReader  # type: ignore[import]
        reader = UniversalReader()
        result = await asyncio.wait_for(reader.read(url), timeout=30.0)
        if result and getattr(result, "content", None):
            # x-reader uses 'source_type' (an Enum), not 'platform'
            raw_type = getattr(result, "source_type", None)
            platform_val = raw_type.value if raw_type else ""
            # If x-reader returned 'manual' (Jina fallback), use domain name instead
            if not platform_val or platform_val == "manual":
                platform_val = _detect_platform_from_url(url)
            return {
                "title": getattr(result, "title", None) or "",
                "content": result.content or "",
                "platform": platform_val,
            }
    except ImportError:
        logger.warning("[Scrapbook] x-reader not installed")
    except asyncio.TimeoutError:
        logger.warning("[Scrapbook] x-reader timed out for %s", url)
    except Exception as e:
        logger.warning("[Scrapbook] x-reader failed for %s: %s", url, e)

    # Fallback to Jina.ai
    logger.info("[Scrapbook] Falling back to jina.ai for %s", url)
    try:
        import httpx
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(f"https://r.jina.ai/{url}")
            if resp.status_code == 200:
                content = resp.text
                title = ""
                # Try to extract title from Jina's header
                lines = content.strip().split("\n")
                for line in lines[:15]:
                    if line.startswith("Title: "):
                        title = line.replace("Title: ", "").strip()
                        break
                if not title and lines:
                    for line in lines[:15]:
                        if line.startswith("# "):
                            title = line.replace("# ", "").strip()
                            break
                return {"title": title, "content": content, "platform": _detect_platform_from_url(url)}
    except Exception as fallback_err:
        logger.error("[Scrapbook] Jina.ai fallback failed: %s", fallback_err)

    return {"title": "", "content": "", "platform": _extract_domain(url)}


class TitleOnlyResponse(BaseModel):
    """Response model for scrapbook title generation."""
    title: str = Field(..., description="A short, concise secondary title extracted from the content, max 80 chars.")


def _get_output_value(output_obj: Any, *keys: str) -> Any:
    if not output_obj:
        return None
    if isinstance(output_obj, dict):
        for key in keys:
            if key in output_obj:
                return output_obj.get(key)
        return None
    for key in keys:
        if hasattr(output_obj, key):
            return getattr(output_obj, key)
    return None


async def _ai_generate_title(
    *,
    content: str,
    url: str,
    platform: str,
    provider: str,
    api_key: str,
    base_url: str | None,
    model: str | None,
) -> dict[str, str]:
    """
    Use the configured AI model to generate just a short title.
    Returns dict with: title.
    """
    # Limit snippet to 800 chars for extreme speed since we only need a title
    snippet = content[:800]
    messages = [
        {
            "role": "system",
            "content": (
                "You are an expert content analyzer. Given a piece of web content (article, video transcript, etc), "
                "extract a clear, concise title (max 80 chars).\n\n"
                "## Output\n"
                'Return JSON with the key "title".'
            ),
        },
        {
            "role": "user",
            "content": (
                f"Platform: {platform}\nURL: {url}\n\nContent:\n{snippet}"
            ),
        },
    ]
    response_format = {"type": "json_object"} if provider != "gemini" else None
    request = StreamChatRequest(
        provider=provider,
        apiKey=api_key,
        baseUrl=base_url,
        model=model,
        messages=messages,
        tools=[],
        toolIds=[],
        userTools=[],
        responseFormat=response_format,
        output_schema=TitleOnlyResponse,
        skipDefaultTools=True,
        stream=True,
    )
    result = await run_agent_completion(request)

    content_str = result.get("content", "").strip()
    
    # Try structured output first
    output_obj = result.get("output")
    title = None

    if output_obj:
        title = _get_output_value(output_obj, "title")

    if not title:
        parsed = safe_json_parse(content_str) or {}
        if isinstance(parsed, dict):
            title = parsed.get("title")

    return {"title": str(title or "")[:120]}


async def _ai_generate_emoji(
    *,
    content: str,
    url: str,
    platform: str,
    provider: str,
    api_key: str,
    base_url: str | None,
    model: str | None,
) -> str:
    context = f"Platform: {platform}\nURL: {url}\n\n{content[:800]}".strip()
    try:
        result = await generate_emoji(
            provider=provider,
            first_message=context,
            api_key=api_key,
            base_url=base_url,
            model=model,
        )
        emojis = result.get("emojis") or []
        if isinstance(emojis, list) and emojis:
            return str(emojis[0]).strip()
    except Exception as exc:
        logger.warning("[Scrapbook] Emoji generation failed: %s", exc)
    return ""


# ---------------------------------------------------------------------------
# GET /scrapbook
# ---------------------------------------------------------------------------

@router.get("/scrapbook")
async def list_scrapbook(
    platform: str | None = None,
    q: str | None = None,
    limit: int = 50,
    database_provider: str | None = None,
) -> JSONResponse:
    """Return saved scrapbook entries, newest first."""
    adapter = get_db_adapter(database_provider)
    if not adapter:
        raise HTTPException(status_code=503, detail="No database provider configured")

    filters: list[DbFilter] = []
    if platform and platform != "all":
        filters.append(DbFilter(op="eq", column="platform", value=platform))
    if q:
        filters.append(DbFilter(op="ilike", column="title", value=q))

    req = DbQueryRequest(
        providerId=adapter.config.id,
        action="select",
        table="scrapbook",
        columns=[
            "id",
            "title",
            "emoji",
            "summary",
            "source_url",
            "platform",
            "thumbnail",
            "tags",
            "created_at",
        ],
        filters=filters or None,
        order=[DbOrder(column="created_at", ascending=False)],
        limit=limit,
    )
    result = adapter.execute(req)
    return JSONResponse(content={"items": result.data or [], "error": result.error})


# ---------------------------------------------------------------------------
# POST /scrapbook
# ---------------------------------------------------------------------------

@router.post("/scrapbook")
async def create_scrapbook_entry(request: Request) -> JSONResponse:
    """
    Create a scrapbook entry.

    When source_url is provided (and title/content are empty), the backend will:
      1. Fetch the URL content using x-reader (auto-detects platform).
      2. Call the configured AI model to generate title + summary.

    Request body:
        source_url      str | None  — URL to fetch
        platform        str         — platform hint (overridden if x-reader detects one)
        title           str         — user-provided title (skips AI if given)
        summary         str         — user-provided summary (skips AI if given)
        content         str         — user-provided content
        thumbnail       str | None  — cover image URL
        tags            list[str]
        database_provider str | None

        # AI model config (used when generating title/summary)
        provider        str         — e.g. "gemini", "siliconflow"
        api_key         str         — API key for the provider
        base_url        str | None  — optional custom base URL
        model           str | None  — model name
    """
    body: dict[str, Any] = await request.json()

    source_url = (body.get("source_url") or "").strip()
    title = (body.get("title") or "").strip()
    emoji = (body.get("emoji") or "").strip()
    summary = (body.get("summary") or "").strip()
    content = (body.get("content") or "").strip()
    platform = (body.get("platform") or "manual").strip()
    thumbnail = body.get("thumbnail")
    tags = body.get("tags") or []
    database_provider = body.get("database_provider")

    # AI model config
    provider = (body.get("provider") or "gemini").strip()
    api_key = (body.get("api_key") or body.get("apiKey") or "").strip()
    base_url = body.get("base_url") or body.get("baseUrl")
    model = body.get("model")

    # ── Step 1: Detect platform and fetch content via x-reader if needed ────
    fetched_title = ""
    
    # Try pattern matching on URL first if platform is manual or unknown
    if source_url and platform in ("manual", "unknown", ""):
        guessed_platform = _detect_platform_from_url(source_url)
        if guessed_platform != "unknown":
            platform = guessed_platform

    if source_url and not content:
        fetched = await _fetch_url_content(source_url)
        content = fetched.get("content", "").strip()
        fetched_title = fetched.get("title", "").strip()
        # Override platform with x-reader's detected value only if we still don't have a good one
        if fetched.get("platform") and fetched["platform"] not in ("", "unknown") and platform in ("manual", "unknown", ""):
            platform = fetched["platform"]
            
        # If we STILL have no content after fetching, we must fail.
        # Otherwise we end up saving an empty scrapbook entry.
        if not content:
            raise HTTPException(status_code=400, detail="Unable to read webpage content due to network or copyright restrictions.")

    if not source_url and not content and not title:
        raise HTTPException(status_code=400, detail="Provide source_url, content, or title")

    # ── Step 2: Concurrently generate title + emoji via AI ──────────────────
    # Skip AI title if we already have one (user-provided or fetched by x-reader).
    if not title:
        title = fetched_title  # may still be empty — AI will fill it

    needs_ai_title = not title and bool(api_key)
    needs_ai_emoji = not emoji and bool(api_key)

    if needs_ai_title or needs_ai_emoji:
        context_for_ai = content or source_url  # _ai_* functions truncate internally

        title_coro = (
            _ai_generate_title(
                content=context_for_ai,
                url=source_url,
                platform=platform,
                provider=provider,
                api_key=api_key,
                base_url=base_url,
                model=model,
            )
            if needs_ai_title
            else asyncio.sleep(0)  # no-op placeholder
        )
        emoji_coro = (
            _ai_generate_emoji(
                content=title or context_for_ai or source_url,
                url=source_url or "",
                platform=platform,
                provider=provider,
                api_key=api_key,
                base_url=base_url,
                model=model,
            )
            if needs_ai_emoji
            else asyncio.sleep(0)  # no-op placeholder
        )

        try:
            title_result, emoji_result = await asyncio.gather(
                title_coro, emoji_coro, return_exceptions=True
            )
            if needs_ai_title and isinstance(title_result, dict):
                title = title_result.get("title") or title
            if needs_ai_emoji and isinstance(emoji_result, str):
                emoji = emoji_result.strip()
        except Exception as exc:
            logger.error("[Scrapbook] Concurrent AI generation failed: %s", exc)

    # Final fallback for title
    if not title:
        title = (content[:80] if content else source_url) or "Untitled"

    # ── Step 3: Persist to DB ─────────────────────────────────────────────────
    adapter = get_db_adapter(database_provider)
    if not adapter:
        raise HTTPException(status_code=503, detail="No database provider configured")

    now = _utc_now()
    entry: dict[str, Any] = {
        "id": str(uuid.uuid4()),
        "title": title,
        "emoji": emoji or None,
        "summary": summary,
        "content": content,
        "source_url": source_url or None,
        "platform": platform,
        "thumbnail": thumbnail,
        "tags": tags,
        "created_at": now,
        "updated_at": now,
    }

    req = DbQueryRequest(
        providerId=adapter.config.id,
        action="insert",
        table="scrapbook",
        values=entry,
        single=True,
    )
    result = adapter.execute(req)
    if result.error:
        logger.error("[Scrapbook] Insert failed: %s", result.error)
        raise HTTPException(status_code=500, detail=result.error)

    return JSONResponse(status_code=201, content={"item": result.data or entry})


# ---------------------------------------------------------------------------
# GET /scrapbook/{entry_id}
# ---------------------------------------------------------------------------

@router.get("/scrapbook/{entry_id}")
async def get_scrapbook_entry(
    entry_id: str,
    database_provider: str | None = None,
) -> JSONResponse:
    """Get a scrapbook entry by id."""
    adapter = get_db_adapter(database_provider)
    if not adapter:
        raise HTTPException(status_code=503, detail="No database provider configured")

    req = DbQueryRequest(
        providerId=adapter.config.id,
        action="select",
        table="scrapbook",
        filters=[DbFilter(op="eq", column="id", value=entry_id)],
        single=True,
    )
    result = adapter.execute(req)
    if result.error:
        raise HTTPException(status_code=500, detail=result.error)
    if not result.data:
        raise HTTPException(status_code=404, detail="Entry not found")

    return JSONResponse(content={"item": result.data})


# ---------------------------------------------------------------------------
# PATCH /scrapbook/{entry_id}
# ---------------------------------------------------------------------------

@router.patch("/scrapbook/{entry_id}")
async def update_scrapbook_entry(
    entry_id: str,
    request: Request,
) -> JSONResponse:
    """Update a scrapbook entry (e.g. summary)."""
    body: dict[str, Any] = await request.json()
    database_provider = body.pop("database_provider", None)

    adapter = get_db_adapter(database_provider)
    if not adapter:
        raise HTTPException(status_code=503, detail="No database provider configured")

    if not body:
        return JSONResponse(content={"item": {"id": entry_id}})

    body["updated_at"] = _utc_now()

    req = DbQueryRequest(
        providerId=adapter.config.id,
        action="update",
        table="scrapbook",
        payload=body,
        filters=[DbFilter(op="eq", column="id", value=entry_id)],
    )
    result = adapter.execute(req)
    if result.error:
        raise HTTPException(status_code=500, detail=result.error)

    return JSONResponse(content={"item": {"id": entry_id, **body}})


# ---------------------------------------------------------------------------
# DELETE /scrapbook/{entry_id}
# ---------------------------------------------------------------------------

@router.delete("/scrapbook/{entry_id}")
async def delete_scrapbook_entry(
    entry_id: str,
    database_provider: str | None = None,
) -> JSONResponse:
    """Delete a scrapbook entry by id."""
    adapter = get_db_adapter(database_provider)
    if not adapter:
        raise HTTPException(status_code=503, detail="No database provider configured")

    req = DbQueryRequest(
        providerId=adapter.config.id,
        action="delete",
        table="scrapbook",
        filters=[DbFilter(op="eq", column="id", value=entry_id)],
    )
    result = adapter.execute(req)
    if result.error:
        raise HTTPException(status_code=500, detail=result.error)

    return JSONResponse(content={"deleted": entry_id})
