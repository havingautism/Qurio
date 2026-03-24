"""
Provider adapters for various AI model providers.
Uses Agno framework for model abstraction.
"""

from .base import (
    BaseProviderAdapter,
    ExecutionContext,
    ProviderConfig,
    StreamChunk,
)
from .factory import SUPPORTED_PROVIDERS, get_provider_adapter, is_provider_supported
from .openai import OpenAIAdapter
from .other_providers import (
    GeminiAdapter,
    GLMAdapter,
    HuggingFaceAdapter,
    KimiAdapter,
    MinimaxAdapter,
    ModelScopeAdapter,
    NvidiaAdapter,
    OpenRouterAdapter,
    SiliconFlowAdapter,
)

__all__ = [
    # Base
    "BaseProviderAdapter",
    "ExecutionContext",
    "ProviderConfig",
    "StreamChunk",
    # Factory
    "get_provider_adapter",
    "is_provider_supported",
    "SUPPORTED_PROVIDERS",
    # Adapters
    "OpenAIAdapter",
    "SiliconFlowAdapter",
    "GLMAdapter",
    "OpenRouterAdapter",
    "HuggingFaceAdapter",
    "KimiAdapter",
    "NvidiaAdapter",
    "MinimaxAdapter",
    "ModelScopeAdapter",
    "GeminiAdapter",
]
