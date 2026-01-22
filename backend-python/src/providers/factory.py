"""
Provider adapter factory.
Creates the appropriate adapter based on provider name.
"""

from typing import Literal

from .base import BaseProviderAdapter
from .openai import OpenAIAdapter
from .other_providers import (
    GeminiAdapter,
    GLMAdapter,
    KimiAdapter,
    MinimaxAdapter,
    ModelScopeAdapter,
    NvidiaAdapter,
    SiliconFlowAdapter,
)

# Cache adapter instances for reuse
_adapter_cache: dict[str, BaseProviderAdapter] = {}


def get_provider_adapter(
    provider: str,
) -> BaseProviderAdapter:
    """
    Get provider adapter instance.

    Args:
        provider: Provider name (openai, gemini, siliconflow, etc.)

    Returns:
        Provider adapter instance
    """
    # Return cached instance if available
    if provider in _adapter_cache:
        return _adapter_cache[provider]

    # Create new adapter instance
    adapter: BaseProviderAdapter

    match provider:
        case "openai" | "openai_compatibility":
            adapter = OpenAIAdapter()
        case "siliconflow":
            adapter = SiliconFlowAdapter()
        case "kimi":
            adapter = KimiAdapter()
        case "glm":
            adapter = GLMAdapter()
        case "modelscope":
            adapter = ModelScopeAdapter()
        case "gemini":
            adapter = GeminiAdapter()
        case "nvidia":
            adapter = NvidiaAdapter()
        case "minimax":
            adapter = MinimaxAdapter()
        case _:
            # Fallback to OpenAI adapter for unknown providers
            # (assumes OpenAI-compatible API)
            import warnings
            warnings.warn(f"Unknown provider: {provider}, using OpenAI adapter as fallback")
            adapter = OpenAIAdapter()

    # Cache for future use
    _adapter_cache[provider] = adapter
    return adapter


def is_provider_supported(provider: str) -> bool:
    """Check if provider is supported."""
    return provider in [
        "openai",
        "openai_compatibility",
        "siliconflow",
        "kimi",
        "glm",
        "modelscope",
        "gemini",
        "nvidia",
        "minimax",
    ]


# Export all supported providers
SUPPORTED_PROVIDERS: list[str] = [
    "openai",
    "openai_compatibility",
    "siliconflow",
    "kimi",
    "glm",
    "modelscope",
    "gemini",
    "nvidia",
    "minimax",
]
