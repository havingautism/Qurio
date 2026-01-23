"""
Data models for stream chat API.
Defines request/response schemas compatible with the Node.js backend.
"""

from typing import Any, Literal

from pydantic import BaseModel, Field


# ================================================================================
# Request Models
# ================================================================================

class ToolDefinition(BaseModel):
    """Tool definition for function calling."""
    type: str = Field(default="function", description="Type of tool, usually 'function'")
    function: "FunctionDefinition"


class FunctionDefinition(BaseModel):
    """Function definition for tool calling."""
    name: str
    description: str
    parameters: dict[str, Any] = Field(default_factory=dict)


class ToolCall(BaseModel):
    """Tool call from AI model."""
    id: str | None = None
    type: str = Field(default="function")
    function: "FunctionCall"
    text_index: int | None = Field(default=None, alias="textIndex")


class FunctionCall(BaseModel):
    """Function call details."""
    name: str
    arguments: str


class UserTool(BaseModel):
    """User-defined tool (HTTP or MCP)."""
    id: str
    name: str
    description: str
    type: Literal["http", "mcp"]
    input_schema: dict[str, Any] = Field(default_factory=dict, alias="inputSchema")
    parameters: dict[str, Any] = Field(default_factory=dict)
    config: dict[str, Any] = Field(default_factory=dict)
    category: str | None = None


class StreamChatRequest(BaseModel):
    """Request model for stream chat endpoint."""
    # Provider configuration
    provider: Literal[
        "gemini", "openai", "openai_compatibility", "siliconflow",
        "glm", "modelscope", "kimi", "nvidia", "minimax"
    ]
    api_key: str = Field(..., alias="apiKey")
    base_url: str | None = Field(default=None, alias="baseUrl")
    model: str | None = None

    # Message content
    messages: list[dict[str, Any]]

    # Tool configuration
    tools: list[ToolDefinition] | None = None
    tool_choice: Any = Field(default=None, alias="toolChoice")
    tool_ids: list[str] = Field(default_factory=list, alias="toolIds")
    user_tools: list[UserTool] = Field(default_factory=list, alias="userTools")

    # Response format
    response_format: dict[str, Any] | None = Field(default=None, alias="responseFormat")

    # Thinking mode - supports boolean (enabled/disabled) or dict (specific config)
    thinking: dict[str, Any] | bool | None = None

    # Generation parameters
    temperature: float | None = None
    top_k: int | None = None
    top_p: float | None = None
    frequency_penalty: float | None = None
    presence_penalty: float | None = None

    # Context limit
    context_message_limit: int | None = Field(default=None, alias="contextMessageLimit")

    # Search configuration
    search_provider: Literal["tavily"] | None = Field(default=None, alias="searchProvider")
    tavily_api_key: str | None = Field(default=None, alias="tavilyApiKey")
    search_backend: str | None = Field(default=None, alias="searchBackend")

    # User context
    user_id: str | None = Field(default=None, alias="userId")
    user_timezone: str | None = Field(default=None, alias="userTimezone")
    user_locale: str | None = Field(default=None, alias="userLocale")

    # Stream flag (default true for streaming)
    stream: bool = True


# ================================================================================
# Response Event Models
# ================================================================================

class TextEvent(BaseModel):
    """Text content event."""
    type: Literal["text"] = "text"
    content: str


class ThoughtEvent(BaseModel):
    """Thought/reasoning content event."""
    type: Literal["thought"] = "thought"
    content: str


class ToolCallEvent(BaseModel):
    """Tool call event."""
    type: Literal["tool_call"] = Field(default="tool_call", alias="type")
    id: str | None = None
    name: str
    arguments: str
    text_index: int | None = Field(default=None, alias="textIndex")


class ToolResultEvent(BaseModel):
    """Tool result event."""
    type: Literal["tool_result"] = Field(default="tool_result", alias="type")
    id: str | None = None
    name: str
    status: Literal["calling", "done", "error"]
    output: Any = None
    error: str | None = None
    duration_ms: int | None = Field(default=None, alias="durationMs")


class SourceEvent(BaseModel):
    """Source/citation event."""
    uri: str
    title: str
    snippet: str | None = None


class DoneEvent(BaseModel):
    """Stream completion event."""
    type: Literal["done"] = "done"
    content: str
    thought: str | None = None
    sources: list[SourceEvent] | None = None


class ErrorEvent(BaseModel):
    """Error event."""
    type: Literal["error"] = "error"
    error: str


# Union type for all SSE events
StreamEvent = (
    TextEvent | ThoughtEvent | ToolCallEvent | ToolResultEvent | DoneEvent | ErrorEvent
)


# ================================================================================
# Update forward references
# ================================================================================

ToolDefinition.model_rebuild()
ToolCall.model_rebuild()
