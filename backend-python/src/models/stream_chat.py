"""
Data models for stream chat API.
Defines request/response schemas compatible with the Node.js backend.
"""

from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

from ..providers.factory import SUPPORTED_PROVIDERS

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
    provider: str = Field(
        ...,
        json_schema_extra={"enum": SUPPORTED_PROVIDERS},
        description="Provider name. Must be one of the supported Qurio providers.",
    )
    api_key: str = Field(..., alias="apiKey")
    base_url: str | None = Field(default=None, alias="baseUrl")
    model: str | None = None

    # Message content
    messages: list[dict[str, Any]]

    # Tool configuration
    tools: list[ToolDefinition] | None = None
    tool_choice: Any = Field(default=None, alias="toolChoice")
    tool_ids: list[str] = Field(default_factory=list, alias="toolIds")
    skill_ids: list[str] = Field(default_factory=list, alias="skillIds")
    user_tools: list[UserTool] = Field(default_factory=list, alias="userTools")
    skip_default_tools: bool = Field(default=False, alias="skipDefaultTools")

    # Team configuration (Expert Mode)
    expert_mode: bool = Field(default=False, alias="expertMode")
    deep_research: bool = Field(default=False, alias="deepResearch")
    team_mode: Literal["coordinate", "route", "broadcast", "tasks"] | None = Field(default=None, alias="teamMode")
    leader_agent_id: str | None = Field(default=None, alias="leaderAgentId")
    team_agent_ids: list[str] = Field(default_factory=list, alias="teamAgentIds")

    # Response format
    # Response format
    response_format: dict[str, Any] | None = Field(default=None, alias="responseFormat")

    # Thinking mode - supports boolean (enabled/disabled) or dict (specific config)
    thinking: dict[str, Any] | bool | None = None
    thinking_mode: Literal["smart", "deep", "fast"] | None = Field(
        default=None,
        alias="thinkingMode",
    )
    enable_response_cache: bool = Field(default=False, alias="enableResponseCache")

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

    # Session Summary Configuration (Separate from Memory)
    summary_provider: str | None = Field(default=None, alias="summaryProvider")
    summary_model: str | None = Field(default=None, alias="summaryModel")
    summary_base_url: str | None = Field(default=None, alias="summaryBaseUrl")
    summary_api_key: str | None = Field(default=None, alias="summaryApiKey")
    enable_session_summary: bool = Field(default=True, alias="enableSessionSummary")
    is_editing: bool = Field(default=False, alias="isEditing", description="Forced summary rebuild flag (for edits/regenerates)")

# Search result filtering configuration (defaults to the summary-lite model, but can be set independently)
    search_result_filter_provider: str | None = Field(
        default=None,
        alias="searchResultFilterProvider",
    )
    search_result_filter_model: str | None = Field(
        default=None,
        alias="searchResultFilterModel",
    )
    search_result_filter_base_url: str | None = Field(
        default=None,
        alias="searchResultFilterBaseUrl",
    )
    search_result_filter_api_key: str | None = Field(
        default=None,
        alias="searchResultFilterApiKey",
    )

    # Stream flag (default true for streaming)
    stream: bool = True

    # Internal use only: Structured Output schema (Agno v2)
    output_schema: Any | None = Field(default=None, exclude=True)

    # Internal use only: Feature flags set by backend routes
    enable_skills: bool = Field(default=False, exclude=True)
    disable_skills: bool = Field(default=False, alias="disableSkills", exclude=True)

    # Internal use only: Personalized prompt from agent config
    personalized_prompt: str | None = Field(default=None, exclude=True)

    # Internal use only: Agent identification (set by resolve_agent_config)
    agent_id: str | None = Field(default=None, exclude=True)
    agent_name: str | None = Field(default=None, exclude=True)
    agent_emoji: str | None = Field(default=None, exclude=True)
    agent_description: str | None = Field(default=None, exclude=True)

    # Context and Session
    # Context and Session
    conversation_id: str | None = Field(default=None, alias="conversationId", description="Unique identifier for the conversation")
    model_config = {"populate_by_name": True}

    @field_validator("provider")
    @classmethod
    def _validate_provider(cls, value: str) -> str:
        provider = str(value).strip()
        if provider not in SUPPORTED_PROVIDERS:
            supported = ", ".join(SUPPORTED_PROVIDERS)
            raise ValueError(f"Unsupported provider: {provider}. Supported providers: {supported}")
        return provider


    # ========================================================================
    # HITL (Human-in-the-Loop) Interactive Form Support
    # ========================================================================
    # When user submits a form, frontend sends run_id + field_values to resume
    run_id: str | None = Field(default=None, alias="runId", description="Agent run ID for HITL resumption")
    field_values: dict[str, Any] | None = Field(default=None, alias="fieldValues", description="User-submitted form field values")


# Status of an agent in a team run
AgentStatus = Literal["active", "waiting", "ready", "error", "idle"]


class TextEvent(BaseModel):
    """Text content event."""
    model_config = {"populate_by_name": True}

    type: Literal["text"] = "text"
    content: str
    # Agent identification for Team mode (identifies which agent generated this content)
    agent_id: str | None = Field(default=None, alias="agentId")
    agent_name: str | None = Field(default=None, alias="agentName")
    agent_role: str | None = Field(default=None, alias="agentRole")
    agent_emoji: str | None = Field(default=None, alias="agentEmoji")
    agent_status: AgentStatus | None = Field(default=None, alias="agentStatus")


class ThoughtEvent(BaseModel):
    """Thought/reasoning content event."""
    model_config = {"populate_by_name": True}

    type: Literal["thought"] = "thought"
    content: str
    text_index: int | None = Field(default=None, alias="textIndex")
    # Agent identification for Team mode (identifies which agent generated this thought)
    agent_id: str | None = Field(default=None, alias="agentId")
    agent_name: str | None = Field(default=None, alias="agentName")
    agent_role: str | None = Field(default=None, alias="agentRole")
    agent_emoji: str | None = Field(default=None, alias="agentEmoji")
    agent_status: AgentStatus | None = Field(default=None, alias="agentStatus")


class ToolCallEvent(BaseModel):
    """Tool call event."""
    model_config = {"populate_by_name": True}

    type: Literal["tool_call"] = Field(default="tool_call", alias="type")
    id: str | None = None
    name: str
    arguments: str
    text_index: int | None = Field(default=None, alias="textIndex")
    # Agent identification for Team mode
    agent_id: str | None = Field(default=None, alias="agentId")
    agent_name: str | None = Field(default=None, alias="agentName")
    agent_role: str | None = Field(default=None, alias="agentRole")
    agent_emoji: str | None = Field(default=None, alias="agentEmoji")
    agent_status: AgentStatus | None = Field(default=None, alias="agentStatus")


class ToolResultEvent(BaseModel):
    """Tool result event."""
    model_config = {"populate_by_name": True}

    type: Literal["tool_result"] = Field(default="tool_result", alias="type")
    id: str | None = None
    name: str
    status: Literal["calling", "done", "error"]
    output: Any = None
    error: str | None = None
    duration_ms: int | None = Field(default=None, alias="durationMs")
    text_index: int | None = Field(default=None, alias="textIndex")
    # Agent identification for Team mode
    agent_id: str | None = Field(default=None, alias="agentId")
    agent_name: str | None = Field(default=None, alias="agentName")
    agent_role: str | None = Field(default=None, alias="agentRole")
    agent_emoji: str | None = Field(default=None, alias="agentEmoji")
    agent_status: AgentStatus | None = Field(default=None, alias="agentStatus")


class SearchFilterEvent(BaseModel):
    """Search filtering progress/result event."""
    model_config = {"populate_by_name": True}

    type: Literal["search_filter"] = Field(default="search_filter", alias="type")
    id: str | None = None
    name: str
    status: Literal["running", "filtered", "fallback", "unavailable"]
    query: str | None = None
    applied: bool | None = None
    original_count: int | None = Field(default=None, alias="originalCount")
    filtered_count: int | None = Field(default=None, alias="filteredCount")
    fallback_reason: str | None = Field(default=None, alias="fallbackReason")
    original_results: list[dict[str, Any]] | None = Field(default=None, alias="originalResults")
    filtered_results: list[dict[str, Any]] | None = Field(default=None, alias="filteredResults")
    duration_ms: int | None = Field(default=None, alias="durationMs")
    text_index: int | None = Field(default=None, alias="textIndex")
    # Agent identification for Team mode
    agent_id: str | None = Field(default=None, alias="agentId")
    agent_name: str | None = Field(default=None, alias="agentName")
    agent_role: str | None = Field(default=None, alias="agentRole")
    agent_emoji: str | None = Field(default=None, alias="agentEmoji")
    agent_status: AgentStatus | None = Field(default=None, alias="agentStatus")


class SearchPreviewEvent(BaseModel):
    """Search preview event carrying original candidate results."""
    model_config = {"populate_by_name": True}

    type: Literal["search_preview"] = Field(default="search_preview", alias="type")
    id: str | None = None
    name: str
    query: str | None = None
    result_count: int | None = Field(default=None, alias="resultCount")
    results: list[dict[str, Any]] | None = None
    text_index: int | None = Field(default=None, alias="textIndex")
    # Agent identification for Team mode
    agent_id: str | None = Field(default=None, alias="agentId")
    agent_name: str | None = Field(default=None, alias="agentName")
    agent_role: str | None = Field(default=None, alias="agentRole")
    agent_emoji: str | None = Field(default=None, alias="agentEmoji")
    agent_status: AgentStatus | None = Field(default=None, alias="agentStatus")


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


class AgentStatusEvent(BaseModel):
    """Event for signaling agent status transitions in Team mode."""
    model_config = {"populate_by_name": True}

    type: Literal["agent_status"] = "agent_status"
    agent_id: str = Field(..., alias="agentId")
    status: AgentStatus


# Union type for all SSE events
StreamEvent = (
    TextEvent
    | ThoughtEvent
    | ToolCallEvent
    | ToolResultEvent
    | SearchPreviewEvent
    | SearchFilterEvent
    | DoneEvent
    | ErrorEvent
    | FormRequestEvent
    | AgentStatusEvent
)


# ================================================================================
# Update forward references
# ================================================================================

ToolDefinition.model_rebuild()
ToolCall.model_rebuild()
