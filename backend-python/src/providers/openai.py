"""
OpenAI Provider Adapter using Agno framework.
Handles OpenAI and OpenAI-compatible providers with external tool execution.
"""

import json
import os
from typing import Any, AsyncGenerator

from agno.agent import Agent
from agno.models.openai import OpenAIChat
from agno.models.openai.like import OpenAILike
from agno.run.agent import RunEvent, RunContentEvent, RunCompletedEvent, RunErrorEvent
from agno.tools import tool
from agno.tools.function import Function

from .base import BaseProviderAdapter, ExecutionContext, ProviderConfig, StreamChunk


# Tool registry for external execution - maps tool names to their definitions
_tool_registry: dict[str, dict[str, Any]] = {}
# Cache for dynamically created tool functions
_tool_functions: dict[str, Any] = {}


def _create_tool_function(tool_name: str, tool_def: dict[str, Any] | None = None):
    """Create a placeholder tool function for Agno that defers to external handler.

    Uses Function class directly to properly define the tool with its schema.
    """
    # Get description and parameters from tool definition
    description = ""
    parameters = None
    if tool_def:
        func_def = tool_def.get("function", {})
        description = func_def.get("description", "") or tool_def.get("description", "")
        parameters = func_def.get("parameters", {})

    # Create Function instance with external_execution=True
    # This tells Agno to pause and wait for external execution
    agno_func = Function(
        name=tool_name,
        description=description or f"Tool: {tool_name}",
        parameters=parameters or {},
        external_execution=True,
    )

    _tool_functions[tool_name] = agno_func
    return agno_func


def _register_tools(tools: list[dict[str, Any]] | None):
    """Register tools in the registry and create placeholder functions."""
    global _tool_registry, _tool_functions
    _tool_registry = {}
    _tool_functions = {}

    if not tools:
        return []

    agno_tools = []
    for tool_def in tools:
        # Handle both formats: {"function": {"name": ...}} and {"name": ...}
        func_name = tool_def.get("function", {}).get("name") if "function" in tool_def else tool_def.get("name")
        if func_name:
            _tool_registry[func_name] = tool_def
            # Create placeholder function with @tool decorator
            func = _create_tool_function(func_name, tool_def)
            agno_tools.append(func)

    return agno_tools


class OpenAIAdapter(BaseProviderAdapter):
    """Adapter for OpenAI and OpenAI-compatible providers."""

    def __init__(self):
        config = ProviderConfig(
            name="openai",
            base_url="https://api.openai.com/v1",
            default_model="gpt-4o-mini",
            supports_streaming=True,
            supports_tools=True,
            supports_streaming_tool_calls=False,
            supports_json_schema=True,
            supports_thinking=False,
            supports_vision=True,
        )
        super().__init__(config)

    def build_model(
        self,
        api_key: str,
        model: str | None = None,
        base_url: str | None = None,
        thinking: dict[str, Any] | bool | None = None,
        stream: bool = True,
        tools: list[dict[str, Any]] | None = None,
        tool_choice: Any = None,
        **kwargs
    ) -> OpenAIChat | OpenAILike:
        """Build OpenAI model instance using Agno's OpenAIChat or OpenAILike."""
        resolved_base = base_url or self.config.base_url
        resolved_model = model or self.config.default_model

        # Use OpenAIChat for official OpenAI API (no extra_body support needed)
        if self.config.name == "openai" and resolved_base == self.config.base_url:
            return OpenAIChat(
                id=resolved_model,
                api_key=api_key,
            )

        # Use OpenAILike for OpenAI-compatible APIs (supports extra_body)
        extra_body: dict[str, Any] = {}

        # Handle thinking parameter for OpenAI-compatible APIs (e.g., GLM)
        if thinking:
            if isinstance(thinking, bool):
                # Boolean true -> enable thinking with default config
                extra_body["thinking"] = {"type": "enabled"}
            elif isinstance(thinking, dict):
                # Dict format -> pass through (e.g., {"type": "enabled", "budget_tokens": 1024})
                extra_body["thinking"] = thinking

        # Add tools to extra_body for OpenAI-compatible APIs
        if tools:
            extra_body["tools"] = tools
            if tool_choice:
                extra_body["tool_choice"] = tool_choice

        return OpenAILike(
            id=resolved_model,
            api_key=api_key,
            base_url=resolved_base,
            extra_body=extra_body if extra_body else None,
        )

    async def execute(
        self,
        context: ExecutionContext,
        api_key: str,
        model: str | None = None,
        base_url: str | None = None,
    ) -> AsyncGenerator[StreamChunk, None]:
        """Execute chat completion with streaming using Agno Agent."""
        # Build model with tools if provided
        model_instance = self.build_model(
            api_key=api_key,
            model=model,
            base_url=base_url,
            thinking=context.thinking,
            stream=context.stream,
            tools=context.tools,  # Pass tools to model builder
            tool_choice=context.tool_choice,  # Pass tool_choice
        )

        # Build message list
        from agno.models.message import Message

        input_messages = []
        system_message = None

        for msg in context.messages:
            role = msg.get("role")
            if role == "system":
                content = msg.get("content", "")
                if isinstance(content, list):
                    content = self._convert_content_array(content)
                system_message = content if content else None
            elif role == "tool":
                # Add tool response as assistant message with tool_call_id
                content = msg.get("content", "")
                if isinstance(content, list):
                    content = self._convert_content_array(content)

                message_kwargs = {
                    "role": "assistant",
                    "content": content if content else "",
                    "tool_call_id": msg.get("tool_call_id", ""),
                }
                input_messages.append(Message(**message_kwargs))
            else:
                # Convert role
                if role == "ai":
                    role = "assistant"

                content = msg.get("content", "")
                if isinstance(content, list):
                    content = self._convert_content_array(content)

                message_kwargs = {"role": role, "content": content}
                if "tool_call_id" in msg:
                    message_kwargs["tool_call_id"] = msg["tool_call_id"]
                if "name" in msg:
                    message_kwargs["name"] = msg["name"]

                input_messages.append(Message(**message_kwargs))

        # If no messages, return early
        if not input_messages:
            yield StreamChunk(type="error", error="No messages to process")
            return

        # Create placeholder tools for Agno (for external execution)
        agno_tools = _register_tools(context.tools)

        if os.environ.get("DEBUG_AGNO") == "1":
            import sys
            print(f"[DEBUG] Registered {len(agno_tools)} tools: {[t.name for t in agno_tools]}", file=sys.stderr)

        # Create Agent with model and tools
        agent_constructor_kwargs: dict[str, Any] = {
            "model": model_instance,
        }

        if agno_tools:
            agent_constructor_kwargs["tools"] = agno_tools

        run_kwargs: dict[str, Any] = {
            "input": input_messages,
            "stream": True,
            "stream_events": True,
        }

        if context.temperature is not None:
            run_kwargs["temperature"] = context.temperature

        # Create agent
        agent = Agent(**agent_constructor_kwargs)

        # Track paused event for external tool execution
        paused_event = None

        # Run agent with streaming
        async for event in agent.arun(**run_kwargs):
            # Skip None events
            if event is None:
                continue

            # Log key events only (not every RunContentEvent)
            if os.environ.get("DEBUG_AGNO") == "1":
                import sys
                event_type = type(event).__name__
                event_name = getattr(event, "event", None)
                # Only log important events
                if event_name in ("RunPaused", "RunCompleted", "RunError", "ToolCallStarted", "ToolCallError"):
                    print(f"[DEBUG] {event_type}: {event_name}", file=sys.stderr)

            # Handle different event types during streaming
            if hasattr(event, "event"):
                # Handle RunPausedEvent - capture and break to process externally
                if event.event == RunEvent.run_paused:
                    paused_event = event
                    break  # Exit loop to process paused event

                # Handle RunCompletedEvent
                elif event.event == RunEvent.run_completed:
                    # Check if paused BEFORE yielding done event
                    is_paused = getattr(event, "is_paused", False)
                    if is_paused:
                        paused_event = event
                        break  # Exit loop to process paused event
                    else:
                        # Not paused, safe to yield done
                        for chunk in self._process_completed_event(event):
                            yield chunk
                        return  # Stream complete

                elif event.event == RunEvent.run_error:
                    # Handle error
                    error_msg = str(getattr(event, "content", "Unknown error"))
                    yield StreamChunk(type="error", error=error_msg)
                    return
                else:
                    # Process content events during streaming
                    for chunk in self._process_event(event):
                        yield chunk

        # Process paused event if captured
        if paused_event is not None:
            async for chunk in self._handle_paused_run(agent, paused_event, context):
                yield chunk

    async def _handle_paused_run(
        self,
        agent: Agent,
        paused_event: Any,
        context: ExecutionContext,
    ) -> AsyncGenerator[StreamChunk, None]:
        """Handle a paused run that needs external tool execution.

        This method handles tool calls by:
        1. Extracting tool name and args from the paused event
        2. Emitting tool_call event to the stream
        3. Executing the tool in our backend
        4. Creating a NEW agent run with the tool result appended to messages
        """
        if os.environ.get("DEBUG_AGNO") == "1":
            import sys
            print(f"[DEBUG] _handle_paused_run called", file=sys.stderr)

        # Get tool execution info from the first requirement
        requirements = getattr(paused_event, "requirements", [])
        active_requirements = getattr(paused_event, "active_requirements", [])

        if os.environ.get("DEBUG_AGNO") == "1":
            import sys
            print(f"[DEBUG] requirements count: {len(requirements)}, active_requirements: {len(active_requirements)}", file=sys.stderr)

        if not active_requirements:
            return

        # Process each active requirement
        tool_calls_info = []
        for requirement in active_requirements:
            if hasattr(requirement, "needs_external_execution") and requirement.needs_external_execution:
                tool_name = getattr(requirement.tool_execution, "tool_name", "") if requirement.tool_execution else ""
                tool_args = getattr(requirement.tool_execution, "tool_args", {}) if requirement.tool_execution else {}

                tool_calls_info.append({
                    "name": tool_name,
                    "args": tool_args,
                    "requirement": requirement,
                })

                # Emit tool call event
                tool_call = {
                    "id": getattr(requirement, "id", f"call_{len(tool_calls_info)}"),
                    "type": "function",
                    "function": {
                        "name": tool_name,
                        "arguments": json.dumps(tool_args) if tool_args else "{}",
                    }
                }
                if os.environ.get("DEBUG_AGNO") == "1":
                    import sys
                    print(f"[DEBUG] Emitting tool_call: {tool_call}", file=sys.stderr)
                yield StreamChunk(type="tool_calls", tool_calls=[tool_call])

        # Now we need to get tool results and continue
        # Since acontinue_run needs database, we'll build a new message list with tool results
        # and create a new agent run

        # Get the tool config for external tools (e.g., Tavily API key)
        tool_config = {}
        if context.tavily_api_key:
            tool_config["tavilyApiKey"] = context.tavily_api_key

        if os.environ.get("DEBUG_AGNO") == "1":
            # DEBUG: Log tavily_api_key status
            import sys
            print(f"[DEBUG] tavily_api_key received: {bool(context.tavily_api_key)}, length: {len(context.tavily_api_key) if context.tavily_api_key else 0}", file=sys.stderr)
            print(f"[DEBUG] tool_config keys: {list(tool_config.keys())}", file=sys.stderr)

        # Import here to avoid circular imports
        from src.services.tools import execute_tool_by_name

        # Execute each tool and collect results
        tool_results = []
        for tool_info in tool_calls_info:
            tool_name = tool_info["name"]
            tool_args = tool_info["args"]

            if os.environ.get("DEBUG_AGNO") == "1":
                import sys
                print(f"[DEBUG] Executing tool: {tool_name} with args: {tool_args}", file=sys.stderr)

            try:
                result = await execute_tool_by_name(tool_name, tool_args, tool_config)
                tool_results.append(result)
                if os.environ.get("DEBUG_AGNO") == "1":
                    import sys
                    print(f"[DEBUG] Tool result: {result}", file=sys.stderr)
            except Exception as e:
                error_result = {"error": str(e)}
                tool_results.append(error_result)
                if os.environ.get("DEBUG_AGNO") == "1":
                    import sys
                    print(f"[DEBUG] Tool error: {e}", file=sys.stderr)

            # Emit tool_result event
            requirement = tool_info["requirement"]
            req_id = getattr(requirement, "id", f"call_{len(tool_results)}")
            yield StreamChunk(
                type="tool_result",
                tool_calls=[{
                    "id": req_id,
                    "name": tool_name,
                    "status": "done" if "error" not in (tool_results[-1] or {}) else "error",
                    "output": tool_results[-1],
                }]
            )

        # Now continue by building a new message list and running the agent again
        # We need to construct the messages with tool role

        # Get original messages from context
        messages = context.messages.copy()

        # Add tool calls and results as assistant and tool messages
        for i, tool_info in enumerate(tool_calls_info):
            # Assistant message with tool call
            messages.append({
                "role": "assistant",
                "content": None,
                "tool_calls": [{
                    "id": f"call_{i}",
                    "type": "function",
                    "function": {
                        "name": tool_info["name"],
                        "arguments": json.dumps(tool_info["args"]),
                    }
                }]
            })

            # Tool message with result
            result = tool_results[i] if i < len(tool_results) else {"result": ""}
            result_str = json.dumps(result) if isinstance(result, dict) else str(result)
            messages.append({
                "role": "tool",
                "content": result_str,
                "tool_call_id": f"call_{i}",
            })

        if os.environ.get("DEBUG_AGNO") == "1":
            import sys
            print(f"[DEBUG] Continuing with {len(messages)} messages", file=sys.stderr)

        # Create a new agent run with the updated messages
        # Use the same model but new messages
        new_run_kwargs: dict[str, Any] = {
            "input": messages,
            "stream": True,
            "stream_events": True,
        }

        if context.temperature is not None:
            new_run_kwargs["temperature"] = context.temperature

        # Run the agent with new messages
        async for event in agent.arun(**new_run_kwargs):
            if event is None:
                continue

            if os.environ.get("DEBUG_AGNO") == "1":
                import sys
                print(f"[DEBUG] New run event: {type(event).__name__}, event_name: {getattr(event, 'event', None)}", file=sys.stderr)

            if hasattr(event, "event"):
                if event.event == RunEvent.run_paused:
                    # Another tool call - handle recursively
                    async for chunk in self._handle_paused_run(agent, event, context):
                        yield chunk
                elif event.event == RunEvent.run_completed:
                    is_paused = getattr(event, "is_paused", False)
                    if is_paused:
                        async for chunk in self._handle_paused_run(agent, event, context):
                            yield chunk
                    else:
                        for chunk in self._process_completed_event(event):
                            yield chunk
                elif event.event == RunEvent.run_error:
                    error_msg = str(getattr(event, "content", "Unknown error"))
                    yield StreamChunk(type="error", error=error_msg)
                    return
                else:
                    for chunk in self._process_event(event):
                        yield chunk

    def _process_event(self, event: Any) -> AsyncGenerator[StreamChunk, None]:
        """Process an Agno event and yield stream chunks."""
        # Skip None events
        if event is None:
            return

        if hasattr(event, "event"):
            # Handle reasoning content delta events (thinking mode)
            if event.event == RunEvent.reasoning_content_delta:
                if hasattr(event, "reasoning_content") and event.reasoning_content:
                    yield StreamChunk(type="thought", thought=str(event.reasoning_content))
            # Handle tool call events
            elif event.event == RunEvent.tool_call_started:
                tool_calls = self._extract_tool_calls_from_event(event)
                if tool_calls:
                    yield StreamChunk(type="tool_calls", tool_calls=tool_calls)
            # Handle run content events (regular response)
            elif event.event == RunEvent.run_content:
                # Try to extract thinking content from model_provider_data first
                thinking_content = self._extract_thinking_from_event(event)
                if thinking_content:
                    yield StreamChunk(type="thought", thought=thinking_content)
                # Then yield regular content
                if hasattr(event, "content") and event.content:
                    yield StreamChunk(type="text", content=str(event.content))

    def _process_completed_event(self, event: Any) -> AsyncGenerator[StreamChunk, None]:
        """Process a RunCompletedEvent and yield stream chunks."""
        # Handle run completion
        if hasattr(event, "run_response") and event.run_response:
            content = event.run_response.content
            if content:
                if isinstance(content, list) and len(content) > 0:
                    if isinstance(content[0], dict) and "text" in content[0]:
                        yield StreamChunk(type="text", content=content[0].get("text", ""))
                    else:
                        yield StreamChunk(type="text", content=str(content))
                elif isinstance(content, str):
                    yield StreamChunk(type="text", content=content)

        yield StreamChunk(type="done", finish_reason="stop")

    def _convert_messages(self, messages: list[dict]) -> list[dict]:
        """Convert messages to Agno/OpenAI format."""
        converted = []
        for msg in messages:
            role = msg.get("role")
            if role == "ai":
                role = "assistant"

            converted_msg = {"role": role, "content": msg.get("content", "")}
            if "tool_calls" in msg:
                converted_msg["tool_calls"] = msg["tool_calls"]
            if "tool_call_id" in msg:
                converted_msg["tool_call_id"] = msg["tool_call_id"]
            if "name" in msg:
                converted_msg["name"] = msg["name"]
            converted.append(converted_msg)

        return converted

    def _convert_content_array(self, content: list) -> str | list:
        """Convert content array to string for Agno Message."""
        if not content:
            return ""

        if len(content) == 1 and isinstance(content[0], dict):
            item = content[0]
            if "text" in item:
                return item["text"]
            elif "type" in item and item["type"] == "text":
                return item.get("text", "")

        texts = []
        for item in content:
            if isinstance(item, dict):
                if "text" in item:
                    texts.append(item["text"])
                elif "type" in item and item["type"] == "text":
                    texts.append(item.get("text", ""))
            elif isinstance(item, str):
                texts.append(item)

        if texts:
            return " ".join(texts)

        return content

    def _extract_thinking_from_event(self, event: RunContentEvent) -> str | None:
        """Extract thinking/reasoning content from a RunContentEvent."""
        if os.environ.get("DEBUG_THINKING") == "1":
            import sys
            print(f"[DEBUG] Event type: {type(event)}", file=sys.stderr)
            if hasattr(event, "model_provider_data"):
                print(f"[DEBUG] model_provider_data: {event.model_provider_data}", file=sys.stderr)

        # Method 1: Check model_provider_data (raw response from OpenAI-compatible API)
        if hasattr(event, "model_provider_data") and event.model_provider_data:
            data = event.model_provider_data
            try:
                if isinstance(data, dict):
                    choices = data.get("choices", [])
                    if choices and len(choices) > 0:
                        choice = choices[0]
                        delta = choice.get("delta") or choice.get("message", {})
                        reasoning = delta.get("reasoning_content") or delta.get("reasoning")
                        if reasoning:
                            return str(reasoning)
            except Exception:
                pass

        # Method 2: Check direct event attributes
        if hasattr(event, "reasoning_content") and event.reasoning_content:
            return str(event.reasoning_content)

        # Method 3: Check response_metadata
        if hasattr(event, "response_metadata"):
            raw_response = event.response_metadata or {}
            choices = raw_response.get("choices", [])
            if choices and len(choices) > 0:
                delta = choices[0].get("delta", {})
                reasoning = delta.get("reasoning_content") or delta.get("reasoning")
                if reasoning:
                    return str(reasoning)

        # Method 4: Check additional_kwargs
        if hasattr(event, "additional_kwargs"):
            additional = event.additional_kwargs or {}
            raw = additional.get("__raw_response", {})
            if raw:
                choices = raw.get("choices", [])
                if choices and len(choices) > 0:
                    delta = choices[0].get("delta", {})
                    reasoning = delta.get("reasoning_content") or delta.get("reasoning")
                    if reasoning:
                        return str(reasoning)

            reasoning = additional.get("reasoning_content") or additional.get("reasoning")
            if reasoning:
                return str(reasoning)

        # Method 5: Check for think tags or thought tags in content
        if hasattr(event, "content") and isinstance(event.content, str):
            import re
            think_pattern = r"<think>(.*?)</think>"
            thought_pattern = r"<thought>(.*?)</thought>"
            match = re.search(think_pattern, event.content, re.DOTALL) or re.search(thought_pattern, event.content, re.DOTALL)
            if match:
                return match.group(1).strip()

        return None

    def _extract_tool_calls_from_event(self, event: Any) -> list[dict[str, Any]] | None:
        """Extract tool calls from a tool_call_started event."""
        tool_calls = []

        # Method 1: Check for tool_calls attribute on event
        if hasattr(event, "tool_calls") and event.tool_calls:
            for tc in event.tool_calls:
                if hasattr(tc, "function") and tc.function:
                    tool_call_dict = {
                        "id": getattr(tc, "id", None),
                        "type": "function",
                        "function": {
                            "name": tc.function.name if hasattr(tc.function, "name") else "",
                            "arguments": tc.function.arguments if hasattr(tc.function, "arguments") else "{}",
                        }
                    }
                    tool_calls.append(tool_call_dict)

        # Method 2: Check model_provider_data for OpenAI-style tool calls
        if hasattr(event, "model_provider_data") and event.model_provider_data:
            data = event.model_provider_data
            if isinstance(data, dict):
                choices = data.get("choices", [])
                if choices and len(choices) > 0:
                    message = choices[0].get("message", {})
                    if message.get("tool_calls"):
                        for tc in message["tool_calls"]:
                            tool_call_dict = {
                                "id": tc.get("id"),
                                "type": tc.get("type", "function"),
                                "function": {
                                    "name": tc.get("function", {}).get("name", ""),
                                    "arguments": tc.get("function", {}).get("arguments", "{}"),
                                }
                            }
                            tool_calls.append(tool_call_dict)

        # Method 3: Check response_metadata
        if hasattr(event, "response_metadata") and event.response_metadata:
            raw_response = event.response_metadata or {}
            choices = raw_response.get("choices", [])
            if choices and len(choices) > 0:
                message = choices[0].get("message", {})
                if message.get("tool_calls"):
                    for tc in message["tool_calls"]:
                        tool_call_dict = {
                            "id": tc.get("id"),
                            "type": tc.get("type", "function"),
                            "function": {
                                "name": tc.get("function", {}).get("name", ""),
                                "arguments": tc.get("function", {}).get("arguments", "{}"),
                            }
                        }
                        tool_calls.append(tool_call_dict)

        return tool_calls if tool_calls else None


# Import json for tool args serialization
import json
