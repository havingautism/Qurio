"""
Stream chat service using Agno framework.
Main service that orchestrates AI providers, tools, and SSE streaming.
"""

import json
import re
from datetime import datetime
from typing import Any, AsyncGenerator

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
from ..providers import ExecutionContext, get_provider_adapter
from .tools import execute_tool_by_name, get_tool_definitions_by_ids


# Regex for thinking tag parsing
THINKING_OPEN_PATTERN = re.compile(r"<(think|thought)>", re.IGNORECASE)
THINKING_CLOSE_PATTERN = re.compile(r"</(think|thought)>", re.IGNORECASE)


class StreamChatService:
    """
    Stream chat service that handles:
    - Multi-provider support (OpenAI, Gemini, GLM, etc.)
    - Tool calling (local, custom, MCP)
    - SSE streaming with text, thoughts, and tool calls
    - Context limit handling
    """

    def __init__(self):
        self.max_loops = 10

    async def stream_chat(
        self,
        request: StreamChatRequest,
    ) -> AsyncGenerator[dict[str, Any], None]:
        """
        Stream chat completion with tool calling support.

        Args:
            request: Stream chat request with provider, messages, tools, etc.

        Yields:
            SSE event dictionaries (text, thought, tool_call, tool_result, done, error)
        """
        try:
            # Validate request
            self._validate_request(request)

            # Get provider adapter
            adapter = get_provider_adapter(request.provider)

            # Prepare messages with context limit
            messages = adapter.apply_context_limit(
                request.messages,
                request.context_message_limit,
            )

            # Prepare tool definitions
            agent_tool_definitions = get_tool_definitions_by_ids(request.tool_ids)
            user_tool_definitions = self._convert_user_tools(request.user_tools)

            # Convert ToolDefinition models to dicts and combine all tools
            request_tools_dict = [tool.model_dump() for tool in (request.tools or [])]
            all_tools = [
                *request_tools_dict,
                *agent_tool_definitions,
                *user_tool_definitions,
            ]
            all_tools = self._deduplicate_tools(all_tools)

            # Tool calling loop
            current_messages = messages
            loops = 0
            sources_map: dict[str, Any] = {}
            full_content = ""
            full_thought = ""

            while loops < self.max_loops:
                loops += 1

                # Build execution context
                context = ExecutionContext(
                    messages=current_messages,
                    tools=all_tools if all_tools else None,
                    tool_choice=request.tool_choice,
                    temperature=request.temperature,
                    top_p=request.top_p,
                    top_k=request.top_k,
                    frequency_penalty=request.frequency_penalty,
                    presence_penalty=request.presence_penalty,
                    response_format=request.response_format,
                    thinking=request.thinking,
                    stream=request.stream,
                    tavily_api_key=request.tavily_api_key,
                )

                # Execute via provider
                chunk_buffer = {"text": "", "thought": ""}
                pending_tool_calls: list[dict[str, Any]] = []

                async for chunk in adapter.execute(
                    context=context,
                    api_key=request.api_key,
                    model=request.model,
                    base_url=request.base_url,
                ):
                    match chunk.type:
                        case "text":
                            content = chunk.content
                            # Parse thinking tags if enabled
                            parsed = self._parse_thinking_tags(
                                content,
                                request.thinking is not None,
                            )
                            chunk_buffer["text"] += parsed["text"]
                            if parsed["thought"]:
                                chunk_buffer["thought"] += parsed["thought"]

                            # Flush text
                            if chunk_buffer["text"]:
                                full_content += chunk_buffer["text"]
                                yield TextEvent(content=chunk_buffer["text"]).model_dump()
                                chunk_buffer["text"] = ""

                            # Flush thought
                            if chunk_buffer["thought"]:
                                full_thought += chunk_buffer["thought"]
                                yield ThoughtEvent(content=chunk_buffer["thought"]).model_dump()
                                chunk_buffer["thought"] = ""

                        case "thought":
                            full_thought += chunk.thought
                            yield ThoughtEvent(content=chunk.thought).model_dump()

                        case "tool_calls":
                            pending_tool_calls = chunk.tool_calls or []
                            # Emit tool_call events
                            for tool_call in pending_tool_calls:
                                function = tool_call.get("function", {})
                                yield ToolCallEvent(
                                    id=tool_call.get("id"),
                                    name=function.get("name", ""),
                                    arguments=function.get("arguments", ""),
                                ).model_dump()

                        case "tool_result":
                            # Provider executed tool and returned result
                            tool_results = chunk.tool_calls or []
                            for tool_res in tool_results:
                                yield ToolResultEvent(
                                    id=tool_res.get("id"),
                                    name=tool_res.get("name", ""),
                                    status=tool_res.get("status", "done"),
                                    output=tool_res.get("output"),
                                ).model_dump()

                        case "done":
                            # Stream complete
                            if chunk.finish_reason != "tool_calls":
                                yield DoneEvent(
                                    content=full_content,
                                    thought=full_thought or None,
                                    sources=list(sources_map.values()) or None,
                                ).model_dump()
                                return

                        case "error":
                            # Provider returned an error
                            yield ErrorEvent(error=chunk.error or "Unknown error").model_dump()
                            return

                # Execute tools if any
                if pending_tool_calls:
                    # Add assistant message with tool calls
                    current_messages.append({
                        "role": "assistant",
                        "content": "",
                        "tool_calls": pending_tool_calls,
                    })

                    # Execute each tool
                    for tool_call in pending_tool_calls:
                        function = tool_call.get("function", {})
                        tool_name = function.get("name", "")
                        tool_args_str = function.get("arguments", "{}")

                        try:
                            # Parse arguments
                            try:
                                tool_args = json.loads(tool_args_str)
                            except json.JSONDecodeError:
                                tool_args = {}

                            # Execute tool
                            started_at = datetime.now()
                            result = await self._execute_tool(
                                tool_name=tool_name,
                                args=tool_args,
                                request=request,
                            )
                            duration_ms = int((datetime.now() - started_at).total_seconds() * 1000)

                            # Collect sources for search tools
                            if self._is_search_tool(tool_name):
                                self._collect_search_sources(result, sources_map)

                            # Emit tool_result event
                            yield ToolResultEvent(
                                id=tool_call.get("id"),
                                name=tool_name,
                                status="done",
                                output=result,
                                duration_ms=duration_ms,
                            ).model_dump()

                            # Add tool result message
                            current_messages.append({
                                "role": "tool",
                                "tool_call_id": tool_call.get("id"),
                                "name": tool_name,
                                "content": json.dumps(result),
                            })

                        except Exception as e:
                            # Emit error result
                            yield ToolResultEvent(
                                id=tool_call.get("id"),
                                name=tool_name,
                                status="error",
                                error=str(e),
                            ).model_dump()

                            # Add error message
                            current_messages.append({
                                "role": "tool",
                                "tool_call_id": tool_call.get("id"),
                                "name": tool_name,
                                "content": json.dumps({"error": str(e)}),
                            })

                    # Continue loop with tool results
                    continue

                # No tool calls, stream complete
                yield DoneEvent(
                    content=full_content,
                    thought=full_thought or None,
                    sources=list(sources_map.values()) or None,
                ).model_dump()
                return

            # Max loops reached
            yield DoneEvent(
                content=full_content,
                thought=full_thought or None,
                sources=list(sources_map.values()) or None,
            ).model_dump()

        except Exception as e:
            yield ErrorEvent(error=str(e)).model_dump()

    def _validate_request(self, request: StreamChatRequest) -> None:
        """Validate stream chat request."""
        if not request.provider:
            raise ValueError("Missing required field: provider")
        if not request.api_key:
            raise ValueError("Missing required field: apiKey")
        if not request.messages:
            raise ValueError("Missing required field: messages")

        from ..providers import is_provider_supported
        if not is_provider_supported(request.provider):
            raise ValueError(
                f"Unsupported provider: {request.provider}. "
                f"Supported: {', '.join(get_provider_adapter.__code__) if get_provider_adapter.__code__ else 'openai, gemini, siliconflow, glm, kimi, nvidia, minimax, modelscope'}"
            )

    def _convert_user_tools(self, user_tools: list[Any]) -> list[dict[str, Any]]:
        """Convert user tools to provider format."""
        definitions = []
        for tool in user_tools:
            parameters = (
                tool.input_schema
                if hasattr(tool, "input_schema") and tool.input_schema
                else tool.parameters if hasattr(tool, "parameters") else {}
            )
            definitions.append({
                "type": "function",
                "function": {
                    "name": tool.name,
                    "description": tool.description,
                    "parameters": parameters,
                },
            })
        return definitions

    def _deduplicate_tools(self, tools: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Deduplicate tools by name."""
        seen = set()
        unique_tools = []
        for tool in tools:
            name = tool.get("function", {}).get("name", "")
            if name and name not in seen:
                seen.add(name)
                unique_tools.append(tool)
        return unique_tools

    def _parse_thinking_tags(
        self,
        text: str,
        enable_tags: bool,
    ) -> dict[str, str]:
        """
        Parse thinking tags from text.

        Returns:
            Dict with "text" (outside tags) and "thought" (inside tags)
        """
        if not enable_tags:
            return {"text": text, "thought": ""}

        result = {"text": "", "thought": ""}
        remaining = text
        in_thought = False

        while remaining:
            if not in_thought:
                match = THINKING_OPEN_PATTERN.search(remaining)
                if not match:
                    result["text"] += remaining
                    break
                result["text"] += remaining[:match.start()]
                remaining = remaining[match.end():]
                in_thought = True
            else:
                match = THINKING_CLOSE_PATTERN.search(remaining)
                if not match:
                    result["thought"] += remaining
                    break
                result["thought"] += remaining[:match.start()]
                remaining = remaining[match.end():]
                in_thought = False

        return result

    async def _execute_tool(
        self,
        tool_name: str,
        args: dict[str, Any],
        request: StreamChatRequest,
    ) -> dict[str, Any]:
        """Execute a tool by name with given arguments."""
        # Check if it's a user-defined custom tool
        user_tools_map = {tool.name: tool for tool in request.user_tools}

        if tool_name in user_tools_map:
            return await self._execute_custom_tool(
                user_tools_map[tool_name],
                args,
            )

        # Check if it's a local tool
        from .tools import is_local_tool_name
        if is_local_tool_name(tool_name):
            tool_config = {
                "tavilyApiKey": request.tavily_api_key,
                "searchProvider": request.search_provider,
            }
            return await execute_tool_by_name(tool_name, args, tool_config)

        raise ValueError(f"Unknown tool: {tool_name}")

    def _is_search_tool(self, tool_name: str) -> bool:
        """Check if tool is a search tool."""
        return tool_name in {
            "Tavily_web_search",
            "Tavily_academic_search",
            "web_search",
            "academic_search",
            "search",
        }

    def _collect_search_sources(
        self,
        result: dict[str, Any],
        sources_map: dict[str, Any],
    ) -> None:
        """Collect sources from search tool result."""
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
                snippet=item.get("content", item.get("snippet", ""))[:200],
            ).model_dump()

    async def _execute_custom_tool(
        self,
        tool: Any,
        args: dict[str, Any],
    ) -> dict[str, Any]:
        """Execute user-defined custom HTTP tool."""
        # This would implement the custom HTTP tool execution
        # For now, return a placeholder
        return {
            "tool": tool.name,
            "executed": True,
            "args": args,
        }


# Singleton instance
_stream_chat_service: StreamChatService | None = None


def get_stream_chat_service() -> StreamChatService:
    """Get the stream chat service singleton."""
    global _stream_chat_service
    if _stream_chat_service is None:
        _stream_chat_service = StreamChatService()
    return _stream_chat_service
