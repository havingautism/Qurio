//! GLM Provider Adapter
//! Handles Zhipu AI's GLM models

use super::base::BaseAdapter;
use super::traits::{BuildModelParams, ProviderAdapter};
use crate::providers::{
    get_capabilities, get_provider_config, ProviderCapabilities, ProviderConfig,
};
use std::collections::HashMap;

pub struct GLMAdapter {
    base: BaseAdapter,
}

impl GLMAdapter {
    pub fn new() -> Self {
        Self {
            base: BaseAdapter::new("glm"),
        }
    }
}

impl Default for GLMAdapter {
    fn default() -> Self {
        Self::new()
    }
}

impl ProviderAdapter for GLMAdapter {
    fn provider_name(&self) -> &str {
        "glm"
    }

    fn config(&self) -> ProviderConfig {
        get_provider_config("glm")
    }

    fn capabilities(&self) -> ProviderCapabilities {
        get_capabilities("glm").unwrap_or_default()
    }

    fn build_model_kwargs(&self, params: &BuildModelParams) -> HashMap<String, serde_json::Value> {
        let mut kwargs = self.base.build_model_kwargs(params);

        // GLM has specific thinking mode configuration
        if let Some(ref thinking) = params.thinking {
            if let Some(ref thinking_type) = thinking.thinking_type {
                kwargs.insert(
                    "thinking".to_string(),
                    serde_json::json!({"type": thinking_type}),
                );

                // Add to extra_body as well for GLM
                let extra_body = serde_json::json!({
                    "thinking": {"type": thinking_type}
                });
                kwargs.insert("extra_body".to_string(), extra_body);
            }
        }

        // GLM supports tool streaming for glm-4.6/4.7 when using tools
        if params.streaming
            && params
                .tools
                .as_ref()
                .map(|t| !t.is_empty())
                .unwrap_or(false)
        {
            let model = params
                .model
                .as_ref()
                .map(|s| s.to_lowercase())
                .unwrap_or_default();
            if model.contains("glm-4.6") || model.contains("glm-4.7") {
                kwargs.insert("tool_stream".to_string(), serde_json::json!(true));
            }
        }

        kwargs
    }

    fn get_base_url(&self, custom_url: Option<&str>) -> Option<String> {
        crate::providers::resolve_base_url("glm", custom_url)
    }
}
