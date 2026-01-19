//! SiliconFlow Provider Adapter
//! Handles SiliconFlow API (DeepSeek and other models)

use super::base::BaseAdapter;
use super::traits::{BuildModelParams, ProviderAdapter};
use crate::providers::{get_capabilities, get_provider_config, ProviderConfig, ProviderCapabilities};
use std::collections::HashMap;

pub struct SiliconFlowAdapter {
    base: BaseAdapter,
}

impl SiliconFlowAdapter {
    pub fn new() -> Self {
        Self {
            base: BaseAdapter::new("siliconflow"),
        }
    }
}

impl Default for SiliconFlowAdapter {
    fn default() -> Self {
        Self::new()
    }
}

impl ProviderAdapter for SiliconFlowAdapter {
    fn provider_name(&self) -> &str {
        "siliconflow"
    }

    fn config(&self) -> ProviderConfig {
        get_provider_config("siliconflow")
    }

    fn capabilities(&self) -> ProviderCapabilities {
        get_capabilities("siliconflow").unwrap_or_default()
    }

    fn build_model_kwargs(&self, params: &BuildModelParams) -> HashMap<String, serde_json::Value> {
        let mut kwargs = self.base.build_model_kwargs(params);

        // SiliconFlow has specific thinking mode configuration
        if let Some(ref thinking) = params.thinking {
            let budget = thinking.budget_tokens.unwrap_or(1024);
            kwargs.insert("enable_thinking".to_string(), serde_json::json!(true));
            kwargs.insert("thinking_budget".to_string(), serde_json::json!(budget));
            kwargs.insert("extra_body".to_string(), serde_json::json!({
                "thinking_budget": budget
            }));
        }

        // SiliconFlow doesn't support streaming tool calls
        // The probe-and-stream pattern should be used in the service layer

        kwargs
    }

    fn get_base_url(&self, custom_url: Option<&str>) -> Option<String> {
        crate::providers::resolve_base_url("siliconflow", custom_url)
    }

    fn supports_streaming_tool_calls(&self) -> bool {
        false // SiliconFlow doesn't support streaming tool calls
    }

    fn extract_thinking_content(&self, chunk: &serde_json::Value) -> Option<String> {
        // SiliconFlow/DeepSeek specific: also check raw_response for reasoning_content
        self.base.extract_thinking_content(chunk)
            .or_else(|| {
                chunk
                    .get("response_metadata")
                    .or(chunk.get("additional_kwargs"))
                    .and_then(|m| m.get("reasoning_content"))
                    .or_else(|| {
                        chunk
                            .get("additional_kwargs")
                            .and_then(|m| m.get("reasoning"))
                    })
                    .and_then(|v| v.as_str().map(String::from))
            })
            .or_else(|| {
                // Check content for <think> tags
                let content = chunk.get("content")
                    .or(chunk.get("message").and_then(|m| m.get("content")))
                    .and_then(|v| v.as_str())?;

                if let Some(start) = content.find("<think>") {
                    if let Some(end) = content[start..].find("</think>") {
                        return Some(content[start + 7..start + end].to_string());
                    }
                }
                None
            })
    }
}
