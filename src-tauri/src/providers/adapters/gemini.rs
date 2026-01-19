//! Gemini Provider Adapter
//! Handles Google's Gemini models

use super::traits::{BuildModelParams, ProviderAdapter};
use crate::providers::{
    get_capabilities, get_provider_config, ProviderCapabilities, ProviderConfig,
};
use std::collections::HashMap;

pub struct GeminiAdapter;

impl GeminiAdapter {
    pub fn new() -> Self {
        Self
    }
}

impl Default for GeminiAdapter {
    fn default() -> Self {
        Self::new()
    }
}

impl ProviderAdapter for GeminiAdapter {
    fn provider_name(&self) -> &str {
        "gemini"
    }

    fn config(&self) -> ProviderConfig {
        get_provider_config("gemini")
    }

    fn capabilities(&self) -> ProviderCapabilities {
        get_capabilities("gemini").unwrap_or_default()
    }

    fn build_model_kwargs(&self, params: &BuildModelParams) -> HashMap<String, serde_json::Value> {
        let mut kwargs = HashMap::new();

        // Gemini uses different parameter names (topK, topP)
        if let Some(top_k) = params.top_k {
            kwargs.insert("topK".to_string(), serde_json::json!(top_k));
        }
        if let Some(top_p) = params.top_p {
            kwargs.insert("topP".to_string(), serde_json::json!(top_p));
        }

        // Thinking mode for Gemini (requires further investigation for full support)
        if let Some(ref thinking) = params.thinking {
            if let Some(budget) = thinking.budget_tokens {
                kwargs.insert("thinkingBudget".to_string(), serde_json::json!(budget));
            }
        }

        // Response format - Gemini uses different format
        if let Some(ref response_format) = params.response_format {
            if let Some(format_type) = response_format.get("type") {
                kwargs.insert("responseMimeType".to_string(), format_type.clone());
            }
        }

        kwargs
    }

    fn get_base_url(&self, _custom_url: Option<&str>) -> Option<String> {
        // Gemini doesn't support custom base URLs in the same way
        // It uses Google's generativeai.googleapis.com by default
        None
    }

    /// Extract thinking content from Gemini's response format
    /// Gemini returns content as parts array with { thought: true, text: "..." }
    fn extract_thinking_content(&self, chunk: &serde_json::Value) -> Option<String> {
        let content = chunk
            .get("content")
            .or(chunk.get("message").and_then(|m| m.get("content")))?;

        // Gemini returns content as array of parts
        if let Some(parts) = content.as_array() {
            let mut thinking_text = String::new();
            for part in parts {
                if part.get("thought").and_then(|v| v.as_bool()) == Some(true) {
                    if let Some(text) = part.get("text").and_then(|v| v.as_str()) {
                        thinking_text.push_str(text);
                    }
                }
            }
            if !thinking_text.is_empty() {
                return Some(thinking_text);
            }
        }

        // Fallback to default extraction
        None
    }
}
