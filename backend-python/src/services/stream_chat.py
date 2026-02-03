"""
Stream chat service implemented with Agno SDK (Agent + tools + DB).
"""

from __future__ import annotations

import ast
import asyncio
import json
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
from .hitl_storage import get_hitl_storage  # New: HITL storage


TIME_KEYWORDS_REGEX = re.compile(
    r"\u4eca\u5929|\u4eca\u5e74|\u73b0\u5728|\u672c\u5468|\u672c\u6708|\u6700\u8fd1|\u521a\u521a|"
    r"\u660e\u5929|\u6628\u5929|\u4e0a\u5468|\u4e0a\u4e2a\u6708|\u53bb\u5e74|"
    r"today|current|now|this week|this month|recently|tomorrow|yesterday|last week|last month|last year",
    re.IGNORECASE,
)

MEMORY_OPTIMIZE_THRESHOLD = 50
MEMORY_OPTIMIZE_INTERVAL_SECONDS = 60 * 60 * 12

class TaggedTextHandler:
    def __init__(self):
        self.in_thought_block = False

    def handle(self, text: str):
        remaining = text
        while remaining:
            if not self.in_thought_block:
                # Use regex to find start of thought block
                match = re.search(r"<(think|thought)>", remaining, re.IGNORECASE)
                if not match:
                    yield "text", remaining
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
                    yield "thought", remaining
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
            
            tagged_handler = TaggedTextHandler()

            def process_text(text: str):
                nonlocal full_content, full_thought
                for type, part in tagged_handler.handle(text):
                    if type == "text":
                        full_content += part
                        yield TextEvent(content=part).model_dump()
                    else:
                        full_thought += part
                        yield ThoughtEvent(content=part).model_dump()

            messages = self._apply_context_limit(
                request.messages,
                request.context_message_limit,
            )
            pre_events: list[dict[str, Any]] = []
            messages = self._inject_local_time_context(messages, request, pre_events)
            enabled_tool_names = self._collect_enabled_tool_names(request)
            messages = self._inject_tool_guidance(messages, enabled_tool_names)

            for event in pre_events:
                yield event

            stream = agent.arun(
                input=messages,
                stream=True,
                stream_events=True,
                user_id=request.user_id,
                session_id=request.conversation_id,
                output_schema=request.output_schema or request.response_format,
            )

            # ================================================================
            # Stream processing with HITL support (Agno official pattern)
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
                            hitl_storage = get_hitl_storage()
                            await hitl_storage.save_pending_run(
                                run_id=run_event.run_id,
                                requirements=form_requirements,
                                conversation_id=request.conversation_id,
                                user_id=request.user_id,
                                agent_model=request.model,
                                messages=messages,
                            )
                            
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
                            content = getattr(run_event, "content", None)
                            if content:
                                for e in process_text(str(content)):
                                    yield e
                            reasoning = getattr(run_event, "reasoning_content", None)
                            if reasoning:
                                full_thought += str(reasoning)
                                yield ThoughtEvent(content=str(reasoning)).model_dump()

                        case RunEvent.reasoning_content_delta.value:
                            reasoning = getattr(run_event, "reasoning_content", None)
                            if reasoning:
                                full_thought += str(reasoning)
                                yield ThoughtEvent(content=str(reasoning)).model_dump()

                        case RunEvent.tool_call_started.value:
                            tool_event: ToolCallStartedEvent = run_event  # type: ignore[assignment]
                            tool = tool_event.tool
                            if tool:
                                if tool.tool_call_id:
                                    tool_start_times[tool.tool_call_id] = time.time()
                                yield ToolCallEvent(
                                    id=tool.tool_call_id,
                                    name=tool.tool_name or "",
                                    arguments=json.dumps(tool.tool_args or {}),
                                ).model_dump()

                        case RunEvent.tool_call_completed.value:
                            tool_event: ToolCallCompletedEvent = run_event  # type: ignore[assignment]
                            tool = tool_event.tool
                            if tool:
                                duration_ms = None
                                if tool.tool_call_id and tool.tool_call_id in tool_start_times:
                                    duration_ms = int((time.time() - tool_start_times[tool.tool_call_id]) * 1000)
                                output = self._normalize_tool_output(tool.result)
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
                            return

                        case RunEvent.run_error.value:
                            error_msg = getattr(run_event, "content", None) or "Unknown error"
                            yield ErrorEvent(error=str(error_msg)).model_dump()
                            return
                else:
                    # Simple event (no detailed event type), just check for content
                    content = getattr(run_event, 'content', None)
                    if content:
                        for e in process_text(str(content)):
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
            
            # Retrieve requirements from Supabase
            hitl_storage = get_hitl_storage()
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
            tagged_handler = TaggedTextHandler()
            paused_again = False  # Flag to prevent cleanup when multi-form chaining occurs

            def process_text(text: str):
                nonlocal full_content, full_thought
                for type, part in tagged_handler.handle(text):
                    if type == "text":
                        full_content += part
                        yield TextEvent(content=part).model_dump()
                    else:
                        full_thought += part
                        yield ThoughtEvent(content=part).model_dump()
            
            async def _stream_events(stream):
                nonlocal full_content, full_thought, sources_map, tool_start_times, paused_again
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
                                hitl_storage_multi = get_hitl_storage()
                                await hitl_storage_multi.save_pending_run(
                                    run_id=run_id,
                                    requirements=form_requirements,
                                    conversation_id=request.conversation_id,
                                    user_id=request.user_id,
                                    agent_model=request.model,
                                    messages=saved_messages,  # Reuse saved messages
                                )
                                
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
                                content = getattr(run_event, "content", None)
                                if content:
                                    for e in process_text(str(content)):
                                        yield e
                                reasoning = getattr(run_event, "reasoning_content", None)
                                if reasoning:
                                    full_thought += str(reasoning)
                                    yield ThoughtEvent(content=str(reasoning)).model_dump()

                            case RunEvent.reasoning_content_delta.value:
                                reasoning = getattr(run_event, "reasoning_content", None)
                                if reasoning:
                                    full_thought += str(reasoning)
                                    yield ThoughtEvent(content=str(reasoning)).model_dump()

                            case RunEvent.tool_call_started.value:
                                tool_event: ToolCallStartedEvent = run_event  # type: ignore[assignment]
                                tool = tool_event.tool
                                if tool:
                                    if tool.tool_call_id:
                                        tool_start_times[tool.tool_call_id] = time.time()
                                    yield ToolCallEvent(
                                        id=tool.tool_call_id,
                                        name=tool.tool_name or "",
                                        arguments=json.dumps(tool.tool_args or {}),
                                    ).model_dump()

                            case RunEvent.tool_call_completed.value:
                                tool_event: ToolCallCompletedEvent = run_event  # type: ignore[assignment]
                                tool = tool_event.tool
                                if tool:
                                    duration_ms = None
                                    if tool.tool_call_id and tool.tool_call_id in tool_start_times:
                                        duration_ms = int((time.time() - tool_start_times[tool.tool_call_id]) * 1000)
                                    output = self._normalize_tool_output(tool.result)
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
                            for e in process_text(str(content)):
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

        except Exception as exc:
            import traceback
            error_details = traceback.format_exc()
            logger.error(f"HITL continuation error: {exc}\n{error_details}")
            yield ErrorEvent(error=str(exc)).model_dump()


    def _apply_context_limit(
        self,
        messages: list[dict[str, Any]],
        limit: int | None,
    ) -> list[dict[str, Any]]:
        if not limit or limit <= 0 or len(messages) <= limit:
            return messages
        system_messages = [m for m in messages if m.get("role") == "system"]
        non_system = [m for m in messages if m.get("role") != "system"]
        recent = non_system[-limit:]
        return system_messages + recent

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

        last_user_index = -1
        last_user_message = None
        for idx in range(len(messages) - 1, -1, -1):
            if messages[idx].get("role") == "user":
                last_user_index = idx
                last_user_message = messages[idx]
                break
        if last_user_message is None:
            return messages

        content = last_user_message.get("content", "")
        if isinstance(content, list):
            content = " ".join(
                [str(part.get("text") or part.get("content") or part) for part in content if part]
            )
        if not isinstance(content, str):
            content = str(content)

        if not TIME_KEYWORDS_REGEX.search(content or ""):
            return messages

        tool_ids = {resolve_tool_name(str(tool_id)) for tool_id in request.tool_ids or []}
        if "local_time" not in tool_ids:
            return messages

        timezone = request.user_timezone or "UTC"
        locale = request.user_locale or "en-US"
        time_args = {"timezone": timezone, "locale": locale}
        time_result = self._compute_local_time(timezone, locale)

        tool_call_id = f"local-time-{int(time.time() * 1000)}"
        pre_events.append(
            ToolCallEvent(
                id=tool_call_id,
                name="local_time",
                arguments=json.dumps(time_args),
                textIndex=0,
            ).model_dump()
        )
        pre_events.append(
            ToolResultEvent(
                id=tool_call_id,
                name="local_time",
                status="done",
                output=time_result,
            ).model_dump()
        )

        injected = (
            "\n\n[SYSTEM INJECTED CONTEXT]\n"
            f"Current Local Time: {time_result.get('formatted')} ({time_result.get('timezone')})"
        )
        updated_message = dict(last_user_message)
        updated_message["content"] = f"{content}{injected}"
        messages[last_user_index] = updated_message
        return messages

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


