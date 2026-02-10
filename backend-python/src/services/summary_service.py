import json
import uuid
from datetime import datetime
from typing import Any

from agno.agent import Agent
from agno.utils.log import logger

from ..services.agent_registry import get_summary_model


async def update_session_summary(
    conversation_id: str,
    old_summary: dict[str, Any] | None,
    new_messages: list[dict[str, Any]],
    database_provider: str | None = None,
    memory_provider: str | None = None,
    memory_model: str | None = None,
    memory_api_key: str | None = None,
    memory_base_url: str | None = None,
    # New separate summary config
    summary_provider: str | None = None,
    summary_model: str | None = None,
    summary_api_key: str | None = None,
    summary_base_url: str | None = None,
    rebuild_from_scratch: bool = False,
) -> None:
    """
    Async background task to update session summary.
    
    Args:
        conversation_id: The conversation UUID
        old_summary: The current session summary JSON (or None)
        new_messages: List of recent messages to incorporate (User + AI)
        database_provider: The database provider ID
        memory_provider: Optional provider override
        memory_model: Optional model override
        memory_api_key: Optional API key override
        memory_base_url: Optional base URL override
    """
    try:
        # 1. Validation
        logger.info(f"Triggering update_session_summary for {conversation_id}. Messages count: {len(new_messages)}")
        if not conversation_id or not new_messages:
            logger.warning("Missing conversation_id or new_messages for summary update")
            return

        # Only process if we have user input and AI response
        # Should contain at least one user message and one assistant message from the latest turn

        # 2. Get Lite Model
        # We need a dummy request object to reuse get_summary_model logic or just use global settings
        # Creating a simple namespace to mock 'request' for get_summary_model
        from types import SimpleNamespace
        dummy_request = SimpleNamespace(
            memory_provider=memory_provider,
            memory_model=memory_model,
            memory_api_key=memory_api_key,
            memory_base_url=memory_base_url,
            summary_provider=summary_provider,
            summary_model=summary_model,
            summary_api_key=summary_api_key,
            summary_base_url=summary_base_url,
        )
        summary_model = get_summary_model(dummy_request)

        if not summary_model:
            logger.warning(f"Skipping session summary update for {conversation_id}: No summary model configured")
            return

        # 2a. Re-fetch Latest Summary from DB to avoid race conditions
        # The old_summary passed from stream_chat might be stale if requests were fast.
        from ..models.db import DbFilter, DbQueryRequest
        from .db_service import execute_db_async, get_db_adapter

        adapter = get_db_adapter(database_provider)
        if rebuild_from_scratch:
            old_summary = None
        elif adapter:
            try:
                latest_req = DbQueryRequest(
                    providerId=adapter.config.id,
                    action="select",
                    table="conversations",
                    columns=["session_summary"],
                    filters=[DbFilter(op="eq", column="id", value=conversation_id)],
                    maybeSingle=True,
                )
                latest_res = await execute_db_async(adapter, latest_req)
                if latest_res.data and isinstance(latest_res.data, dict):
                    row = latest_res.data
                    raw_summary = row.get("session_summary")
                    if raw_summary:
                        if isinstance(raw_summary, str):
                            try:
                                old_summary = json.loads(raw_summary)
                            except:
                                pass
                        elif isinstance(raw_summary, dict):
                            old_summary = raw_summary
            except Exception as db_exc:
                logger.warning(f"Failed to re-fetch latest summary, using passed old_summary: {db_exc}")

        # 3. Prepare Prompt
        if rebuild_from_scratch:
            current_summary_text = "None (Starting Fresh Rebuild)"
            task_instruction = """Summarize the conversation history from the provided lines into a fresh narrative summary.
- **CRITICAL: Discard any previous context not present in the new lines.**
- Create a concise narrative summary of the complete conversation history."""
        else:
            current_summary_text = old_summary.get("summary", "") if old_summary else "No summary yet."
            task_instruction = """Integrate the new lines into the existing summary.
- **CRITICAL: You MUST PRESERVE all important details from the 'Current Summary'. Do NOT discard existing topics.**
- Merge new information naturally."""

        # Extract text content from new messages
        conversation_text = ""
        for msg in new_messages:
            role = msg.get("role", "unknown")
            content = msg.get("content", "")
            if content:
                conversation_text += f"{role.upper()}: {content}\n"

        prompt = f"""
You are an expert conversation summarizer.
Current Summary:
{current_summary_text}

New Conversation Lines:
{conversation_text}

Task:
{task_instruction}
- Keep the summary concise but comprehensive (under 500 words).
- **Maintain a concise list of high-level topics (max 5 total). avoid granular details as topics.**
- Output valid JSON format matching the schema below exactly.

Expected JSON Structure:
{{
    "summary": "The narrative summary...",
    "topics": ["topic1", "topic2"],
    "last_active_date": "YYYY-MM-DD"
}}
        
Time: {datetime.now().isoformat()}
"""

        # 4. Generate Summary (Non-streaming)
        agent = Agent(
            model=summary_model,
            description="You are a session summarizer.",
            instructions="Output JSON only.",
        )

        response = await agent.arun(prompt)
        new_summary_text = response.content

        # 5. Parse Response
        # Try to parse strict JSON, if failed, wrap the text
        # Define error keywords to check against
        error_keywords = ["balance", "quota", "insufficient", "unauthorized", "rate limit", "error", "401", "429", "500"]

        try:
            # Clean potential markdown code blocks
            clean_text = new_summary_text.replace("```json", "").replace("```", "").strip()
            summary_data = json.loads(clean_text)

            # Validate JSON structure
            if not isinstance(summary_data, dict) or "summary" not in summary_data:
                logger.warning(f"Invalid summary JSON structure from model: {summary_data}")
                # If parsed but invalid structure, treat as failed logic... (omitted detailed comment for brevity)
            else:
                # VALIDATE CONTENT: Check if the summary text itself is an error message
                summary_content = str(summary_data.get("summary", "")).lower()
                if any(kw in summary_content for kw in error_keywords) and len(summary_content) < 100:
                    logger.error(f"Summary content looks like a provider error: {summary_data['summary']}")
                    return # Stop here to avoid overwriting with error text

        except json.JSONDecodeError:
            # Check for API error keywords in the raw text
            lower_text = new_summary_text.lower()
            if any(kw in lower_text for kw in error_keywords) and len(new_summary_text) < 100:
                logger.error(f"Summary generation failed with API error message: {new_summary_text}")
                return # CRITICAL: Stop here. Do not overwrite DB with error message.

            # Fallback if model didn't output JSON but text looks like a valid summary (not an error)
            summary_data = {
                "summary": new_summary_text,
                "topics": [],
                "last_run_id": str(uuid.uuid4())
            }

        # Ensure last_run_id is set (or updated)
        if "last_run_id" not in summary_data:
            summary_data["last_run_id"] = str(uuid.uuid4())

        summary_data["updated_at"] = datetime.now().isoformat()

        # 6. Update Database
        from ..models.db import DbFilter, DbQueryRequest
        from .db_service import get_db_adapter

        adapter = get_db_adapter(database_provider) # Use request-selected provider when available
        if adapter:
            # We update the JSONB session_summary column
            logger.debug(f"Updating summary using adapter {adapter.config.type} for {conversation_id}")

            req = DbQueryRequest(
                providerId=adapter.config.id,
                action="update",
                table="conversations",
                payload={"session_summary": summary_data},
                filters=[DbFilter(op="eq", column="id", value=conversation_id)],
            )

            result = await execute_db_async(adapter, req)

            if result.error:
                 logger.error(f"Failed to update session summary DB: {result.error}")
            else:
                 logger.info(f"Updated session summary for {conversation_id}")
        else:
             logger.warning("No DB adapter available for summary update")

    except Exception as e:
        logger.error(f"Failed to update session summary: {e}")
