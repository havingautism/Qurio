//! ModelScope Provider Adapter
//! Handles ModelScope inference API

use super::base::BaseAdapter;
use super::traits::{BuildModelParams, ProviderAdapter};
use crate::providers::{get_capabilities, get_provider_config, ProviderConfig, ProviderCapabilities};
use std::collections::HashMap;

pub struct ModelScopeAdapter {
    base: BaseAdapter,
}

impl ModelScopeAdapter {
    pub fn new() -> Self {
        Self {
            base: BaseAdapter::new("modelscope"),
        }
    }
}

impl Default for ModelScopeAdapter {
    fn default() -> Self {
        Self::new()
    }
}

impl ProviderAdapter for ModelScopeAdapter {
    fn provider_name(&self) -> &str {
        "modelscope"
    }

    fn config(&self) -> ProviderConfig {
        get_provider_config("modelscope")
    }

    fn capabilities(&self) -> ProviderCapabilities {
        get_capabilities("modelscope").unwrap_or_default()
    }

    fn build_model_kwargs(&self, params: &BuildModelParams) -> HashMap<String, serde_json::Value> {
        let mut kwargs = self.base.build_model_kwargs(params);

        // ModelScope API limitations - no streaming tool calls
        if params.tools.as_ref().map(|t| !t.is_empty()).unwrap_or(false) {
            // Remove tools from kwargs for non-streaming if needed
            // The service layer should handle probe-and-stream pattern
        }

        kwargs
    }

    fn get_base_url(&self, custom_url: Option<&str>) -> Option<String> {
        crate::providers::resolve_base_url("modelscope", custom_url)
    }

    fn supports_streaming_tool_calls(&self) -> bool {
        false // ModelScope API limitation
    }
}
