//! Base Provider Adapter
//! Abstract base implementation for provider adapters

use super::traits::{BuildModelParams, ProviderAdapter};
use crate::providers::{get_capabilities, get_provider_config, ProviderCapabilities, ProviderConfig};
use std::collections::HashMap;

pub struct BaseAdapter {
    provider_name: String,
}

impl BaseAdapter {
    pub fn new(provider_name: &str) -> Self {
        Self {
            provider_name: provider_name.to_string(),
        }
    }
}

impl ProviderAdapter for BaseAdapter {
    fn provider_name(&self) -> &str {
        &self.provider_name
    }

    fn config(&self) -> ProviderConfig {
        get_provider_config(&self.provider_name)
    }

    fn capabilities(&self) -> ProviderCapabilities {
        get_capabilities(&self.provider_name).unwrap_or_default()
    }

    fn build_model_kwargs(&self, params: &BuildModelParams) -> HashMap<String, serde_json::Value> {
        let mut kwargs = HashMap::new();

        // Default response format
        if let Some(ref response_format) = params.response_format {
            kwargs.insert(
                "response_format".to_string(),
                serde_json::to_value(response_format).unwrap_or_default(),
            );
        } else {
            kwargs.insert(
                "response_format".to_string(),
                serde_json::json!({"type": "text"}),
            );
        }

        // Thinking mode (for providers that support it)
        if let Some(ref thinking) = params.thinking {
            if let Some(budget) = thinking.budget_tokens {
                kwargs.insert("thinking_budget".to_string(), serde_json::json!(budget));
            }
            if let Some(ref thinking_type) = thinking.thinking_type {
                kwargs.insert(
                    "thinking".to_string(),
                    serde_json::json!({"type": thinking_type}),
                );
            }
        }

        // Optional parameters
        if let Some(top_k) = params.top_k {
            kwargs.insert("top_k".to_string(), serde_json::json!(top_k));
        }
        if let Some(top_p) = params.top_p {
            kwargs.insert("top_p".to_string(), serde_json::json!(top_p));
        }
        if let Some(freq) = params.frequency_penalty {
            kwargs.insert("frequency_penalty".to_string(), serde_json::json!(freq));
        }
        if let Some(presence) = params.presence_penalty {
            kwargs.insert("presence_penalty".to_string(), serde_json::json!(presence));
        }

        // Tools
        if let Some(ref tools) = params.tools {
            if !tools.is_empty() {
                kwargs.insert(
                    "tools".to_string(),
                    serde_json::to_value(tools).unwrap_or_default(),
                );
            }
        }

        // Tool choice
        if let Some(ref tool_choice) = params.tool_choice {
            kwargs.insert("tool_choice".to_string(), tool_choice.clone());
        }

        // Streaming options
        if params.streaming {
            kwargs.insert(
                "stream_options".to_string(),
                serde_json::json!({"include_usage": false}),
            );
        }

        kwargs
    }

    fn get_base_url(&self, custom_url: Option<&str>) -> Option<String> {
        if let Some(url) = custom_url {
            Some(url.to_string())
        } else {
            crate::providers::resolve_base_url(&self.provider_name, None)
        }
    }
}
