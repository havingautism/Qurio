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
    SourceEvent,
    StreamChatRequest,
    TextEvent,
    ThoughtEvent,
    ToolCallEvent,
    ToolResultEvent,
)
from .agent_registry import get_agent_for_provider
from .tool_registry import resolve_tool_name

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
                session_id=request.user_id,
                output_schema=request.response_format,
            )

            async for event in stream:
                if not hasattr(event, "event"):
                    continue

                match event.event:
                    case RunEvent.run_content.value:
                        content = getattr(event, "content", None)
                        if content:
                            for e in process_text(str(content)):
                                yield e
                        reasoning = getattr(event, "reasoning_content", None)
                        if reasoning:
                            full_thought += str(reasoning)
                            yield ThoughtEvent(content=str(reasoning)).model_dump()

                    case RunEvent.reasoning_content_delta.value:
                        reasoning = getattr(event, "reasoning_content", None)
                        if reasoning:
                            full_thought += str(reasoning)
                            yield ThoughtEvent(content=str(reasoning)).model_dump()

                    case RunEvent.tool_call_started.value:
                        tool_event: ToolCallStartedEvent = event  # type: ignore[assignment]
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
                        tool_event: ToolCallCompletedEvent = event  # type: ignore[assignment]
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

                            # CRITICAL: Suspend execution if tool returns PENDING status (e.g. interactive_form)
                            # This allows the tool pipeline to complete but prevents the model from generating further text.
                            if isinstance(output, dict) and output.get("status") == "PENDING":
                                logger.info(f"Tool {tool.tool_name} returned PENDING. Suspending stream.")
                                yield DoneEvent(
                                    content=full_content or "",
                                    thought=full_thought.strip() or None,
                                    sources=list(sources_map.values()) or None,
                                ).model_dump()
                                return

                    case RunEvent.run_completed.value:
                        # Clean tags from final full_content if they survived
                        cleaned_content = re.sub(r"<(think|thought)>[\s\S]*?(?:</\1>|$)", "", full_content, flags=re.IGNORECASE).strip()
                        
                        # Extra check: if cleaning made content empty, revert to full_content
                        # unless they were purely tags.
                        final_content = cleaned_content if cleaned_content or not full_content else full_content

                        yield DoneEvent(
                            content=final_content,
                            thought=full_thought.strip() or None,
                            sources=list(sources_map.values()) or None,
                        ).model_dump()
                        if request:
                            asyncio.create_task(self._maybe_optimize_memories(agent, request))
                        return

                    case RunEvent.run_error.value:
                        error_msg = getattr(event, "content", None) or "Unknown error"
                        yield ErrorEvent(error=str(error_msg)).model_dump()
                        return

        except Exception as exc:
            logger.error(f"Stream chat error: {exc}")
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

_stream_chat_service: StreamChatService | None = None

def get_stream_chat_service() -> StreamChatService:
    global _stream_chat_service
    if _stream_chat_service is None:
        _stream_chat_service = StreamChatService()
    return _stream_chat_service


