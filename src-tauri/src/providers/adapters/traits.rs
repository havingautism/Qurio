//! Provider Adapter Traits
//! Defines the interface for all provider adapters

use crate::providers::{ProviderCapabilities, ProviderConfig};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Provider credentials structure
#[derive(Debug, Clone)]
pub struct ProviderCredentials {
    pub api_key: String,
    pub base_url: Option<String>,
}

/// Provider-specific parameters for building model instances
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct BuildModelParams {
    pub api_key: String,
    pub model: Option<String>,
    pub temperature: Option<f32>,
    pub top_k: Option<u32>,
    pub top_p: Option<f32>,
    pub frequency_penalty: Option<f32>,
    pub presence_penalty: Option<f32>,
    pub response_format: Option<HashMap<String, serde_json::Value>>,
    pub thinking: Option<ThinkingConfig>,
    pub tools: Option<Vec<serde_json::Value>>,
    pub tool_choice: Option<serde_json::Value>,
    pub streaming: bool,
}

/// Thinking/thinking budget configuration
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ThinkingConfig {
    #[serde(rename = "type")]
    pub thinking_type: Option<String>,
    #[serde(rename = "budgetTokens")]
    pub budget_tokens: Option<u32>,
}

/// Provider adapter execution result
#[derive(Debug, Clone)]
pub enum AdapterExecutionResult {
    /// Streaming response
    Stream {
        model_id: String,
    },
    /// Non-streaming response with content
    Response {
        content: String,
        model_id: String,
    },
    /// Tool calls detected
    ToolCalls {
        tool_calls: Vec<ToolCall>,
        thought: Option<String>,
        model_id: String,
    },
}

/// Tool call structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCall {
    pub id: String,
    pub r#type: String,
    pub function: ToolCallFunction,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCallFunction {
    pub name: String,
    pub arguments: String,
}

/// Provider adapter trait
/// All provider adapters must implement this trait
pub trait ProviderAdapter: Send + Sync {
    /// Get provider name
    fn provider_name(&self) -> &str;

    /// Get provider configuration
    fn config(&self) -> ProviderConfig;

    /// Get provider capabilities
    fn capabilities(&self) -> ProviderCapabilities;

    /// Build model kwargs for this provider
    /// Returns provider-specific model kwargs for OpenAI-compatible APIs
    fn build_model_kwargs(&self, params: &BuildModelParams) -> HashMap<String, serde_json::Value>;

    /// Get base URL for the provider
    fn get_base_url(&self, custom_url: Option<&str>) -> Option<String>;

    /// Check if streaming tool calls are supported
    fn supports_streaming_tool_calls(&self) -> bool {
        self.capabilities().supports_streaming_tool_calls
    }

    /// Extract thinking content from response chunk
    fn extract_thinking_content(&self, chunk: &serde_json::Value) -> Option<String> {
        // Default implementation checks common reasoning fields
        chunk
            .get("additional_kwargs")
            .and_then(|akh| akh.get("__raw_response"))
            .and_then(|raw| raw.get("choices"))
            .and_then(|choices| choices.as_array()?.first())
            .and_then(|choice| choice.get("delta"))
            .and_then(|delta| {
                delta.get("reasoning_content")
                    .or(delta.get("reasoning"))
                    .and_then(|v| v.as_str().map(String::from))
            })
            .or_else(|| {
                chunk
                    .get("additional_kwargs")
                    .and_then(|akh| akh.get("reasoning_content"))
                    .or(chunk.get("additional_kwargs").and_then(|akh| akh.get("reasoning")))
                    .and_then(|v| v.as_str().map(String::from))
            })
    }

    /// Normalize tool calls to standard format
    fn normalize_tool_calls(
        &self,
        tool_calls: &[serde_json::Value],
    ) -> Vec<ToolCall> {
        tool_calls
            .iter()
            .filter_map(|tc| {
                let id = tc.get("id").and_then(|v| v.as_str())?.to_string();
                let call_type = tc.get("type").and_then(|v| v.as_str()).map(|s| s.to_string()).unwrap_or_else(|| "function".to_string());

                // Extract function name from various possible locations
                let function = tc.get("function");
                let name = function
                    .and_then(|f| f.get("name"))
                    .or(tc.get("name"))
                    .or(tc.get("tool").and_then(|t| t.get("name")))
                    .or(tc.get("tool").and_then(|t| t.get("function").and_then(|f| f.get("name"))))
                    .and_then(|v| v.as_str())?
                    .to_string();

                // Extract arguments from various possible locations
                let args = function
                    .and_then(|f| f.get("arguments"))
                    .or(tc.get("arguments"))
                    .or(tc.get("args"))
                    .or(tc.get("tool").and_then(|t| t.get("function").and_then(|f| f.get("arguments"))))
                    .or(tc.get("tool").and_then(|t| t.get("arguments")))
                    .or(tc.get("tool").and_then(|t| t.get("args")));

                let args_str = match args {
                    Some(serde_json::Value::String(s)) => s.clone(),
                    Some(v) => serde_json::to_string(&v).unwrap_or_default(),
                    None => String::new(),
                };

                Some(ToolCall {
                    id,
                    r#type: call_type,
                    function: ToolCallFunction { name, arguments: args_str },
                })
            })
            .filter(|tc| !tc.id.is_empty() && !tc.function.name.is_empty())
            .collect()
    }
}
