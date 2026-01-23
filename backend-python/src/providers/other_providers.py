"""
Additional provider adapters for OpenAI-compatible APIs.
Includes SiliconFlow, GLM, Kimi, Nvidia, MiniMax, and ModelScope adapters.
"""

from typing import Any

from agno.models.openai.like import OpenAILike
from agno.run.agent import RunContentEvent

from .openai import OpenAIAdapter
from .base import ProviderConfig


class SiliconFlowAdapter(OpenAIAdapter):
    """Adapter for SiliconFlow (DeepSeek models)."""

    def __init__(self):
        self.config = ProviderConfig(
            name="siliconflow",
            base_url="https://api.siliconflow.cn/v1",
            default_model="Qwen/Qwen2.5-7B-Instruct",
            supports_streaming=True,
            supports_tools=True,
            supports_streaming_tool_calls=False,
            supports_json_schema=True,
            supports_thinking=True,  # DeepSeek has reasoning_content
            supports_vision=False,
        )

    def build_model(
        self,
        api_key: str,
        model: str | None = None,
        base_url: str | None = None,
        thinking: dict[str, Any] | bool | None = None,
        tools: list[dict[str, Any]] | None = None,
        tool_choice: Any = None,
        **kwargs
    ) -> OpenAILike:
        """Build SiliconFlow model with thinking support."""
        resolved_base = base_url or self.config.base_url
        resolved_model = model or self.config.default_model

        extra_body: dict[str, Any] = {}

        # Thinking mode support (DeepSeek models)
        if thinking:
            # Extract budget_tokens from thinking dict
            if isinstance(thinking, dict):
                budget = thinking.get("budget_tokens") or thinking.get("budgetTokens") or 1024
            else:
                budget = 1024

            extra_body["thinking_budget"] = budget
            extra_body["enable_thinking"] = True

        # Add tools support
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

    def _extract_thinking_from_event(self, event: RunContentEvent) -> str | None:
        """
        Extract thinking content for SiliconFlow (DeepSeek models).
        DeepSeek uses reasoning_content field when thinking is enabled.
        """
        # First try parent method
        thinking = super()._extract_thinking_from_event(event)
        if thinking:
            return thinking

        # SiliconFlow-specific: Check for reasoning_content in model_provider_data
        if hasattr(event, "model_provider_data") and event.model_provider_data:
            data = event.model_provider_data
            if isinstance(data, dict):
                choices = data.get("choices", [])
                if choices and len(choices) > 0:
                    delta = choices[0].get("delta", {})
                    reasoning = delta.get("reasoning_content")
                    if reasoning:
                        return str(reasoning)

        return None


class GLMAdapter(OpenAIAdapter):
    """Adapter for GLM (Zhipu AI)."""

    def __init__(self):
        self.config = ProviderConfig(
            name="glm",
            base_url="https://open.bigmodel.cn/api/paas/v4",
            default_model="glm-4-flash",
            supports_streaming=True,
            supports_tools=True,
            supports_streaming_tool_calls=True,  # glm-4.6+ supports tool streaming
            supports_json_schema=True,
            supports_thinking=True,
            supports_vision=False,
        )

    def build_model(
        self,
        api_key: str,
        model: str | None = None,
        base_url: str | None = None,
        thinking: dict[str, Any] | bool | None = None,
        tools: list[dict[str, Any]] | None = None,
        tool_choice: Any = None,
        **kwargs
    ) -> OpenAILike:
        """Build GLM model with thinking support."""
        resolved_base = base_url or self.config.base_url
        resolved_model = model or self.config.default_model

        extra_body: dict[str, Any] = {}

        # Thinking mode configuration for GLM
        # Only set if explicitly provided - don't set to 'disabled' by default,
        # as it prevents reasoning_content in tool_stream
        if thinking:
            if isinstance(thinking, bool):
                # Boolean true -> enable thinking with default config
                extra_body["thinking"] = {"type": "enabled"}
            elif isinstance(thinking, dict):
                # Dict format - extract type field if present
                if "type" in thinking:
                    extra_body["thinking"] = {"type": thinking["type"]}
                else:
                    # No type specified, default to enabled
                    extra_body["thinking"] = {"type": "enabled"}

        # Add tools support
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

    def _extract_thinking_from_event(self, event: RunContentEvent) -> str | None:
        """
        Extract thinking content for GLM (Zhipu AI).
        GLM uses reasoning_content field when thinking type is "enabled".
        """
        # First try parent method
        thinking = super()._extract_thinking_from_event(event)
        if thinking:
            return thinking

        # GLM-specific: Check for reasoning_content in model_provider_data
        if hasattr(event, "model_provider_data") and event.model_provider_data:
            data = event.model_provider_data
            if isinstance(data, dict):
                choices = data.get("choices", [])
                if choices and len(choices) > 0:
                    delta = choices[0].get("delta", {})
                    reasoning = delta.get("reasoning_content")
                    if reasoning:
                        return str(reasoning)

        return None


class KimiAdapter(OpenAIAdapter):
    """Adapter for Kimi (Moonshot AI)."""

    def __init__(self):
        self.config = ProviderConfig(
            name="kimi",
            base_url="https://api.moonshot.cn/v1",
            default_model="moonshot-v1-8k",
            supports_streaming=True,
            supports_tools=True,
            supports_streaming_tool_calls=False,
            supports_json_schema=True,
            supports_thinking=False,
            supports_vision=False,
        )


class NvidiaAdapter(OpenAIAdapter):
    """Adapter for Nvidia NIM."""

    def __init__(self):
        self.config = ProviderConfig(
            name="nvidia",
            base_url="https://integrate.api.nvidia.com/v1",
            default_model="deepseek-ai/deepseek-r1",
            supports_streaming=True,
            supports_tools=True,
            supports_streaming_tool_calls=True,
            supports_json_schema=True,
            supports_thinking=True,
            supports_vision=True,
        )

    def build_model(
        self,
        api_key: str,
        model: str | None = None,
        base_url: str | None = None,
        thinking: dict[str, Any] | bool | None = None,
        tools: list[dict[str, Any]] | None = None,
        tool_choice: Any = None,
        **kwargs
    ) -> OpenAILike:
        """Build Nvidia NIM model with thinking support."""
        resolved_base = base_url or self.config.base_url
        resolved_model = model or self.config.default_model

        extra_body: dict[str, Any] = {}

        # Thinking mode support - use chat_template_kwargs for NVIDIA
        if thinking:
            extra_body["chat_template_kwargs"] = {"thinking": True}

        # Add tools support
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

    def _extract_thinking_from_event(self, event: RunContentEvent) -> str | None:
        """
        Extract thinking content for Nvidia NIM.
        Nvidia DeepSeek-R1: reasoning_content in delta or direct access.
        Similar to Node.js: messageChunk?.choices?.[0]?.delta?.reasoning_content
        """
        # First try parent method
        thinking = super()._extract_thinking_from_event(event)
        if thinking:
            return thinking

        # Nvidia-specific: Check direct model_provider_data.choices[0].delta.reasoning_content
        if hasattr(event, "model_provider_data") and event.model_provider_data:
            data = event.model_provider_data
            if isinstance(data, dict):
                choices = data.get("choices", [])
                if choices and len(choices) > 0:
                    delta = choices[0].get("delta", {})
                    reasoning = delta.get("reasoning_content")
                    if reasoning:
                        return str(reasoning)

        return None


class MinimaxAdapter(OpenAIAdapter):
    """Adapter for MiniMax."""

    def __init__(self):
        self.config = ProviderConfig(
            name="minimax",
            base_url="https://api.minimax.io/v1",
            default_model="minimax-m2",
            supports_streaming=True,
            supports_tools=True,
            supports_streaming_tool_calls=True,
            supports_json_schema=True,
            supports_thinking=True,  # Interleaved Thinking via reasoning_split
            supports_vision=False,
        )

    def build_model(
        self,
        api_key: str,
        model: str | None = None,
        base_url: str | None = None,
        thinking: dict[str, Any] | bool | None = None,
        tools: list[dict[str, Any]] | None = None,
        tool_choice: Any = None,
        **kwargs
    ) -> OpenAILike:
        """Build MiniMax model with thinking support."""
        resolved_base = base_url or self.config.base_url
        resolved_model = model or self.config.default_model

        extra_body: dict[str, Any] = {}

        # MiniMax Thinking mode configuration
        # Use reasoning_split=true to separate thinking content into reasoning_details field
        if thinking:
            if isinstance(thinking, bool):
                # Boolean true -> enable reasoning_split
                extra_body["reasoning_split"] = True
            elif isinstance(thinking, dict):
                # Check if thinking type is not 'disabled'
                thinking_type = thinking.get("type", "enabled")
                if thinking_type != "disabled":
                    extra_body["reasoning_split"] = True

        # Add tools support
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

    def _extract_thinking_from_event(self, event: RunContentEvent) -> str | None:
        """
        Extract thinking content for MiniMax.
        MiniMax uses reasoning_details field when reasoning_split is enabled.
        """
        # First try parent method
        thinking = super()._extract_thinking_from_event(event)
        if thinking:
            return thinking

        # MiniMax-specific: Check for reasoning_details field
        if hasattr(event, "model_provider_data") and event.model_provider_data:
            data = event.model_provider_data
            if isinstance(data, dict):
                choices = data.get("choices", [])
                if choices and len(choices) > 0:
                    delta = choices[0].get("delta", {})
                    # MiniMax uses reasoning_details when reasoning_split=true
                    reasoning = delta.get("reasoning_details") or delta.get("reasoning_content")
                    if reasoning:
                        return str(reasoning)

        return None


class ModelScopeAdapter(OpenAIAdapter):
    """Adapter for ModelScope (Chinese models)."""

    def __init__(self):
        self.config = ProviderConfig(
            name="modelscope",
            base_url="https://api-inference.modelscope.cn/v1",
            default_model="AI-ModelScope/glm-4-9b-chat",
            supports_streaming=True,
            supports_tools=True,
            supports_streaming_tool_calls=False,  # API limitation: tools + stream not supported together
            supports_json_schema=True,
            supports_thinking=True,
            supports_vision=False,
        )

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
    ) -> OpenAILike:
        """Build ModelScope model with thinking support."""
        resolved_base = base_url or self.config.base_url
        resolved_model = model or self.config.default_model

        extra_body: dict[str, Any] = {}

        # Thinking mode configuration for ModelScope
        if thinking and stream:
            # Extract budget_tokens from thinking dict
            if isinstance(thinking, dict):
                budget = thinking.get("budget_tokens") or thinking.get("budgetTokens") or 1024
            else:
                budget = 1024

            extra_body["enable_thinking"] = True
            extra_body["thinking_budget"] = budget
        elif not stream:
            # Disable thinking when not streaming
            extra_body["enable_thinking"] = False

        # Add tools support
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

    def _extract_thinking_from_event(self, event: RunContentEvent) -> str | None:
        """
        Extract thinking content for ModelScope.
        ModelScope uses reasoning_content field similar to GLM.
        """
        # First try parent method
        thinking = super()._extract_thinking_from_event(event)
        if thinking:
            return thinking

        # ModelScope-specific: Check for reasoning_content in model_provider_data
        if hasattr(event, "model_provider_data") and event.model_provider_data:
            data = event.model_provider_data
            if isinstance(data, dict):
                choices = data.get("choices", [])
                if choices and len(choices) > 0:
                    delta = choices[0].get("delta", {})
                    reasoning = delta.get("reasoning_content")
                    if reasoning:
                        return str(reasoning)

        return None


class GeminiAdapter(OpenAIAdapter):
    """
    Adapter for Google Gemini.
    Note: Gemini has some differences but can be accessed via OpenAI-compatible endpoint.
    For native Gemini features, use the dedicated Gemini SDK.
    """

    def __init__(self):
        self.config = ProviderConfig(
            name="gemini",
            base_url="https://generativelanguage.googleapis.com/v1beta",
            default_model="gemini-2.0-flash-exp",
            supports_streaming=True,
            supports_tools=True,
            supports_streaming_tool_calls=True,
            supports_json_schema=False,  # Uses different format
            supports_thinking=True,
            supports_vision=True,
        )
