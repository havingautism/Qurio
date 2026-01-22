"""
Base provider adapter using Agno framework.
Defines the interface for all provider adapters.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, AsyncGenerator, Literal


@dataclass
class ProviderConfig:
    """Provider configuration."""
    name: str
    base_url: str | None = None
    default_model: str = ""
    supports_streaming: bool = True
    supports_tools: bool = True
    supports_streaming_tool_calls: bool = False
    supports_json_schema: bool = True
    supports_thinking: bool = False
    supports_vision: bool = False


@dataclass
class ExecutionContext:
    """Execution context for chat completion."""
    messages: list[dict[str, Any]]
    tools: list[dict[str, Any]] | None = None
    tool_choice: Any = None
    temperature: float | None = None
    top_p: float | None = None
    top_k: int | None = None
    frequency_penalty: float | None = None
    presence_penalty: float | None = None
    response_format: dict[str, Any] | None = None
    thinking: dict[str, Any] | None = None
    stream: bool = True
    tavily_api_key: str | None = None


@dataclass
class StreamChunk:
    """A streaming chunk from the provider."""
    type: Literal["text", "thought", "tool_calls", "done", "error"]
    content: str = ""
    thought: str = ""
    tool_calls: list[dict[str, Any]] | None = None
    finish_reason: str | None = None
    error: str | None = None


class BaseProviderAdapter(ABC):
    """
    Base provider adapter using Agno framework.

    All provider adapters should inherit from this class and implement
    the abstract methods to support their specific provider API.
    """

    def __init__(self, config: ProviderConfig):
        self.config = config

    @abstractmethod
    def build_model(
        self,
        api_key: str,
        model: str | None = None,
        base_url: str | None = None,
        **kwargs
    ) -> Any:
        """
        Build an Agno model instance for this provider.

        Args:
            api_key: API key for the provider
            model: Model name (uses default if not specified)
            base_url: Custom base URL (uses provider default if not specified)
            **kwargs: Additional model parameters

        Returns:
            Configured Agno model instance
        """
        pass

    @abstractmethod
    async def execute(
        self,
        context: ExecutionContext,
        api_key: str,
        model: str | None = None,
        base_url: str | None = None,
    ) -> AsyncGenerator[StreamChunk, None]:
        """
        Execute chat completion with streaming support.

        Args:
            context: Execution context with messages and parameters
            api_key: API key for the provider
            model: Model name to use
            base_url: Custom base URL

        Yields:
            StreamChunk objects with content, thoughts, and tool calls
        """
        pass

    def extract_thinking_content(self, chunk: dict[str, Any]) -> str | None:
        """
        Extract thinking/reasoning content from a streaming chunk.

        Args:
            chunk: Raw chunk from the provider

        Returns:
            Thinking content if present, None otherwise
        """
        # Check common locations for reasoning content
        raw_response = chunk.get("additional_kwargs", {}).get("__raw_response", {})
        choices = raw_response.get("choices", [])
        if choices:
            delta = choices[0].get("delta", {})
            reasoning = delta.get("reasoning_content") or delta.get("reasoning")
            if reasoning:
                return str(reasoning)

        # Check additional_kwargs directly
        additional = chunk.get("additional_kwargs", {})
        reasoning = additional.get("reasoning_content") or additional.get("reasoning")
        if reasoning:
            return str(reasoning)

        return None

    def parse_tool_calls(self, response: dict[str, Any]) -> list[dict[str, Any]] | None:
        """
        Parse tool calls from a response.

        Args:
            response: Response from the provider

        Returns:
            List of tool calls or None
        """
        raw = response.get("additional_kwargs", {}).get("__raw_response", {})
        choice = raw.get("choices", [{}])[0]
        message = choice.get("message", {})

        tool_calls = (
            message.get("tool_calls") or
            response.get("additional_kwargs", {}).get("tool_calls") or
            response.get("tool_calls")
        )

        if tool_calls:
            return list(tool_calls)
        return None

    def get_finish_reason(self, response: dict[str, Any]) -> str | None:
        """Get finish reason from response."""
        raw = response.get("additional_kwargs", {}).get("__raw_response", {})
        return raw.get("choices", [{}])[0].get("finish_reason")

    def normalize_tool_call(self, tool_call: dict[str, Any]) -> dict[str, Any]:
        """Normalize tool call to standard format."""
        function = tool_call.get("function", {})
        return {
            "id": tool_call.get("id"),
            "type": tool_call.get("type", "function"),
            "function": {
                "name": function.get("name") or tool_call.get("name"),
                "arguments": function.get("arguments") or tool_call.get("arguments", ""),
            },
        }

    def apply_context_limit(
        self,
        messages: list[dict[str, Any]],
        limit: int | None
    ) -> list[dict[str, Any]]:
        """
        Apply context limit to messages, preserving system messages.

        Args:
            messages: Message list
            limit: Maximum number of non-system messages to keep

        Returns:
            Filtered message list
        """
        if not limit or limit <= 0 or len(messages) <= limit:
            return messages

        system_messages = [m for m in messages if m.get("role") == "system"]
        non_system_messages = [m for m in messages if m.get("role") != "system"]
        recent = non_system_messages[-limit:]

        return system_messages + recent
