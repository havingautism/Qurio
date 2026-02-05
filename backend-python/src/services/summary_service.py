from datetime import datetime
import json
import uuid
from typing import Optional, Dict, Any, List
from agno.agent import Agent
from agno.utils.log import logger
from ..services.agent_registry import get_summary_model

async def update_session_summary(
    conversation_id: str,
    old_summary: Optional[Dict[str, Any]],
    new_messages: List[Dict[str, Any]]
) -> None:
    """
    Async background task to update session summary.
    
    Args:
        conversation_id: The conversation UUID
        old_summary: The current session summary JSON (or None)
        new_messages: List of recent messages to incorporate (User + AI)
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
        dummy_request = SimpleNamespace() 
        summary_model = get_summary_model(dummy_request)
        
        if not summary_model:
            logger.warning(f"Skipping session summary update for {conversation_id}: No summary model configured")
            return

        # 2a. Re-fetch Latest Summary from DB to avoid race conditions
        # The old_summary passed from stream_chat might be stale if requests were fast.
        from ..models.db import DbFilter, DbQueryRequest
        from .db_service import get_db_adapter
        
        adapter = get_db_adapter()
        if adapter:
            try:
                latest_req = DbQueryRequest(
                    providerId=adapter.config.id,
                    action="select",
                    table="conversations",
                    columns=["session_summary"],
                    filters=[DbFilter(op="eq", column="id", value=conversation_id)],
                    single=True
                )
                latest_res = adapter.execute(latest_req)
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
        current_summary_text = old_summary.get("summary", "") if old_summary else "No summary yet."
        
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
Integrate the new lines into the existing summary.
- **CRITICAL: You MUST PRESERVE all important details from the 'Current Summary'. Do NOT discard existing topics.**
- Merge new information naturally.
- Keep the summary concise but comprehensive (under 500 words).
- **Maintain a concise list of high-level topics (max 5 total). avoid granular details as topics.**
- Output valid JSON format matching the schema below exactly.

Expected JSON Structure:
{{
    "summary": "The consolidated narrative summary of the conversation history...",
    "topics": ["topic1", "topic2", "topic3"],
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
        try:
            # Clean potential markdown code blocks
            clean_text = new_summary_text.replace("```json", "").replace("```", "").strip()
            summary_data = json.loads(clean_text)
        except json.JSONDecodeError:
            # Fallback if model didn't output JSON
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
        
        adapter = get_db_adapter() # Use default or configured provider
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
            
            result = adapter.execute(req)
            
            if result.error:
                 logger.error(f"Failed to update session summary DB: {result.error}")
            else:
                 logger.info(f"Updated session summary for {conversation_id}")
        else:
             logger.warning("No DB adapter available for summary update")
            
    except Exception as e:
        logger.error(f"Failed to update session summary: {e}")
