//! OpenAI Compatible Provider Adapter
//! Handles OpenAI and OpenAI-compatible APIs (default fallback)

use super::base::BaseAdapter;
use super::traits::{BuildModelParams, ProviderAdapter};
use crate::providers::{
    get_capabilities, get_provider_config, ProviderCapabilities, ProviderConfig,
};
use std::collections::HashMap;

pub struct OpenAIAdapter {
    base: BaseAdapter,
}

impl OpenAIAdapter {
    pub fn new() -> Self {
        Self {
            base: BaseAdapter::new("openai"),
        }
    }
}

impl Default for OpenAIAdapter {
    fn default() -> Self {
        Self::new()
    }
}

impl ProviderAdapter for OpenAIAdapter {
    fn provider_name(&self) -> &str {
        "openai"
    }

    fn config(&self) -> ProviderConfig {
        get_provider_config("openai")
    }

    fn capabilities(&self) -> ProviderCapabilities {
        get_capabilities("openai").unwrap_or_default()
    }

    fn build_model_kwargs(&self, params: &BuildModelParams) -> HashMap<String, serde_json::Value> {
        self.base.build_model_kwargs(params)
    }

    fn get_base_url(&self, custom_url: Option<&str>) -> Option<String> {
        // For openai_compatibility, use custom URL if provided
        if let Some(url) = custom_url {
            return Some(url.to_string());
        }
        crate::providers::resolve_base_url("openai", None)
    }
}

/// OpenAI Compatibility Adapter (same as OpenAI but with custom base URL support)
pub struct OpenAICompatibilityAdapter {
    base: BaseAdapter,
}

impl OpenAICompatibilityAdapter {
    pub fn new() -> Self {
        Self {
            base: BaseAdapter::new("openai_compatibility"),
        }
    }
}

impl Default for OpenAICompatibilityAdapter {
    fn default() -> Self {
        Self::new()
    }
}

impl ProviderAdapter for OpenAICompatibilityAdapter {
    fn provider_name(&self) -> &str {
        "openai_compatibility"
    }

    fn config(&self) -> ProviderConfig {
        get_provider_config("openai_compatibility")
    }

    fn capabilities(&self) -> ProviderCapabilities {
        // Use OpenAI capabilities as base
        get_capabilities("openai").unwrap_or_default()
    }

    fn build_model_kwargs(&self, params: &BuildModelParams) -> HashMap<String, serde_json::Value> {
        self.base.build_model_kwargs(params)
    }

    fn get_base_url(&self, custom_url: Option<&str>) -> Option<String> {
        // openai_compatibility requires custom URL
        custom_url.map(|s| s.to_string())
    }
}
