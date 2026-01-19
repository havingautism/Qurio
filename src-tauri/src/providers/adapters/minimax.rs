//! MiniMax Provider Adapter
//! Handles MiniMax API

use super::base::BaseAdapter;
use super::traits::{BuildModelParams, ProviderAdapter};
use crate::providers::{get_capabilities, get_provider_config, ProviderConfig, ProviderCapabilities};
use std::collections::HashMap;

pub struct MinimaxAdapter {
    base: BaseAdapter,
}

impl MinimaxAdapter {
    pub fn new() -> Self {
        Self {
            base: BaseAdapter::new("minimax"),
        }
    }
}

impl Default for MinimaxAdapter {
    fn default() -> Self {
        Self::new()
    }
}

impl ProviderAdapter for MinimaxAdapter {
    fn provider_name(&self) -> &str {
        "minimax"
    }

    fn config(&self) -> ProviderConfig {
        get_provider_config("minimax")
    }

    fn capabilities(&self) -> ProviderCapabilities {
        get_capabilities("minimax").unwrap_or_default()
    }

    fn build_model_kwargs(&self, params: &BuildModelParams) -> HashMap<String, serde_json::Value> {
        let mut kwargs = self.base.build_model_kwargs(params);

        // MiniMax specific configurations
        // MiniMax supports interleaved Thinking via reasoning_split

        if let Some(ref thinking) = params.thinking {
            if let Some(budget) = thinking.budget_tokens {
                kwargs.insert("reasoning_split".to_string(), serde_json::json!(true));
            }
        }

        kwargs
    }

    fn get_base_url(&self, custom_url: Option<&str>) -> Option<String> {
        crate::providers::resolve_base_url("minimax", custom_url)
    }
}
