//! ModelScope Provider Adapter
//! Handles ModelScope inference API

use super::base::BaseAdapter;
use super::traits::{BuildModelParams, ProviderAdapter};
use crate::providers::{
    get_capabilities, get_provider_config, ProviderCapabilities, ProviderConfig,
};
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

        // ModelScope thinking mode follows an explicit enable/disable pattern
        if params.streaming && params.thinking.is_some() {
            let thinking = params.thinking.as_ref().unwrap();
            let budget = thinking.budget_tokens.unwrap_or(1024);
            kwargs.insert(
                "extra_body".to_string(),
                serde_json::json!({
                    "enable_thinking": true,
                    "thinking_budget": budget
                }),
            );
            kwargs.insert("enable_thinking".to_string(), serde_json::json!(true));
            kwargs.insert("thinking_budget".to_string(), serde_json::json!(budget));
        } else if !params.streaming {
            // Disable thinking explicitly when not streaming to match the Node.js behavior
            kwargs.insert(
                "extra_body".to_string(),
                serde_json::json!({
                    "enable_thinking": false
                }),
            );
            kwargs.insert("enable_thinking".to_string(), serde_json::json!(false));
        }

        // ModelScope API does not support streaming tool calls; the service layer
        // should implement the probe-and-stream fallback when tools are present.

        kwargs
    }

    fn get_base_url(&self, custom_url: Option<&str>) -> Option<String> {
        crate::providers::resolve_base_url("modelscope", custom_url)
    }

    fn supports_streaming_tool_calls(&self) -> bool {
        false // ModelScope API limitation
    }
}
