"""
Stream chat service implemented with Agno SDK (Agent + tools + DB).
"""

from __future__ import annotations

import json
import re
import time
from datetime import datetime
from typing import Any, AsyncGenerator
from zoneinfo import ZoneInfo

from agno.agent import RunEvent
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

class StreamChatService:
    """Stream chat service implemented using Agno Agent streaming events."""

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

            stream = agent.run(
                input=messages,
                stream=True,
                stream_events=True,
                user_id=request.user_id,
                session_id=request.user_id,
                output_schema=request.response_format,
            )

            for event in stream:
                if not hasattr(event, "event"):
                    continue

                match event.event:
                    case RunEvent.run_content.value:
                        content = getattr(event, "content", None)
                        if content:
                            full_content += str(content)
                            yield TextEvent(content=str(content)).model_dump()
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
                            yield ToolCallEvent(
                                id=tool.tool_call_id,
                                name=tool.tool_name or "",
                                arguments=json.dumps(tool.tool_args or {}),
                            ).model_dump()

                    case RunEvent.tool_call_completed.value:
                        tool_event: ToolCallCompletedEvent = event  # type: ignore[assignment]
                        tool = tool_event.tool
                        if tool:
                            output = self._normalize_tool_output(tool.result)
                            if output and isinstance(output, str):
                                try:
                                    parsed = json.loads(output)
                                    output = parsed
                                except Exception:
                                    pass
                            yield ToolResultEvent(
                                id=tool.tool_call_id,
                                name=tool.tool_name or "",
                                status="done" if not tool.tool_call_error else "error",
                                output=output,
                            ).model_dump()
                            self._collect_search_sources(output, sources_map)

                    case RunEvent.run_completed.value:
                        yield DoneEvent(
                            content=full_content,
                            thought=full_thought or None,
                            sources=list(sources_map.values()) or None,
                        ).model_dump()
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

        if "Tavily_web_search" in enabled_tools:
            citation_prompt = (
                '\n\n[IMPORTANT] You have access to a "Tavily_web_search" tool. When you use this tool to answer a '
                "question, you MUST cite the search results in your answer using the format [1], [2], etc., "
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
        results = []
        if isinstance(result, dict):
            results = result.get("results", [])
        if not isinstance(results, list):
            return
        for item in results:
            url = item.get("url") or item.get("link") or item.get("uri")
            if not url or url in sources_map:
                continue
            sources_map[url] = SourceEvent(
                uri=url,
                title=item.get("title", "Unknown Source"),
                snippet=(item.get("content") or item.get("snippet") or "")[:200],
            ).model_dump()

_stream_chat_service: StreamChatService | None = None

def get_stream_chat_service() -> StreamChatService:
    global _stream_chat_service
    if _stream_chat_service is None:
        _stream_chat_service = StreamChatService()
    return _stream_chat_service
