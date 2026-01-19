//! Provider Adapter Factory
//! Creates the appropriate adapter based on provider name

use once_cell::sync::Lazy;
use std::collections::HashMap;
use std::sync::Arc;

use super::gemini::GeminiAdapter;
use super::glm::GLMAdapter;
use super::kimi::KimiAdapter;
use super::minimax::MinimaxAdapter;
use super::modelscope::ModelScopeAdapter;
use super::nvidia::NvidiaNimAdapter;
use super::openai::{OpenAIAdapter, OpenAICompatibilityAdapter};
use super::siliconflow::SiliconFlowAdapter;
use super::traits::ProviderAdapter;

// Cache for adapter instances
static ADAPTER_CACHE: Lazy<HashMap<String, Arc<dyn ProviderAdapter>>> = Lazy::new(|| {
    let mut map = HashMap::new();

    // OpenAI and compatible
    map.insert(
        "openai".to_string(),
        Arc::new(OpenAIAdapter::new()) as Arc<dyn ProviderAdapter>,
    );
    map.insert(
        "openai_compatibility".to_string(),
        Arc::new(OpenAICompatibilityAdapter::new()) as Arc<dyn ProviderAdapter>,
    );

    // SiliconFlow
    map.insert(
        "siliconflow".to_string(),
        Arc::new(SiliconFlowAdapter::new()) as Arc<dyn ProviderAdapter>,
    );

    // GLM (Zhipu AI)
    map.insert(
        "glm".to_string(),
        Arc::new(GLMAdapter::new()) as Arc<dyn ProviderAdapter>,
    );

    // Kimi (Moonshot AI)
    map.insert(
        "kimi".to_string(),
        Arc::new(KimiAdapter::new()) as Arc<dyn ProviderAdapter>,
    );

    // ModelScope
    map.insert(
        "modelscope".to_string(),
        Arc::new(ModelScopeAdapter::new()) as Arc<dyn ProviderAdapter>,
    );

    // Gemini (Google)
    map.insert(
        "gemini".to_string(),
        Arc::new(GeminiAdapter::new()) as Arc<dyn ProviderAdapter>,
    );

    // Nvidia NIM
    map.insert(
        "nvidia".to_string(),
        Arc::new(NvidiaNimAdapter::new()) as Arc<dyn ProviderAdapter>,
    );

    // MiniMax
    map.insert(
        "minimax".to_string(),
        Arc::new(MinimaxAdapter::new()) as Arc<dyn ProviderAdapter>,
    );

    map
});

/// Get provider adapter instance
/// Returns a cached adapter for the specified provider
pub fn get_provider_adapter(provider: &str) -> Arc<dyn ProviderAdapter> {
    // Return cached instance if available
    if let Some(adapter) = ADAPTER_CACHE.get(provider) {
        return adapter.clone();
    }

    // Fallback to OpenAI adapter for unknown providers
    // (assumes OpenAI-compatible API)
    ADAPTER_CACHE.get("openai").unwrap().clone()
}

/// Check if provider is supported
pub fn is_provider_supported(provider: &str) -> bool {
    ADAPTER_CACHE.contains_key(provider)
}

/// List all supported providers
pub fn supported_providers() -> Vec<&'static str> {
    ADAPTER_CACHE.keys().map(|s| s.as_str()).collect()
}
