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
        "glm", "deepseek", "volcengine", "modelscope", "kimi", "nvidia", "minimax"
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
    skip_default_tools: bool = Field(default=False, alias="skipDefaultTools")

    # Response format
    response_format: dict[str, Any] | None = Field(default=None, alias="responseFormat")

    # Thinking mode - supports boolean (enabled/disabled) or dict (specific config)
    thinking: dict[str, Any] | bool | None = None
    thinking_mode: Literal["smart", "deep", "fast"] | None = Field(
        default=None,
        alias="thinkingMode",
    )

    # Generation parameters
    temperature: float | None = None
    top_k: int | None = None
    top_p: float | None = None
    frequency_penalty: float | None = None
    presence_penalty: float | None = None

    # Context limit
    # Turn-based limit (1 turn = user + assistant exchange).
    context_turn_limit: int | None = Field(default=None, alias="contextTurns")

    # Search configuration
    search_provider: Literal["tavily", "serpapi"] | None = Field(default=None, alias="searchProvider")
    tavily_api_key: str | None = Field(default=None, alias="tavilyApiKey")
    exa_api_key: str | None = Field(default=None, alias="exaApiKey")
    exa_search_category: str | None = Field(default=None, alias="exaSearchCategory")
    search_backend: str | None = Field(default=None, alias="searchBackend")
    serpapi_api_key: str | None = Field(default=None, alias="serpapiApiKey")
    concurrency_limit: int | None = Field(default=None, alias="concurrencyLimit")
    sequential_research: bool = Field(default=False, alias="sequentialResearch")

    # User context
    user_id: str | None = Field(default=None, alias="userId")
    user_timezone: str | None = Field(default=None, alias="userTimezone")
    user_locale: str | None = Field(default=None, alias="userLocale")
    enable_long_term_memory: bool = Field(default=False, alias="enableLongTermMemory")
    database_provider: str | None = Field(default=None, alias="databaseProvider")
    memory_provider: str | None = Field(default=None, alias="memoryProvider")
    memory_model: str | None = Field(default=None, alias="memoryModel")
    memory_base_url: str | None = Field(default=None, alias="memoryBaseUrl")
    memory_api_key: str | None = Field(default=None, alias="memoryApiKey")
    memory_domains_prefetch: list[dict[str, Any]] | None = Field(
        default=None,
        alias="memoryDomainsPrefetch",
    )

    # Session Summary Configuration (Separate from Memory)
    summary_provider: str | None = Field(default=None, alias="summaryProvider")
    summary_model: str | None = Field(default=None, alias="summaryModel")
    summary_base_url: str | None = Field(default=None, alias="summaryBaseUrl")
    summary_api_key: str | None = Field(default=None, alias="summaryApiKey")
    enable_session_summary: bool = Field(default=True, alias="enableSessionSummary")
    is_editing: bool = Field(default=False, alias="isEditing", description="Forced summary rebuild flag (for edits/regenerates)")

    # Stream flag (default true for streaming)
    stream: bool = True

    # Internal use only: Structured Output schema (Agno v2)
    output_schema: Any | None = Field(default=None, exclude=True)

    # Internal use only: Feature flags set by backend routes
    enable_skills: bool = Field(default=False, exclude=True)

    # Context and Session
    conversation_id: str | None = Field(default=None, alias="conversationId", description="Unique identifier for the conversation")
    model_config = {"populate_by_name": True}


    # ========================================================================
    # HITL (Human-in-the-Loop) Interactive Form Support
    # ========================================================================
    # When user submits a form, frontend sends run_id + field_values to resume
    run_id: str | None = Field(default=None, alias="runId", description="Agent run ID for HITL resumption")
    field_values: dict[str, Any] | None = Field(default=None, alias="fieldValues", description="User-submitted form field values")


# ================================================================================
# Response Event Models
# ================================================================================

class TextEvent(BaseModel):
    """Text content event."""
    type: Literal["text"] = "text"
    content: str


class ThoughtEvent(BaseModel):
    """Thought/reasoning content event."""
    model_config = {"populate_by_name": True}
    
    type: Literal["thought"] = "thought"
    content: str
    text_index: int | None = Field(default=None, alias="textIndex")


class ToolCallEvent(BaseModel):
    """Tool call event."""
    model_config = {"populate_by_name": True}
    
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
    output: Any | None = None
    thought: str | None = None
    sources: list[SourceEvent] | None = None


class ErrorEvent(BaseModel):
    """Error event."""
    type: Literal["error"] = "error"
    error: str


class FormRequestEvent(BaseModel):
    """Form request event for HITL interactive forms."""
    type: Literal["form_request"] = "form_request"
    run_id: str = Field(..., description="Agent run ID for resumption")
    form_id: str | None = Field(default=None, description="Form identifier from tool call")
    title: str | None = Field(default=None, description="Form title")
    fields: list[dict[str, Any]] = Field(..., description="Form field definitions for frontend rendering")


# Union type for all SSE events
StreamEvent = (
    TextEvent | ThoughtEvent | ToolCallEvent | ToolResultEvent | DoneEvent | ErrorEvent | FormRequestEvent
)


# ================================================================================
# Update forward references
# ================================================================================

ToolDefinition.model_rebuild()
ToolCall.model_rebuild()
