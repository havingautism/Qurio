//! Providers module
//! Centralized provider management for AI models

pub mod adapters;
pub mod constants;

pub use constants::{
    get_base_url, get_capabilities, get_default_model, get_provider_config, supports_capability,
    ProviderCapabilities, ProviderConfig,
};

/// All supported provider names
pub const SUPPORTED_PROVIDERS: &[&str] = &[
    "gemini",
    "openai",
    "openai_compatibility",
    "siliconflow",
    "glm",
    "modelscope",
    "kimi",
    "moonshot",
    "nvidia",
    "minimax",
];

/// Check if a provider is supported
pub fn is_supported_provider(provider: &str) -> bool {
    SUPPORTED_PROVIDERS.contains(&provider)
}

/// Resolve base URL for a provider
/// For "openai_compatibility", returns the custom URL if provided
pub fn resolve_base_url(provider: &str, custom_url: Option<&str>) -> Option<String> {
    match provider {
        "openai_compatibility" => custom_url.map(|s| s.to_string()),
        _ => get_base_url(provider).map(|s| s.to_string()),
    }
}
