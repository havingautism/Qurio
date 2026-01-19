//! Nvidia NIM Provider Adapter
//! Handles NVIDIA NIM API

use super::base::BaseAdapter;
use super::traits::{BuildModelParams, ProviderAdapter};
use crate::providers::{
    get_capabilities, get_provider_config, ProviderCapabilities, ProviderConfig,
};
use std::collections::HashMap;

pub struct NvidiaNimAdapter {
    base: BaseAdapter,
}

impl NvidiaNimAdapter {
    pub fn new() -> Self {
        Self {
            base: BaseAdapter::new("nvidia"),
        }
    }
}

impl Default for NvidiaNimAdapter {
    fn default() -> Self {
        Self::new()
    }
}

impl ProviderAdapter for NvidiaNimAdapter {
    fn provider_name(&self) -> &str {
        "nvidia"
    }

    fn config(&self) -> ProviderConfig {
        get_provider_config("nvidia")
    }

    fn capabilities(&self) -> ProviderCapabilities {
        get_capabilities("nvidia").unwrap_or_default()
    }

    fn build_model_kwargs(&self, params: &BuildModelParams) -> HashMap<String, serde_json::Value> {
        let mut kwargs = self.base.build_model_kwargs(params);

        // NVIDIA NIM exposes explicit chat_template_kwargs when thinking mode is requested.
        if let Some(ref thinking) = params.thinking {
            if let Ok(thinking_value) = serde_json::to_value(thinking) {
                if !thinking_value.is_null() {
                    kwargs.insert(
                        "chat_template_kwargs".to_string(),
                        serde_json::json!({ "thinking": thinking_value }),
                    );
                }
            }
        }

        // Nvidia NIM specific configurations
        // Nvidia supports streaming tool calls

        kwargs
    }

    fn get_base_url(&self, custom_url: Option<&str>) -> Option<String> {
        crate::providers::resolve_base_url("nvidia", custom_url)
    }
}
