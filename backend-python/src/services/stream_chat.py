"""
Stream chat service implemented with Agno SDK (Agent + tools + DB).
"""

from __future__ import annotations

import ast
import asyncio
import json
import os
import re
import time
from datetime import datetime
from typing import Any, AsyncGenerator
from zoneinfo import ZoneInfo

from agno.agent import Agent, RunEvent
from agno.memory.strategies.types import MemoryOptimizationStrategyType
from agno.run.agent import ToolCallCompletedEvent, ToolCallStartedEvent
from agno.utils.log import logger

from ..models.stream_chat import (
    DoneEvent,
    ErrorEvent,
    FormRequestEvent,  # New: HITL form request event
    SourceEvent,
    StreamChatRequest,
    TextEvent,
    ThoughtEvent,
    ToolCallEvent,
    ToolResultEvent,
)
from .agent_registry import get_agent_for_provider
from .tool_registry import resolve_tool_name
from .hitl_storage import get_hitl_storage
from .summary_service import update_session_summary
from sqlalchemy import text


TIME_KEYWORDS_REGEX = re.compile(
    r"\u4eca\u5929|\u4eca\u5e74|\u73b0\u5728|\u672c\u5468|\u672c\u6708|\u6700\u8fd1|\u521a\u521a|"
    r"\u660e\u5929|\u6628\u5929|\u4e0a\u5468|\u4e0a\u4e2a\u6708|\u53bb\u5e74|"
    r"today|current|now|this week|this month|recently|tomorrow|yesterday|last week|last month|last year",
    re.IGNORECASE,
)

MEMORY_OPTIMIZE_THRESHOLD = 50
MEMORY_OPTIMIZE_INTERVAL_SECONDS = 60 * 60 * 12
THOUGHT_BLOCK_BREAK_MARKER = "<|thought_block_break|>"


def _strip_internal_tool_trace(text: str) -> str:
    """Remove internal tool-call protocol traces accidentally emitted by some models."""
    if not text:
        return ""
    cleaned = str(text)
    cleaned = re.sub(r"</?(?:think|thought)>", "", cleaned, flags=re.IGNORECASE)
    marker_idx = cleaned.find("<|tool_")
    if marker_idx >= 0:
        cleaned = cleaned[:marker_idx]
    cleaned = re.sub(r"(?:^|\n)\s*functions\.[^\n]*", "", cleaned, flags=re.IGNORECASE)
    return cleaned


def _is_stream_trace_enabled() -> bool:
    value = str(os.getenv("QURIO_STREAM_TRACE", "")).strip().lower()
    return value in {"1", "true", "yes", "on", "debug"}


def _preview(text: Any, limit: int = 140) -> str:
    raw = str(text or "").replace("\n", "\\n")
    return raw[:limit] + ("..." if len(raw) > limit else "")

class TaggedTextHandler:
    def __init__(self):
        self.in_thought_block = False
        self._buffer = ""

    def _split_for_partial_tag(self, text: str, candidates: list[str]) -> tuple[str, str]:
        if not text:
            return "", ""
        lower = text.lower()
        max_keep = 0
        max_candidate_len = max(len(c) for c in candidates)
        scan_len = min(len(text), max_candidate_len - 1)
        for keep_len in range(scan_len, 0, -1):
            suffix = lower[-keep_len:]
            if any(candidate.startswith(suffix) for candidate in candidates):
                max_keep = keep_len
                break
        if max_keep <= 0:
            return text, ""
        return text[:-max_keep], text[-max_keep:]

    def handle(self, text: str, final: bool = False):
        remaining = f"{self._buffer}{text or ''}"
        self._buffer = ""
        open_tags = ["<think>", "<thought>"]
        close_tags = ["</think>", "</thought>"]
        while remaining:
            if not self.in_thought_block:
                # Use regex to find start of thought block
                match = re.search(r"<(think|thought)>", remaining, re.IGNORECASE)
                if not match:
                    if final:
                        yield "text", remaining
                    else:
                        emit_text, keep = self._split_for_partial_tag(remaining, open_tags)
                        if emit_text:
                            yield "text", emit_text
                        self._buffer = keep
                    return
                
                start_index = match.start()
                if start_index > 0:
                    yield "text", remaining[:start_index]
                
                remaining = remaining[match.end():]
                self.in_thought_block = True
            else:
                # Use regex to find end of thought block
                match = re.search(r"</(think|thought)>", remaining, re.IGNORECASE)
                if not match:
                    if final:
                        # If model forgets closing tag, do not swallow remaining user-facing content.
                        yield "text", remaining
                        self.in_thought_block = False
                    else:
                        emit_thought, keep = self._split_for_partial_tag(remaining, close_tags)
                        if emit_thought:
                            yield "thought", emit_thought
                        self._buffer = keep
                    return
                
                end_index = match.start()
                if end_index > 0:
                    yield "thought", remaining[:end_index]
                
                remaining = remaining[match.end():]
                self.in_thought_block = False

class StreamChatService:
    """Stream chat service implemented using Agno Agent streaming events."""

    def __init__(self) -> None:
        self._last_memory_optimization: dict[str, float] = {}

    async def stream_chat(
        self,
        request: StreamChatRequest,
    ) -> AsyncGenerator[dict[str, Any], None]:
        """
        Stream chat completion with HITL support.
        
        If request.run_id is present, this is a resumption request after form submission.
        Otherwise, this is a normal chat request.
        """
        # ================================================================
        # HITL: Check if this is a resumption request
        # ================================================================
        if request.run_id and request.field_values:
            logger.info(f"Detected HITL resumption request (run_id: {request.run_id})")
            async for event in self._continue_hitl_run(request):
                yield event
            return
        
        # ================================================================
        # Normal chat flow
        # ================================================================
        try:
            if not request.provider:
                raise ValueError("Missing required field: provider")
            if not request.messages:
                raise ValueError("Missing required field: messages")

            agent = get_agent_for_provider(request)
            sources_map: dict[str, Any] = {}
            full_content = ""
            full_thought = ""
            tool_start_times: dict[str, float] = {}
            should_break_next_thought = False
            in_reasoning_phase = False
            reasoning_closed_for_current_cycle = False
            stream_trace = _is_stream_trace_enabled()
            
            tagged_handler = TaggedTextHandler()

            def trace_stream(stage: str, **kwargs: Any) -> None:
                if not stream_trace:
                    return
                payload = ", ".join([f"{k}={v}" for k, v in kwargs.items()])
                logger.info(f"[STREAM_TRACE][main] {stage} | {payload}")

            def emit_thought_part(part: str):
                nonlocal full_thought, should_break_next_thought, in_reasoning_phase, reasoning_closed_for_current_cycle
                text = _strip_internal_tool_trace(str(part or ""))
                if not text:
                    return
                if reasoning_closed_for_current_cycle:
                    trace_stream("drop_reasoning_after_content", reasoning_preview=_preview(text))
                    return

                if should_break_next_thought and not in_reasoning_phase and full_thought.strip():
                    separator = f"\n\n{THOUGHT_BLOCK_BREAK_MARKER}\n\n"
                    full_thought += separator
                    yield ThoughtEvent(content=separator).model_dump()
                should_break_next_thought = False
                in_reasoning_phase = True
                full_thought += text
                trace_stream("emit_reasoning", reasoning_preview=_preview(text))
                yield ThoughtEvent(content=text).model_dump()

            def process_text(text: str, parse_tags: bool = True):
                nonlocal full_content, in_reasoning_phase, should_break_next_thought, reasoning_closed_for_current_cycle
                if not parse_tags:
                    clean_text = _strip_internal_tool_trace(text)
                    if clean_text:
                        in_reasoning_phase = False
                        should_break_next_thought = True
                        reasoning_closed_for_current_cycle = True
                        full_content += clean_text
                        yield TextEvent(content=clean_text).model_dump()
                    return

                for type, part in tagged_handler.handle(text):
                    if type == "text":
                        clean_part = _strip_internal_tool_trace(part)
                        if clean_part:
                            in_reasoning_phase = False
                            should_break_next_thought = True
                            reasoning_closed_for_current_cycle = True
                            full_content += clean_part
                            yield TextEvent(content=clean_part).model_dump()
                    else:
                        if reasoning_closed_for_current_cycle:
                            # If reasoning already ended in this cycle, treat stray tag-based thought as content.
                            clean_part = _strip_internal_tool_trace(part)
                            if clean_part:
                                full_content += clean_part
                                yield TextEvent(content=clean_part).model_dump()
                            continue
                        for event in emit_thought_part(part):
                            yield event

            def _extract_text_chunk(run_event: Any) -> str:
                """Prefer model text deltas from both normalized and provider raw payloads."""
                content = getattr(run_event, "content", None)
                if isinstance(content, str) and content:
                    return content
                if content and not isinstance(content, str):
                    return str(content)

                provider_data = getattr(run_event, "model_provider_data", None)
                if isinstance(provider_data, dict):
                    choices = provider_data.get("choices") or []
                    if choices and isinstance(choices[0], dict):
                        delta = choices[0].get("delta") or {}
                        raw_content = delta.get("content")
                        if isinstance(raw_content, str) and raw_content:
                            return raw_content
                        if isinstance(raw_content, list):
                            parts: list[str] = []
                            for item in raw_content:
                                if isinstance(item, dict):
                                    text_part = item.get("text")
                                    if text_part:
                                        parts.append(str(text_part))
                            if parts:
                                return "".join(parts)
                return ""

            def _extract_reasoning_chunk(run_event: Any) -> str:
                reasoning = getattr(run_event, "reasoning_content", None)
                if isinstance(reasoning, str) and reasoning:
                    return reasoning
                if reasoning and not isinstance(reasoning, str):
                    return str(reasoning)

                provider_data = getattr(run_event, "model_provider_data", None)
                if isinstance(provider_data, dict):
                    choices = provider_data.get("choices") or []
                    if choices and isinstance(choices[0], dict):
                        delta = choices[0].get("delta") or {}
                        raw_reasoning = (
                            delta.get("reasoning_content")
                            or delta.get("reasoning")
                            or delta.get("reasoning_details")
                        )
                        if isinstance(raw_reasoning, str) and raw_reasoning:
                            return raw_reasoning
                        if isinstance(raw_reasoning, list):
                            parts: list[str] = []
                            for item in raw_reasoning:
                                if isinstance(item, dict):
                                    text_part = item.get("text") or item.get("content")
                                    if text_part:
                                        parts.append(str(text_part))
                            if parts:
                                return "".join(parts)
                return ""

            # Context management now handled by Agno's num_history_runs parameter
            messages = request.messages
            pre_events: list[dict[str, Any]] = []

            messages = self._inject_local_time_context(messages, request, pre_events)
            enabled_tool_names = self._collect_enabled_tool_names(request)
            messages = self._inject_tool_guidance(messages, enabled_tool_names, request)

            for event in pre_events:
                yield event

            # ================================================================
            # MANUAL CONTEXT MANAGEMENT (Rolling Summary + Fixed Window)
            # ================================================================
            
            # 1. Fetch Session Summary from DB
            session_summary_text = None
            old_summary_json = None
            if request.conversation_id:
                try:
                    from ..models.db import DbFilter, DbQueryRequest
                    from .db_service import execute_db_async, get_db_adapter
                    
                    adapter = get_db_adapter(request.database_provider)
                    if adapter:
                        req = DbQueryRequest(
                            providerId=adapter.config.id,
                            action="select",
                            table="conversations",
                            columns=["session_summary"],
                            filters=[DbFilter(op="eq", column="id", value=request.conversation_id)],
                            maybeSingle=True,
                        )
                        
                        result = await execute_db_async(adapter, req)
                        
                        if result.data and isinstance(result.data, dict):
                            row = result.data
                            raw_summary = row.get("session_summary")
                            
                            if raw_summary:
                                # Parsing handled by adapter often, but double check
                                if isinstance(raw_summary, str):
                                    try:
                                        old_summary_json = json.loads(raw_summary)
                                    except:
                                        pass
                                elif isinstance(raw_summary, dict):
                                    old_summary_json = raw_summary
                                
                                if old_summary_json:
                                    session_summary_text = old_summary_json.get("summary")
                except Exception as e:
                    logger.warning(f"Failed to fetch session summary: {e}")
                    logger.error(f"Failed to fetch session summary: {e}")

            # 2. Slice History (Turn-Based Window)
            # Strategy: Keep all System messages + Last N User turns (User + AI + Tools)
            # N comes from frontend context setting: contextTurns.
            raw_turn_limit = request.context_turn_limit
            turn_limit = (
                max(1, min(50, int(raw_turn_limit)))
                if isinstance(raw_turn_limit, int) and raw_turn_limit > 0
                else 2
            )
            
            # Separate System and Non-System
            system_messages = [m for m in messages if m.get("role") == "system"]
            chat_messages = [m for m in messages if m.get("role") != "system"]
            
            # Find the indices of User messages to determine run boundaries
            user_indices = [i for i, m in enumerate(chat_messages) if m.get("role") == "user"]
            
            user_turn_count = len(user_indices)
            if user_turn_count > turn_limit:
                cutoff_index = user_indices[-turn_limit]
                recent_history = chat_messages[cutoff_index:]
            else:
                recent_history = chat_messages

            # For single-turn requests (common during first-turn regenerate),
            # using persisted summary can re-introduce stale assistant text.
            # In this case, use fresh request messages only and rebuild summary from this turn.
            is_single_user_turn = user_turn_count <= 1
            # Force rebuild if it's the first turn OR if the user is editing/regenerating
            should_rebuild_summary = bool(is_single_user_turn or request.is_editing)
            # Inject summary only when history exceeds turn window and request is not rebuild flow.
            should_inject_summary = bool(session_summary_text) and (user_turn_count > turn_limit) and (not should_rebuild_summary)
            if not should_inject_summary and session_summary_text:
                logger.info(
                    "Skipping session summary injection (within turn window or single-turn rebuild context)."
                )
                session_summary_text = None
                old_summary_json = None
                
            # 3. Inject Summary into System Prompt
            if session_summary_text:
                summary_prompt = (
                    "\n\n<session_memory>\n"
                    "Here is a summary of the conversation so far. Use this to understand long-term context, "
                    "but prioritize the details in the recent messages below.\n"
                    f"{session_summary_text}\n"
                    "</session_memory>"
                )
                # Inject into the LAST system message, or create a new one if none exist
                if system_messages:
                    last_sys = system_messages[-1]
                    # Avoid appending if already present (defensive)
                    if "<session_memory>" not in str(last_sys.get("content", "")):
                        new_content = str(last_sys.get("content", "")) + summary_prompt
                        # Update the dict (need to be careful not to mutate original request list in place if reused, but here it's fine)
                        last_sys["content"] = new_content
                else:
                    system_messages.append({"role": "system", "content": summary_prompt})
            
            # Final Agent Input
            agent_input = system_messages + recent_history
            logger.info(
                f"Context Window: turn_limit={turn_limit}, user_turns={user_turn_count}, "
                f"{len(system_messages)} System + {len(recent_history)} Chat Messages"
            )

            stream = agent.arun(
                input=agent_input,
                stream=True,
                stream_events=True,
                user_id=request.user_id,
                session_id=request.conversation_id,
                output_schema=request.output_schema or request.response_format,
            )
            
            # ================================================================
            # Stream processing with HITL support 
            # ================================================================
            async for run_event in stream:
                # ============================================================
                # HITL: Check if agent paused for user input
                # ============================================================
                if hasattr(run_event, 'is_paused') and run_event.is_paused:
                    logger.info(f"Agent paused for HITL (run_id: {run_event.run_id})")
                    
                    # Extract requirements
                    requirements = getattr(run_event, 'active_requirements', None) or getattr(run_event, 'requirements', None)
                    
                    if requirements:
                        def _is_interactive_form(req: Any) -> bool:
                            if getattr(req, 'needs_external_execution', False):
                                tool_exec = getattr(req, 'tool_execution', None)
                                tool_name = getattr(tool_exec, 'tool_name', None) if tool_exec else None
                                return tool_name == "interactive_form"
                            tool_exec = getattr(req, 'tool_execution', None)
                            tool_name = getattr(tool_exec, 'tool_name', None) if tool_exec else None
                            return tool_name == "interactive_form"

                        form_requirements = [req for req in requirements if _is_interactive_form(req)]
                        if not form_requirements:
                            logger.info("Agent paused without interactive_form; skipping HITL form handling")
                            yield DoneEvent(
                                content=full_content or "",
                                thought=full_thought.strip() or None,
                                sources=list(sources_map.values()) or None,
                            ).model_dump()
                            return

                        # Save to Supabase
                        try:
                            hitl_storage = get_hitl_storage(request.database_provider)
                            saved = await hitl_storage.save_pending_run(
                                run_id=run_event.run_id,
                                requirements=form_requirements,
                                conversation_id=request.conversation_id,
                                user_id=request.user_id,
                                agent_model=request.model,
                                messages=messages,
                            )
                            if not saved:
                                raise RuntimeError("Failed to persist HITL pending run")
                            
                            # Extract form fields for frontend
                            for req in form_requirements:
                                # Handle external execution (e.g., interactive_form with external_execution=True)
                                if (hasattr(req, 'needs_external_execution') and req.needs_external_execution) or \
                                   (req.tool_execution and req.tool_execution.tool_name == "interactive_form"):
                                    
                                    tool_args = req.tool_execution.tool_args if req.tool_execution else {}
                                    form_id = tool_args.get('id')
                                    title = tool_args.get('title', 'Please provide the following information')
                                    fields = tool_args.get('fields', [])
                                    
                                    # Send form_request event to frontend
                                    yield FormRequestEvent(
                                        run_id=run_event.run_id,
                                        form_id=form_id,
                                        title=title,
                                        fields=fields
                                    ).model_dump()
                                
                                # Fallback handle traditional user input (e.g., get_user_input)
                                elif req.needs_user_input and req.user_input_schema:
                                    # Convert from user_input_schema
                                    form_id = None
                                    title = "Please provide the following information"
                                    fields = [
                                        {
                                            "name": field.name,
                                            "type": self._map_field_type_to_frontend(field.field_type),
                                            "label": field.description or field.name,
                                            "required": True,
                                            "value": field.value
                                        }
                                        for field in req.user_input_schema
                                    ]
                                    
                                    # Send form_request event to frontend
                                    yield FormRequestEvent(
                                        run_id=run_event.run_id,
                                        form_id=form_id,
                                        title=title,
                                        fields=fields
                                    ).model_dump()
                            
                            # Send done event to indicate pause
                            yield DoneEvent(
                                content=full_content or "",
                                thought=full_thought.strip() or None,
                                sources=list(sources_map.values()) or None,
                            ).model_dump()
                            
                            logger.info(f"HITL pause successful, waiting for user submission (run_id: {run_event.run_id})")
                            return  # Exit stream, wait for user to submit form
                            
                        except Exception as e:
                            logger.error(f"Failed to save HITL state: {e}")
                            yield ErrorEvent(error=f"Failed to pause for form: {str(e)}").model_dump()
                            return
                    else:
                        logger.warning("Agent paused but no requirements found")
                        yield DoneEvent(
                            content=full_content or "",
                            thought=full_thought.strip() or None,
                            sources=list(sources_map.values()) or None,
                        ).model_dump()
                        return
                
                # ============================================================
                # Normal streaming events (use stream_events for details)
                # ============================================================
                # Check if this is a detailed event (from stream_events=True)
                if hasattr(run_event, 'event'):
                    match run_event.event:
                        case RunEvent.run_content.value:
                            content_chunk = _extract_text_chunk(run_event)
                            has_content_chunk = bool(content_chunk)
                            reasoning = _extract_reasoning_chunk(run_event)
                            trace_stream(
                                "run_content",
                                has_content=has_content_chunk,
                                has_reasoning=bool(reasoning),
                                reasoning_closed=reasoning_closed_for_current_cycle,
                                content_preview=_preview(content_chunk),
                                reasoning_preview=_preview(reasoning),
                            )

                            if reasoning and not has_content_chunk:
                                if reasoning_closed_for_current_cycle:
                                    # New reasoning cycle after content phase ended.
                                    reasoning_closed_for_current_cycle = False
                                    in_reasoning_phase = False
                                    should_break_next_thought = True
                                for event in emit_thought_part(str(reasoning)):
                                    yield event

                            if content_chunk:
                                for e in process_text(content_chunk, parse_tags=False):
                                    yield e
                                trace_stream(
                                    "emit_content",
                                    reasoning_closed=reasoning_closed_for_current_cycle,
                                    content_preview=_preview(content_chunk),
                                )

                        case RunEvent.reasoning_content_delta.value:
                            content_chunk = _extract_text_chunk(run_event)
                            has_content_chunk = bool(content_chunk)
                            reasoning = _extract_reasoning_chunk(run_event)
                            trace_stream(
                                "reasoning_delta",
                                has_content=has_content_chunk,
                                has_reasoning=bool(reasoning),
                                reasoning_closed=reasoning_closed_for_current_cycle,
                                content_preview=_preview(content_chunk),
                                reasoning_preview=_preview(reasoning),
                            )

                            if reasoning and not has_content_chunk:
                                if reasoning_closed_for_current_cycle:
                                    reasoning_closed_for_current_cycle = False
                                    in_reasoning_phase = False
                                    should_break_next_thought = True
                                for event in emit_thought_part(str(reasoning)):
                                    yield event

                            if content_chunk:
                                for e in process_text(content_chunk, parse_tags=False):
                                    yield e
                                trace_stream(
                                    "emit_content",
                                    reasoning_closed=reasoning_closed_for_current_cycle,
                                    content_preview=_preview(content_chunk),
                                )

                        case RunEvent.tool_call_started.value:
                            tool_event: ToolCallStartedEvent = run_event  # type: ignore[assignment]
                            tool = tool_event.tool
                            if tool:
                                in_reasoning_phase = False
                                should_break_next_thought = True
                                reasoning_closed_for_current_cycle = False
                                if tool.tool_call_id:
                                    tool_start_times[tool.tool_call_id] = time.time()
                                trace_stream(
                                    "tool_call_started",
                                    tool_name=tool.tool_name or "",
                                    tool_call_id=tool.tool_call_id,
                                )
                                yield ToolCallEvent(
                                    id=tool.tool_call_id,
                                    name=tool.tool_name or "",
                                    arguments=json.dumps(tool.tool_args or {}),
                                ).model_dump()

                        case RunEvent.tool_call_completed.value:
                            tool_event: ToolCallCompletedEvent = run_event  # type: ignore[assignment]
                            tool = tool_event.tool
                            if tool:
                                in_reasoning_phase = False
                                should_break_next_thought = True
                                reasoning_closed_for_current_cycle = False
                                duration_ms = None
                                if tool.tool_call_id and tool.tool_call_id in tool_start_times:
                                    duration_ms = int((time.time() - tool_start_times[tool.tool_call_id]) * 1000)
                                output = self._normalize_tool_output(tool.result)
                                trace_stream(
                                    "tool_call_completed",
                                    tool_name=tool.tool_name or "",
                                    tool_call_id=tool.tool_call_id,
                                    is_error=bool(tool.tool_call_error),
                                )
                                if output and isinstance(output, str):
                                    # Try JSON format (double quotes)
                                    try:
                                        parsed = json.loads(output)
                                        output = parsed
                                    except json.JSONDecodeError:
                                        pass
                                    # Try Python repr format (single quotes)
                                    if isinstance(output, str):
                                        try:
                                            parsed = ast.literal_eval(output)
                                            if isinstance(parsed, dict):
                                                output = parsed
                                        except (ValueError, SyntaxError):
                                            pass
                                yield ToolResultEvent(
                                    id=tool.tool_call_id,
                                    name=tool.tool_name or "",
                                    status="done" if not tool.tool_call_error else "error",
                                    output=output,
                                    durationMs=duration_ms,
                                ).model_dump()
                                self._collect_search_sources(output, sources_map)

                        case RunEvent.run_completed.value:
                            # For structured output, Agno provides the parsed model in event.content
                            agn_content = getattr(run_event, "content", None)

                            # Flush parser buffer to avoid losing tail text when tags are split across chunks.
                            for kind, part in tagged_handler.handle("", final=True):
                                if kind == "text":
                                    full_content += part
                                    yield TextEvent(content=part).model_dump()
                                else:
                                    full_thought += part
                                    yield ThoughtEvent(content=part).model_dump()
                            
                            # Clean tags from final full_content if they survived
                            cleaned_content = re.sub(r"<(think|thought)>[\s\S]*?(?:</\1>|$)", "", full_content, flags=re.IGNORECASE).strip()
                            
                            # Extra check: if cleaning made content empty, revert to full_content
                            # unless they were purely tags.
                            final_content = cleaned_content if cleaned_content or not full_content else full_content

                            # If agn_content is a Pydantic model (Structured Output), use it as output
                            output = None
                            if agn_content and hasattr(agn_content, "model_dump"):
                                output = agn_content
                                # Also update content string for the event
                                final_content = json.dumps(agn_content.model_dump())

                            yield DoneEvent(
                                content=final_content,
                                output=output,
                                thought=full_thought.strip() or None,
                                sources=list(sources_map.values()) or None,
                            ).model_dump()
                            if request:
                                    asyncio.create_task(self._maybe_optimize_memories(agent, request))
                            
                            # 4. Trigger Async Session Summary Update
                            # Only if conversation_id exists (Main Chat Flow)
                            if request.conversation_id:
                                # Prepare summary lines:
                                # - Normal flow: incremental update with last user + new assistant
                                # - Regenerate/Edit (or single-turn rebuild): rebuild from current request context + new assistant
                                if should_rebuild_summary:
                                    new_lines = [
                                        m for m in messages
                                        if m.get("role") in ("user", "assistant")
                                    ]
                                    new_lines.append({"role": "assistant", "content": final_content})
                                else:
                                    new_lines = []
                                    last_user = next((m for m in reversed(messages) if m.get("role") == "user"), None)
                                    if last_user:
                                        new_lines.append(last_user)
                                    new_lines.append({"role": "assistant", "content": final_content})
                                
                                logger.info(f"Triggering async summary update for {request.conversation_id} with {len(new_lines)} messages (rebuild: {should_rebuild_summary}, is_editing: {request.is_editing})")
                                asyncio.create_task(update_session_summary(
                                    conversation_id=request.conversation_id,
                                    old_summary=old_summary_json,
                                    new_messages=new_lines,
                                    database_provider=request.database_provider,
                                    memory_provider=request.memory_provider,
                                    memory_model=request.memory_model,
                                    memory_api_key=request.memory_api_key,
                                    memory_base_url=request.memory_base_url,
                                    summary_provider=request.summary_provider,
                                    summary_model=request.summary_model,
                                    summary_api_key=request.summary_api_key,
                                    summary_base_url=request.summary_base_url,
                                    rebuild_from_scratch=should_rebuild_summary,
                                ))

                            return

                        case RunEvent.run_error.value:
                            error_msg = getattr(run_event, "content", None) or "Unknown error"
                            yield ErrorEvent(error=str(error_msg)).model_dump()
                            return
                else:
                    # Simple event Fallback (no detailed event type), just check for content
                    content = getattr(run_event, 'content', None)
                    if content:
                        for e in process_text(str(content), parse_tags=True):
                            yield e

        except Exception as exc:
            logger.error(f"Stream chat error: {exc}")
            yield ErrorEvent(error=str(exc)).model_dump()

    async def _continue_hitl_run(
        self,
        request: StreamChatRequest,
    ) -> AsyncGenerator[dict[str, Any], None]:
        """
        Continue a paused HITL run after user submits form.
        
        This method:
        1. Retrieves requirements from Supabase
        2. Fills in user-submitted field values
        3. Continues the agent run with agent.acontinue_run()
        4. Streams the completion
        5. Cleans up Supabase record
        """
        try:
            run_id = request.run_id
            field_values = request.field_values or {}
            
            logger.info(f"Continuing HITL run {run_id} with field_values: {list(field_values.keys())}")
            
            # 1. Fetch Session Summary from DB
            session_summary_text = None
            old_summary_json = None
            if request.conversation_id:
                try:
                    from ..models.db import DbFilter, DbQueryRequest
                    from .db_service import execute_db_async, get_db_adapter
                    
                    adapter = get_db_adapter(request.database_provider)
                    if adapter:
                        req = DbQueryRequest(
                            providerId=adapter.config.id,
                            action="select",
                            table="conversations",
                            columns=["session_summary"],
                            filters=[DbFilter(op="eq", column="id", value=request.conversation_id)],
                            maybeSingle=True,
                        )
                        
                        result = await execute_db_async(adapter, req)
                        
                        if result.data and isinstance(result.data, dict):
                            row = result.data
                            raw_summary = row.get("session_summary")
                            
                            if raw_summary:
                                if isinstance(raw_summary, str):
                                    try:
                                        old_summary_json = json.loads(raw_summary)
                                    except:
                                        pass
                                elif isinstance(raw_summary, dict):
                                    old_summary_json = raw_summary
                                
                                if old_summary_json:
                                    session_summary_text = old_summary_json.get("summary")
                except Exception as e:
                    logger.warning(f"Failed to fetch session summary in HITL flow: {e}")
            
            # Retrieve requirements from Supabase
            hitl_storage = get_hitl_storage(request.database_provider)
            pending = await hitl_storage.get_pending_run(run_id)

            requirements = None
            saved_messages = None
            if isinstance(pending, dict):
                requirements = pending.get("requirements")
                saved_messages = pending.get("messages")
            else:
                requirements = pending
            
            if not requirements:
                logger.error(f"No pending run found for run_id: {run_id}")
                yield ErrorEvent(error="Form session expired or not found").model_dump()
                return
            
            # Fill in user-submitted values
            for req in requirements:
                # Case 1: External execution (interactive_form)
                if (hasattr(req, 'needs_external_execution') and req.needs_external_execution) or \
                   (req.tool_execution and req.tool_execution.tool_name == "interactive_form"):
                    import json
                    req.set_external_execution_result(json.dumps(field_values))
                    logger.debug(f"Set external execution result for {req.tool_execution.tool_name}")
                
                # Case 2: Traditional user input (get_user_input)
                elif req.needs_user_input and req.user_input_schema:
                    for field in req.user_input_schema:
                        if field.name in field_values:
                            field.value = field_values[field.name]
                            logger.debug(f"Filled field '{field.name}' with value: {field.value}")
            
            # Get agent (same provider as original request)
            agent = get_agent_for_provider(request)
            logger.info(f"[HITL Continue] Agent instructions: {getattr(agent, 'instructions', None)}")

            full_content = ""
            full_thought = ""
            sources_map: dict[str, Any] = {}
            tool_start_times: dict[str, float] = {}
            should_break_next_thought = False
            in_reasoning_phase = False
            reasoning_closed_for_current_cycle = False
            stream_trace = _is_stream_trace_enabled()
            tagged_handler = TaggedTextHandler()
            paused_again = False  # Flag to prevent cleanup when multi-form chaining occurs

            def trace_stream(stage: str, **kwargs: Any) -> None:
                if not stream_trace:
                    return
                payload = ", ".join([f"{k}={v}" for k, v in kwargs.items()])
                logger.info(f"[STREAM_TRACE][hitl] {stage} | {payload}")

            def emit_thought_part(part: str):
                nonlocal full_thought, should_break_next_thought, in_reasoning_phase, reasoning_closed_for_current_cycle
                text = _strip_internal_tool_trace(str(part or ""))
                if not text:
                    return
                if reasoning_closed_for_current_cycle:
                    trace_stream("drop_reasoning_after_content", reasoning_preview=_preview(text))
                    return
                if should_break_next_thought and not in_reasoning_phase and full_thought.strip():
                    separator = f"\n\n{THOUGHT_BLOCK_BREAK_MARKER}\n\n"
                    full_thought += separator
                    yield ThoughtEvent(content=separator).model_dump()
                should_break_next_thought = False
                in_reasoning_phase = True
                full_thought += text
                trace_stream("emit_reasoning", reasoning_preview=_preview(text))
                yield ThoughtEvent(content=text).model_dump()

            def process_text(text: str, parse_tags: bool = True):
                nonlocal full_content, in_reasoning_phase, should_break_next_thought, reasoning_closed_for_current_cycle
                if not parse_tags:
                    clean_text = _strip_internal_tool_trace(text)
                    if clean_text:
                        in_reasoning_phase = False
                        should_break_next_thought = True
                        reasoning_closed_for_current_cycle = True
                        full_content += clean_text
                        yield TextEvent(content=clean_text).model_dump()
                    return

                for type, part in tagged_handler.handle(text):
                    if type == "text":
                        clean_part = _strip_internal_tool_trace(part)
                        if clean_part:
                            in_reasoning_phase = False
                            should_break_next_thought = True
                            reasoning_closed_for_current_cycle = True
                            full_content += clean_part
                            yield TextEvent(content=clean_part).model_dump()
                    else:
                        if reasoning_closed_for_current_cycle:
                            clean_part = _strip_internal_tool_trace(part)
                            if clean_part:
                                full_content += clean_part
                                yield TextEvent(content=clean_part).model_dump()
                            continue
                        for event in emit_thought_part(part):
                            yield event

            def _extract_text_chunk(run_event: Any) -> str:
                content = getattr(run_event, "content", None)
                if isinstance(content, str) and content:
                    return content
                if content and not isinstance(content, str):
                    return str(content)

                provider_data = getattr(run_event, "model_provider_data", None)
                if isinstance(provider_data, dict):
                    choices = provider_data.get("choices") or []
                    if choices and isinstance(choices[0], dict):
                        delta = choices[0].get("delta") or {}
                        raw_content = delta.get("content")
                        if isinstance(raw_content, str) and raw_content:
                            return raw_content
                        if isinstance(raw_content, list):
                            parts: list[str] = []
                            for item in raw_content:
                                if isinstance(item, dict):
                                    text_part = item.get("text")
                                    if text_part:
                                        parts.append(str(text_part))
                            if parts:
                                return "".join(parts)
                return ""

            def _extract_reasoning_chunk(run_event: Any) -> str:
                reasoning = getattr(run_event, "reasoning_content", None)
                if isinstance(reasoning, str) and reasoning:
                    return reasoning
                if reasoning and not isinstance(reasoning, str):
                    return str(reasoning)

                provider_data = getattr(run_event, "model_provider_data", None)
                if isinstance(provider_data, dict):
                    choices = provider_data.get("choices") or []
                    if choices and isinstance(choices[0], dict):
                        delta = choices[0].get("delta") or {}
                        raw_reasoning = (
                            delta.get("reasoning_content")
                            or delta.get("reasoning")
                            or delta.get("reasoning_details")
                        )
                        if isinstance(raw_reasoning, str) and raw_reasoning:
                            return raw_reasoning
                        if isinstance(raw_reasoning, list):
                            parts: list[str] = []
                            for item in raw_reasoning:
                                if isinstance(item, dict):
                                    text_part = item.get("text") or item.get("content")
                                    if text_part:
                                        parts.append(str(text_part))
                            if parts:
                                return "".join(parts)
                return ""
            
            async def _stream_events(stream):
                nonlocal full_content, full_thought, sources_map, tool_start_times, paused_again
                nonlocal in_reasoning_phase, should_break_next_thought, reasoning_closed_for_current_cycle
                async for run_event in stream:
                    # HITL Pause Check
                    if hasattr(run_event, 'is_paused') and run_event.is_paused:
                        logger.info(f"Agent paused again during continuation (multi-form chain, run_id: {run_id})")
                        
                        # Extract new requirements
                        new_requirements = getattr(run_event, 'active_requirements', None) or getattr(run_event, 'requirements', None)
                        
                        if new_requirements:
                            # Filter for interactive_form requirements
                            def _is_interactive_form(req: Any) -> bool:
                                if getattr(req, 'needs_external_execution', False):
                                    tool_exec = getattr(req, 'tool_execution', None)
                                    tool_name = getattr(tool_exec, 'tool_name', None) if tool_exec else None
                                    return tool_name == "interactive_form"
                                tool_exec = getattr(req, 'tool_execution', None)
                                tool_name = getattr(tool_exec, 'tool_name', None) if tool_exec else None
                                return tool_name == "interactive_form"
                            
                            form_requirements = [req for req in new_requirements if _is_interactive_form(req)]
                            
                            if form_requirements:
                                # Save new form requirements (overwrites previous in memory)
                                hitl_storage_multi = get_hitl_storage(request.database_provider)
                                saved = await hitl_storage_multi.save_pending_run(
                                    run_id=run_id,
                                    requirements=form_requirements,
                                    conversation_id=request.conversation_id,
                                    user_id=request.user_id,
                                    agent_model=request.model,
                                    messages=saved_messages,  # Reuse saved messages
                                )
                                if not saved:
                                    raise RuntimeError("Failed to persist chained HITL pending run")
                                
                                # Extract form fields and notify frontend
                                for req in form_requirements:
                                    if (hasattr(req, 'needs_external_execution') and req.needs_external_execution) or \
                                       (req.tool_execution and req.tool_execution.tool_name == "interactive_form"):
                                        tool_args = req.tool_execution.tool_args if req.tool_execution else {}
                                        form_id = tool_args.get('id')
                                        title = tool_args.get('title', 'Please provide additional information')
                                        fields = tool_args.get('fields', [])
                                        
                                        yield FormRequestEvent(
                                            run_id=run_id,
                                            form_id=form_id,
                                            title=title,
                                            fields=fields
                                        ).model_dump()
                                
                                # Send partial done event
                                yield DoneEvent(
                                    content=full_content or "",
                                    thought=full_thought.strip() or None,
                                    sources=list(sources_map.values()) or None,
                                ).model_dump()
                                
                                logger.info(f"Multi-form: saved second form, waiting for user (run_id: {run_id})")
                                paused_again = True  # Mark as paused again to skip cleanup
                                return
                        
                        # If no form requirements, just continue
                        logger.warning(f"Agent paused again but no interactive_form found (run_id: {run_id})")
                        yield ErrorEvent(error="Agent paused unexpectedly").model_dump()
                        return

                    # Check if this is a detailed event (from stream_events=True or implicit)
                    if hasattr(run_event, 'event'):
                        match run_event.event:
                            case RunEvent.run_content.value:
                                content_chunk = _extract_text_chunk(run_event)
                                has_content_chunk = bool(content_chunk)
                                reasoning = _extract_reasoning_chunk(run_event)
                                trace_stream(
                                    "run_content",
                                    has_content=has_content_chunk,
                                    has_reasoning=bool(reasoning),
                                    reasoning_closed=reasoning_closed_for_current_cycle,
                                    content_preview=_preview(content_chunk),
                                    reasoning_preview=_preview(reasoning),
                                )

                                if reasoning and not has_content_chunk:
                                    if reasoning_closed_for_current_cycle:
                                        reasoning_closed_for_current_cycle = False
                                        in_reasoning_phase = False
                                        should_break_next_thought = True
                                    for event in emit_thought_part(str(reasoning)):
                                        yield event

                                if content_chunk:
                                    for e in process_text(content_chunk, parse_tags=False):
                                        yield e
                                    trace_stream(
                                        "emit_content",
                                        reasoning_closed=reasoning_closed_for_current_cycle,
                                        content_preview=_preview(content_chunk),
                                    )

                            case RunEvent.reasoning_content_delta.value:
                                content_chunk = _extract_text_chunk(run_event)
                                has_content_chunk = bool(content_chunk)
                                reasoning = _extract_reasoning_chunk(run_event)
                                trace_stream(
                                    "reasoning_delta",
                                    has_content=has_content_chunk,
                                    has_reasoning=bool(reasoning),
                                    reasoning_closed=reasoning_closed_for_current_cycle,
                                    content_preview=_preview(content_chunk),
                                    reasoning_preview=_preview(reasoning),
                                )

                                if reasoning and not has_content_chunk:
                                    if reasoning_closed_for_current_cycle:
                                        reasoning_closed_for_current_cycle = False
                                        in_reasoning_phase = False
                                        should_break_next_thought = True
                                    for event in emit_thought_part(str(reasoning)):
                                        yield event

                                if content_chunk:
                                    for e in process_text(content_chunk, parse_tags=False):
                                        yield e
                                    trace_stream(
                                        "emit_content",
                                        reasoning_closed=reasoning_closed_for_current_cycle,
                                        content_preview=_preview(content_chunk),
                                    )

                            case RunEvent.tool_call_started.value:
                                tool_event: ToolCallStartedEvent = run_event  # type: ignore[assignment]
                                tool = tool_event.tool
                                if tool:
                                    in_reasoning_phase = False
                                    should_break_next_thought = True
                                    reasoning_closed_for_current_cycle = False
                                    if tool.tool_call_id:
                                        tool_start_times[tool.tool_call_id] = time.time()
                                    trace_stream(
                                        "tool_call_started",
                                        tool_name=tool.tool_name or "",
                                        tool_call_id=tool.tool_call_id,
                                    )
                                    yield ToolCallEvent(
                                        id=tool.tool_call_id,
                                        name=tool.tool_name or "",
                                        arguments=json.dumps(tool.tool_args or {}),
                                    ).model_dump()

                            case RunEvent.tool_call_completed.value:
                                tool_event: ToolCallCompletedEvent = run_event  # type: ignore[assignment]
                                tool = tool_event.tool
                                if tool:
                                    in_reasoning_phase = False
                                    should_break_next_thought = True
                                    reasoning_closed_for_current_cycle = False
                                    duration_ms = None
                                    if tool.tool_call_id and tool.tool_call_id in tool_start_times:
                                        duration_ms = int((time.time() - tool_start_times[tool.tool_call_id]) * 1000)
                                    output = self._normalize_tool_output(tool.result)
                                    trace_stream(
                                        "tool_call_completed",
                                        tool_name=tool.tool_name or "",
                                        tool_call_id=tool.tool_call_id,
                                        is_error=bool(tool.tool_call_error),
                                    )
                                    if output and isinstance(output, str):
                                        try:
                                            import ast
                                            parsed = json.loads(output)
                                            output = parsed
                                        except json.JSONDecodeError:
                                            pass
                                        if isinstance(output, str):
                                            try:
                                                parsed = ast.literal_eval(output)
                                                if isinstance(parsed, dict):
                                                    output = parsed
                                            except (ValueError, SyntaxError):
                                                pass
                                    yield ToolResultEvent(
                                        id=tool.tool_call_id,
                                        name=tool.tool_name or "",
                                        status="done" if not tool.tool_call_error else "error",
                                        output=output,
                                        durationMs=duration_ms,
                                    ).model_dump()
                                    self._collect_search_sources(output, sources_map)

                            case RunEvent.run_completed.value:
                                 # We handle DoneEvent outside the loop to ensure final accumulation
                                 pass

                            case RunEvent.run_error.value:
                                error_msg = getattr(run_event, "content", None) or "Unknown error"
                                yield ErrorEvent(error=str(error_msg)).model_dump()
                                return
                    else:
                        # Simple event Fallback
                        content = getattr(run_event, 'content', None)
                        if content:
                            for e in process_text(str(content), parse_tags=True):
                                yield e

            def _build_fallback_messages():
                if not saved_messages:
                    return None
                updated_messages = list(saved_messages)
                for req in requirements:
                    tool_exec = getattr(req, 'tool_execution', None)
                    tool_name = getattr(tool_exec, 'tool_name', None) if tool_exec else None
                    if tool_name != "interactive_form":
                        continue
                    tool_args = getattr(tool_exec, 'tool_args', {}) if tool_exec else {}
                    tool_call_id = getattr(req, "id", None) or tool_args.get("id") or f"form-{int(time.time() * 1000)}"
                    updated_messages.append({
                        "role": "assistant",
                        "content": None,
                        "tool_calls": [{
                            "id": tool_call_id,
                            "type": "function",
                            "function": {
                                "name": "interactive_form",
                                "arguments": json.dumps(tool_args or {}),
                            }
                        }],
                    })
                    updated_messages.append({
                        "role": "tool",
                        "content": json.dumps(field_values),
                        "tool_call_id": tool_call_id,
                    })
                return updated_messages

            # Continue the run (streaming)
            logger.info(f"Calling agent.acontinue_run for run_id: {run_id}, session_id: {request.conversation_id}")
            try:
                stream = agent.acontinue_run(
                    run_id=run_id,
                    session_id=request.conversation_id,
                    requirements=requirements,
                    stream=True,
                    stream_events=True,  # Enable detailed events (tools, thoughts, etc.)
                )
                async for event in _stream_events(stream):
                    yield event
            except Exception as exc:
                logger.warning(f"HITL acontinue_run failed, falling back to fresh run: {exc}")
                fallback_messages = _build_fallback_messages()
                if not fallback_messages:
                    yield ErrorEvent(error="Form session cannot be resumed (missing state)").model_dump()
                    return
                stream = agent.arun(
                    input=fallback_messages,
                    stream=True,
                    stream_events=True,
                    user_id=request.user_id,
                    session_id=request.conversation_id,
                )
                async for event in _stream_events(stream):
                    yield event
            
            # Stream completed, send done event
            for kind, part in tagged_handler.handle("", final=True):
                if kind == "text":
                    full_content += part
                    yield TextEvent(content=part).model_dump()
                else:
                    full_thought += part
                    yield ThoughtEvent(content=part).model_dump()

            yield DoneEvent(
                content=full_content,
                thought=full_thought.strip() or None,
                sources=list(sources_map.values()) or None,
            ).model_dump()
            
            # Clean up Supabase (skip if paused again for multi-form)
            if not paused_again:
                await hitl_storage.delete_pending_run(run_id)
                logger.info(f"HITL run {run_id} completed and cleaned up")
            else:
                logger.info(f"HITL run {run_id} paused again (multi-form), skipping cleanup")

            # 6. Trigger Async Session Summary Update
            if request.conversation_id and not paused_again:
                # For HITL resumption, we treat the form submission as the "user" part of the turn
                # and the new assistant message as the completion.
                summary_messages = []
                
                # Use a combined message for the form submission to provide context to the summarizer
                form_submission_text = f"[Form Submitted] Values: {json.dumps(field_values)}"
                summary_messages.append({"role": "user", "content": form_submission_text})
                summary_messages.append({"role": "assistant", "content": full_content})
                
                logger.info(f"Triggering async summary update for {request.conversation_id} (Resumed HITL flow)")
                asyncio.create_task(update_session_summary(
                    conversation_id=request.conversation_id,
                    old_summary=old_summary_json,
                    new_messages=summary_messages,
                    database_provider=request.database_provider,
                    memory_provider=request.memory_provider,
                    memory_model=request.memory_model,
                    memory_api_key=request.memory_api_key,
                    memory_base_url=request.memory_base_url,
                    summary_provider=request.summary_provider,
                    summary_model=request.summary_model,
                    summary_api_key=request.summary_api_key,
                    summary_base_url=request.summary_base_url,
                    rebuild_from_scratch=False, # HITL resumption is usually incremental
                ))

        except Exception as exc:
            import traceback
            error_details = traceback.format_exc()
            logger.error(f"HITL continuation error: {exc}\n{error_details}")
            yield ErrorEvent(error=str(exc)).model_dump()




    def _collect_enabled_tool_names(self, request: StreamChatRequest) -> set[str]:
        names: list[str] = []
        if request.provider != "gemini":
            for tool_id in request.tool_ids or []:
                names.append(resolve_tool_name(str(tool_id)))
        for tool_def in request.tools or []:
            if hasattr(tool_def, "model_dump"):
                tool_def = tool_def.model_dump()
            if not isinstance(tool_def, dict):
                continue
            name = tool_def.get("function", {}).get("name") or tool_def.get("name")
            if name:
                names.append(resolve_tool_name(str(name)))
        for user_tool in request.user_tools or []:
            if hasattr(user_tool, "name") and user_tool.name:
                names.append(str(user_tool.name))
        return set(names)

    def _inject_local_time_context(
        self,
        messages: list[dict[str, Any]],
        request: StreamChatRequest,
        pre_events: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        if not messages:
            return messages

        timezone = request.user_timezone or "UTC"
        locale = request.user_locale or "en-US"
        time_result = self._compute_local_time(timezone, locale)
        injected = (
            "\n\n<today_local_time>\n"
            f"##today local time：{time_result.get('formatted')} ({time_result.get('timezone')})\n"
            f"locale: {time_result.get('locale')}\n"
            f"iso: {time_result.get('iso')}\n"
            "</today_local_time>"
        )

        updated = list(messages)
        system_index = next((i for i, m in enumerate(updated) if m.get("role") == "system"), -1)
        if system_index != -1:
            current_content = str(updated[system_index].get("content", ""))
            if "<today_local_time>" in current_content and "</today_local_time>" in current_content:
                current_content = re.sub(
                    r"<today_local_time>[\s\S]*?</today_local_time>",
                    injected.strip(),
                    current_content,
                    count=1,
                    flags=re.IGNORECASE,
                )
                updated[system_index] = {**updated[system_index], "content": current_content}
            else:
                updated[system_index] = {
                    **updated[system_index],
                    "content": f"{current_content}{injected}",
                }
        else:
            updated.insert(0, {"role": "system", "content": injected.strip()})
        return updated

    def _compute_local_time(self, timezone: str, locale: str) -> dict[str, Any]:
        try:
            tzinfo = ZoneInfo(timezone)
            now = datetime.now(tzinfo)
        except Exception:
            now = datetime.now()
        return {
            "timezone": timezone,
            "locale": locale,
            "formatted": now.strftime("%Y-%m-%d %H:%M:%S"),
            "iso": now.isoformat(),
        }

    def _inject_tool_guidance(
        self,
        messages: list[dict[str, Any]],
        enabled_tools: set[str],
        request: Any | None = None,
    ) -> list[dict[str, Any]]:
        if not enabled_tools:
            return messages

        updated = list(messages)
        system_index = next((i for i, m in enumerate(updated) if m.get("role") == "system"), -1)

        if "interactive_form" in enabled_tools:
            form_guidance = (
                "\n[TOOL USE GUIDANCE]\n"
                "When you need to collect structured information from the user (e.g. preferences, requirements, "
                "booking details), use the 'interactive_form' tool.\n"
                "CRITICAL: DO NOT list questions in text or markdown. YOU MUST USE the 'interactive_form' tool to "
                "display fields.\n"
                "Keep forms concise (3-6 fields).\n\n"
                "[MANDATORY TEXT-FIRST RULE]\n"
                "CRITICAL: You MUST output meaningful introductory text BEFORE calling 'interactive_form'.\n"
                "- NEVER call 'interactive_form' as the very first thing in your response\n"
                "- ALWAYS explain the context, acknowledge the user's request, or provide guidance BEFORE the form\n"
                "- Minimum: Output at least 1-2 sentences before the form call\n"
                '- Example: "I can help you with that. To provide the best recommendation, please share some '
                'details below:"\n\n'
                "[SINGLE FORM PER RESPONSE]\n"
                "CRITICAL: You may call 'interactive_form' ONLY ONCE per response. Do NOT call it multiple times in "
                "the same answer.\n"
                "If you need to collect information, design ONE comprehensive form that gathers all necessary "
                "details at once.\n\n"
                "[MULTI-TURN INTERACTIONS]\n"
                "1. If the information from a submitted form is insufficient, you MAY present another "
                "'interactive_form' in your NEXT response (after the user submits the first form).\n"
                "2. LIMIT: Use at most 2-3 forms total across the entire conversation. Excessive questioning "
                "frustrates users.\n"
                "3. INTERLEAVING: You can place the form anywhere in your response. Output introductory text FIRST "
                "(e.g., \"I can help with that. Please provide some details below:\"), then call 'interactive_form' "
                "once.\n"
                "4. If the user has provided enough context through previous forms, proceed directly to the final "
                "answer without requesting more information."
            )
            updated = self._append_system_message(updated, form_guidance, system_index)
            system_index = next((i for i, m in enumerate(updated) if m.get("role") == "system"), -1)

        search_tools_requiring_citations = {
            "Tavily_web_search",
            "Tavily_academic_search",
            "web_search_using_tavily",
            "web_search",
            "search_news",
            "search_arxiv_and_return_articles",
            "search_wikipedia",
        }
        if enabled_tools.intersection(search_tools_requiring_citations):
            citation_prompt = (
                "\n\n[IMPORTANT] You have access to search tools. When you use them to answer a question, "
                "you MUST cite the search results in your answer using the format [1], [2], etc., "
                "corresponding to the index of the search result provided in the tool output. Do not fabricate "
                "citations."
            )
            updated = self._append_system_message(updated, citation_prompt, system_index)

        if "local_time" in enabled_tools:
            local_time_guidance = (
                "\n\n[TIME CONTEXT GUIDANCE]\n"
                "Current local time context is already injected in system prompt.\n"
                "Do not call local_time again unless the user explicitly asks to refresh/recheck time."
            )
            updated = self._append_system_message(updated, local_time_guidance, system_index)

        if "memory_update" in enabled_tools:
            memory_guidance = (
                "\n\n[MEMORY UPDATE GUIDANCE]\n"
                "When calling 'memory_update', prioritize existing memory domains first.\n"
                "Optionally call 'memory_retrieve' first to inspect existing domain summaries.\n"
                "1) Reuse an existing domain_key if semantically similar.\n"
                "2) Create a new domain_key only for clearly new topics.\n"
                "3) Prefer operation='upsert' for corrections/overwrites; use 'add' for appending details; "
                "use 'delete' to remove outdated domains.\n"
                "4) Always provide a non-empty summary for operation='add' and operation='upsert'.\n"
                "5) If upserting an existing domain, rewrite summary from old memory and set based_on_existing=true."
            )
            updated = self._append_system_message(updated, memory_guidance, system_index)

        if "memory_retrieve" in enabled_tools:
            prefetched_domains = []
            raw_prefetched = getattr(request, "memory_domains_prefetch", None) if request else None
            if isinstance(raw_prefetched, list):
                for row in raw_prefetched[:80]:
                    if not isinstance(row, dict):
                        continue
                    domain_key = str(row.get("domain_key") or "").strip()
                    if not domain_key:
                        continue
                    aliases = row.get("aliases")
                    if not isinstance(aliases, list):
                        aliases = []
                    cleaned_aliases = [str(item).strip() for item in aliases if str(item).strip()]
                    prefetched_domains.append(
                        {
                            "domain_key": domain_key,
                            "aliases": cleaned_aliases,
                        }
                    )

            available_domains_text = ""
            if prefetched_domains:
                available_domains_text = (
                    "\nAvailable existing domains (prefer these keys first): "
                    f"{json.dumps(prefetched_domains, ensure_ascii=False)}"
                )

            memory_retrieve_guidance = (
                "\n\n[MEMORY RETRIEVE GUIDANCE]\n"
                "Use 'memory_retrieve' only when memory context is needed for the current answer.\n"
                "Use TWO steps:\n"
                "1) Call memory_retrieve(action='list', include_summary=false) to inspect candidate domains.\n"
                "2) Select domain_keys and call memory_retrieve(action='fetch', include_summary=true, domain_keys=[...]).\n"
                "Do not fetch all summaries directly without selecting domains first."
                f"{available_domains_text}"
            )
            updated = self._append_system_message(updated, memory_retrieve_guidance, system_index)

        return updated

    def _append_system_message(
        self,
        messages: list[dict[str, Any]],
        addition: str,
        system_index: int,
    ) -> list[dict[str, Any]]:
        updated = list(messages)
        if system_index != -1:
            updated[system_index] = {
                **updated[system_index],
                "content": f"{updated[system_index].get('content', '')}{addition}",
            }
        else:
            updated.insert(0, {"role": "system", "content": addition})
        return updated

    def _normalize_tool_output(self, output: Any) -> Any:
        if hasattr(output, "model_dump"):
            try:
                return output.model_dump()
            except Exception:
                return str(output)
        if isinstance(output, dict):
            return output
        if isinstance(output, list):
            return [self._normalize_tool_output(item) for item in output]
        return output

    def _collect_search_sources(self, result: Any, sources_map: dict[str, Any]) -> None:
        def _extract_results(payload: Any) -> list[dict[str, Any]]:
            if isinstance(payload, list):
                return [item for item in payload if isinstance(item, dict)]
            if isinstance(payload, dict):
                for key in ("results", "items", "data", "sources", "articles", "news", "papers"):
                    value = payload.get(key)
                    if isinstance(value, list):
                        return [item for item in value if isinstance(item, dict)]
            return []

        results = _extract_results(result)
        if not results:
            return

        for item in results:
            url = (
                item.get("url")
                or item.get("link")
                or item.get("uri")
                or item.get("source")
                or item.get("href")
            )
            if not url or url in sources_map:
                continue
            title = (
                item.get("title")
                or item.get("name")
                or item.get("headline")
                or item.get("paper_title")
                or "Unknown Source"
            )
            snippet = (
                item.get("content")
                or item.get("snippet")
                or item.get("summary")
                or item.get("abstract")
                or ""
            )
            sources_map[url] = SourceEvent(
                uri=url,
                title=title,
                snippet=str(snippet)[:200],
            ).model_dump()

    async def _maybe_optimize_memories(self, agent: Agent, request: StreamChatRequest) -> None:
        return
    
    def _map_field_type_to_frontend(self, field_type: Any) -> str:
        """
        Map Python/Agno field types to frontend form types.
        
        Args:
            field_type: Python type (class or string)
            
        Returns:
            Frontend form field type (text, number, checkbox, etc.)
        """
        # Handle cases where field_type is a class/type instead of a string
        field_type_str = ""
        if isinstance(field_type, type):
            field_type_str = field_type.__name__
        elif not isinstance(field_type, str):
            field_type_str = str(field_type)
        else:
            field_type_str = field_type

        type_mapping = {
            "str": "text",
            "int": "number",
            "float": "number",
            "bool": "checkbox",
            "date": "date",
            "time": "time",
            "datetime": "datetime",
            "list": "text",
            "dict": "textarea",
        }
        return type_mapping.get(field_type_str.lower(), "text")


_stream_chat_service: StreamChatService | None = None

def get_stream_chat_service() -> StreamChatService:
    global _stream_chat_service
    if _stream_chat_service is None:
        _stream_chat_service = StreamChatService()
    return _stream_chat_service
