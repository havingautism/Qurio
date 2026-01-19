//! Provider configuration constants
//! Centralized configuration for all AI providers

/// Base URLs for all providers
pub const PROVIDER_BASE_URLS: &[(&str, &str)] = &[
  ("openai", "https://api.openai.com/v1"),
  ("siliconflow", "https://api.siliconflow.cn/v1"),
  ("glm", "https://open.bigmodel.cn/api/paas/v4"),
  ("modelscope", "https://api-inference.modelscope.cn/v1"),
  ("kimi", "https://api.moonshot.cn/v1"),
  ("nvidia", "https://integrate.api.nvidia.com/v1"),
  ("minimax", "https://api.minimax.io/v1"),
  ("openai_compatibility", ""), // Custom URL, use from request
];

/// Default models for each provider
pub const DEFAULT_MODELS: &[(&str, &str)] = &[
  ("gemini", "gemini-2.0-flash-exp"),
  ("openai", "gpt-4o-mini"),
  ("openai_compatibility", "gpt-4o-mini"),
  ("siliconflow", "deepseek-ai/DeepSeek-V2.5"),
  ("glm", "glm-4-flash"),
  ("modelscope", "AI-ModelScope/glm-4-9b-chat"),
  ("kimi", "moonshot-v1-8k"),
  ("nvidia", "deepseek-ai/deepseek-r1"),
  ("minimax", "MiniMax-M2.1"),
];

/// Provider capabilities
pub const PROVIDER_CAPABILITIES: &[(&str, ProviderCapabilities)] = &[
  (
    "openai",
    ProviderCapabilities {
      supports_streaming: true,
      supports_tool_calls: true,
      supports_streaming_tool_calls: false,
      supports_json_schema: true,
      supports_thinking: false,
      supports_vision: true,
    },
  ),
  (
    "siliconflow",
    ProviderCapabilities {
      supports_streaming: true,
      supports_tool_calls: true,
      supports_streaming_tool_calls: false, // Legacy code forced non-streaming for tools
      supports_json_schema: true,
      supports_thinking: true, // DeepSeek models
      supports_vision: false,
    },
  ),
  (
    "glm",
    ProviderCapabilities {
      supports_streaming: true,
      supports_tool_calls: true,
      supports_streaming_tool_calls: true,
      supports_json_schema: true,
      supports_thinking: true,
      supports_vision: false,
    },
  ),
  (
    "modelscope",
    ProviderCapabilities {
      supports_streaming: true,
      supports_tool_calls: true,
      supports_streaming_tool_calls: false, // API limitation
      supports_json_schema: true,
      supports_thinking: true,
      supports_vision: false,
    },
  ),
  (
    "kimi",
    ProviderCapabilities {
      supports_streaming: true,
      supports_tool_calls: true,
      supports_streaming_tool_calls: true,
      supports_json_schema: true,
      supports_thinking: false,
      supports_vision: false,
    },
  ),
  (
    "gemini",
    ProviderCapabilities {
      supports_streaming: true,
      supports_tool_calls: true,
      supports_streaming_tool_calls: true,
      supports_json_schema: false, // Uses different format
      supports_thinking: true,
      supports_vision: true,
    },
  ),
  (
    "nvidia",
    ProviderCapabilities {
      supports_streaming: true,
      supports_tool_calls: true,
      supports_streaming_tool_calls: true,
      supports_json_schema: true,
      supports_thinking: true,
      supports_vision: true,
    },
  ),
  (
    "minimax",
    ProviderCapabilities {
      supports_streaming: true,
      supports_tool_calls: true,
      supports_streaming_tool_calls: true,
      supports_json_schema: true,
      supports_thinking: true,
      supports_vision: false,
    },
  ),
];

/// Provider capabilities structure
#[derive(Debug, Clone, Copy, Default)]
pub struct ProviderCapabilities {
  pub supports_streaming: bool,
  pub supports_tool_calls: bool,
  pub supports_streaming_tool_calls: bool,
  pub supports_json_schema: bool,
  pub supports_thinking: bool,
  pub supports_vision: bool,
}

/// Get base URL for a provider
pub fn get_base_url(provider: &str) -> Option<&'static str> {
  PROVIDER_BASE_URLS.iter().find(|(p, _)| *p == provider).map(|(_, url)| *url)
}

/// Get default model for a provider
pub fn get_default_model(provider: &str) -> Option<&'static str> {
  DEFAULT_MODELS.iter().find(|(p, _)| *p == provider).map(|(_, model)| *model)
}

/// Get capabilities for a provider
pub fn get_capabilities(provider: &str) -> Option<ProviderCapabilities> {
  PROVIDER_CAPABILITIES
    .iter()
    .find(|(p, _)| *p == provider)
    .map(|(_, caps)| *caps)
}

/// Check if provider supports a specific capability
pub fn supports_capability(provider: &str, capability: &str) -> bool {
  match capability {
    "streaming" => get_capabilities(provider).map(|c| c.supports_streaming).unwrap_or(false),
    "tool_calls" => get_capabilities(provider).map(|c| c.supports_tool_calls).unwrap_or(false),
    "streaming_tool_calls" => get_capabilities(provider)
      .map(|c| c.supports_streaming_tool_calls)
      .unwrap_or(false),
    "json_schema" => get_capabilities(provider).map(|c| c.supports_json_schema).unwrap_or(false),
    "thinking" => get_capabilities(provider).map(|c| c.supports_thinking).unwrap_or(false),
    "vision" => get_capabilities(provider).map(|c| c.supports_vision).unwrap_or(false),
    _ => false,
  }
}

/// Get provider configuration
pub fn get_provider_config(provider: &str) -> ProviderConfig {
  ProviderConfig {
    base_url: get_base_url(provider).map(|s| s.to_string()),
    default_model: get_default_model(provider).map(|s| s.to_string()),
    capabilities: get_capabilities(provider),
  }
}

/// Provider configuration structure
#[derive(Debug, Clone)]
pub struct ProviderConfig {
  pub base_url: Option<String>,
  pub default_model: Option<String>,
  pub capabilities: Option<ProviderCapabilities>,
}
