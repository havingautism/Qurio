"""
Provider adapter factory.
Creates the appropriate adapter based on provider name.
"""


from .base import BaseProviderAdapter
from .openai import OpenAIAdapter
from .other_providers import (
    DeepSeekAdapter,
    GeminiAdapter,
    GLMAdapter,
    HuggingFaceAdapter,
    KimiAdapter,
    LiteLLMOpenAIAdapter,
    MinimaxAdapter,
    ModelScopeAdapter,
    NvidiaAdapter,
    OpenRouterAdapter,
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
        case "openrouter":
            adapter = OpenRouterAdapter()
        case "litellm_openai":
            adapter = LiteLLMOpenAIAdapter()
        case "huggingface":
            adapter = HuggingFaceAdapter()
        case "kimi":
            adapter = KimiAdapter()
        case "glm":
            adapter = GLMAdapter()
        case "deepseek":
            adapter = DeepSeekAdapter()
        case "volcengine":
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
        "openrouter",
        "litellm_openai",
        "huggingface",
        "kimi",
        "glm",
        "deepseek",
        "volcengine",
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
    "openrouter",
    "litellm_openai",
    "huggingface",
    "kimi",
    "glm",
    "deepseek",
    "volcengine",
    "modelscope",
    "gemini",
    "nvidia",
    "minimax",
]
