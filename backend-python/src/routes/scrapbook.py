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
from ..services.generation import generate_emoji, generate_title
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
    if not url:
        return 'unknown'
    from urllib.parse import urlparse
    try:
        u = url.strip()
        # urlparse requires a scheme to identify netloc
        if '://' not in u and not u.startswith('//'):
            u = 'https://' + u
        netloc = urlparse(u).netloc.lower()
        # Strip 'www.' prefix for cleaner display
        if netloc.startswith('www.'):
            netloc = netloc[4:]
        return netloc or 'unknown'
    except Exception:
        return 'unknown'


def _detect_platform_from_url(url: str) -> str:
    """Guess the platform from the URL pattern. Returns domain name for unknown platforms."""
    domain = _extract_domain(url)
    
    if domain in ('youtube.com', 'youtu.be'):
        return 'youtube'
    if domain in ('bilibili.com', 'b23.tv'):
        return 'bilibili'
    if domain in ('xiaohongshu.com', 'xhslink.com', 'xhs.link'):
        return 'xhs'
    if domain in ('mp.weixin.qq.com', 'weixin.qq.com'):
        return 'wechat'
    if domain in ('twitter.com', 'x.com'):
        return 'twitter'
    if domain in ('t.me', 'telegram.org'):
        return 'telegram'
    
    # For unknown platforms, use domain name instead of 'unknown' so it shows up nicely in the UI
    return domain


async def _is_browser_missing() -> bool:
    """
    Check if Playwright Chromium is missing.
    """
    try:
        # Check if the playwright command exists and chromium is installed
        # A more lightweight check than actually launching a browser
        import shutil
        if not shutil.which("playwright"):
            # If playwright CLI is missing, it's definitely missing
            return True
            
        # Try to see if we can find the chromium executable path via playwright CLI
        process = await asyncio.create_subprocess_exec(
            "playwright", "install", "--help",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, _ = await process.communicate()
        # If we can't even run help, something is wrong
        if process.returncode != 0:
            return True
            
        # Actually, the most reliable way without launching is checking the cache directory
        # But that's platform dependent. 
        # For now, we'll rely on catching the specific error message in the caller.
        return False
    except Exception:
        return True

async def _fetch_url_content(url: str) -> dict[str, str]:
    """
    Fetch content from a URL using x-reader (UniversalReader).
    Returns dict with: title, content, platform.
    Falls back to empty strings on failures.
    """
    try:
        from x_reader.reader import UniversalReader  # type: ignore[import]
        reader = UniversalReader()
        
        # We use a consistent timeout for all requests. 
        # Browser-based fetching is naturally slower, so we allow 50s.
        result = await asyncio.wait_for(reader.read(url), timeout=50.0)
        
        if result and getattr(result, "content", None):
            # x-reader uses 'source_type' (an Enum), not 'platform'
            raw_type = getattr(result, "source_type", None)
            platform_val = raw_type.value if raw_type else ""
            
            # Override x-reader's buggy "x.com in url" check
            actual_platform = _detect_platform_from_url(url)
            if platform_val == "twitter" and actual_platform != "twitter":
                platform_val = actual_platform

            # If x-reader returned 'manual' (Jina fallback), use domain name instead
            if not platform_val or platform_val == "manual":
                platform_val = actual_platform
            
            return {
                "title": getattr(result, "title", None) or "",
                "content": result.content or "",
                "platform": platform_val,
            }
    except ImportError:
        logger.warning("[Scrapbook] x-reader not installed")
    except asyncio.TimeoutError:
        logger.warning("[Scrapbook] x-reader timed out for %s", url)
        # On timeout, we don't assume the engine is missing unless confirmed.
    except Exception as e:
        err_msg = str(e).lower()
        # Look for playwright specific missing executable strings
        if "playwright install" in err_msg or "executable doesn't exist" in err_msg:
            logger.warning("[Scrapbook] Scraper engine (browser) missing for %s", url)
            raise HTTPException(status_code=412, detail="MISSING_SCRAPER_ENGINE")
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


                return {"title": title, "content": content, "platform": _detect_platform_from_url(url)}
    except Exception as fallback_err:
        logger.error("[Scrapbook] Jina.ai fallback failed: %s", fallback_err)

    return {"title": "", "content": "", "platform": _extract_domain(url)}





# ---------------------------------------------------------------------------
# GET /scrapbook
# ---------------------------------------------------------------------------

@router.get("/scrapbook")
async def list_scrapbook(
    platform: str | None = None,
    q: str | None = None,
    limit: int = 50,
    cursor: str | None = None,
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
    if cursor:
        filters.append(DbFilter(op="lt", column="created_at", value=cursor))

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
        # Sanitize fetched_title: if Jina or x-reader put metadata in the title field, discard it
        if "URL Source:" in fetched_title or "Markdown Content:" in fetched_title:
            fetched_title = ""
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

    # Double check if title is polluted
    if "URL Source:" in title or "Markdown Content:" in title:
        title = ""

    needs_ai_title = not title and bool(api_key)
    needs_ai_emoji = not emoji and bool(api_key)

    if needs_ai_title or needs_ai_emoji:
        prompt_lines = [
            f"Platform: {platform or 'unknown'}",
        ]
        if source_url:
            prompt_lines.append(f"Source URL: {source_url}")
        prompt_lines.extend([
            "",
            "Content excerpt:",
            str(content or title or source_url or "")[:3000]
        ])
        prompt_text = "\n".join(prompt_lines)

        title_coro = (
            generate_title(
                provider=provider,
                first_message=prompt_text,
                api_key=api_key,
                base_url=base_url,
                model=model,
            )
            if needs_ai_title
            else asyncio.sleep(0)  # no-op placeholder
        )
        emoji_coro = (
            generate_emoji(
                provider=provider,
                first_message=prompt_text,
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
            if needs_ai_emoji and isinstance(emoji_result, dict):
                emoji_list = emoji_result.get("emojis") or []
                if isinstance(emoji_list, list) and emoji_list:
                    emoji = str(emoji_list[0]).strip()
        except Exception as exc:
            logger.error("[Scrapbook] Concurrent AI generation failed: %s", exc)

    logger.info(f"[Scrapbook DEBUG] after AI gather, title={title!r}, emoji={emoji!r}")

    # Final fallback for title
    if not title:
        safe_fallback = content
        if "Markdown Content:" in safe_fallback:
            safe_fallback = safe_fallback.split("Markdown Content:", 1)[-1].strip()
        title = (safe_fallback[:80] if safe_fallback else source_url) or "Untitled"
        title = title.replace('\n', ' ').strip()

    # Final safety check: if we have a source URL but platform is still generic, force domain extraction
    if source_url and platform in ("manual", "unknown", ""):
        domain_fallback = _extract_domain(source_url)
        if domain_fallback != "unknown":
            platform = domain_fallback

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
