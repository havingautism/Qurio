//! Kimi Provider Adapter
//! Handles Moonshot AI's Kimi models

use super::base::BaseAdapter;
use super::traits::{BuildModelParams, ProviderAdapter};
use crate::providers::{get_capabilities, get_provider_config, ProviderConfig, ProviderCapabilities};
use std::collections::HashMap;

pub struct KimiAdapter {
    base: BaseAdapter,
}

impl KimiAdapter {
    pub fn new() -> Self {
        Self {
            base: BaseAdapter::new("kimi"),
        }
    }
}

impl Default for KimiAdapter {
    fn default() -> Self {
        Self::new()
    }
}

impl ProviderAdapter for KimiAdapter {
    fn provider_name(&self) -> &str {
        "kimi"
    }

    fn config(&self) -> ProviderConfig {
        get_provider_config("kimi")
    }

    fn capabilities(&self) -> ProviderCapabilities {
        get_capabilities("kimi").unwrap_or_default()
    }

    fn build_model_kwargs(&self, params: &BuildModelParams) -> HashMap<String, serde_json::Value> {
        let mut kwargs = self.base.build_model_kwargs(params);

        // Kimi specific configurations can be added here
        // Kimi doesn't support streaming tool calls

        kwargs
    }

    fn get_base_url(&self, custom_url: Option<&str>) -> Option<String> {
        crate::providers::resolve_base_url("kimi", custom_url)
    }

    fn supports_streaming_tool_calls(&self) -> bool {
        false // Kimi doesn't support streaming tool calls
    }
}
