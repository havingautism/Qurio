//! Provider Adapter System
//! Provides a unified interface for different AI providers with provider-specific logic

pub mod factory;
pub mod traits;

mod base;
mod gemini;
mod glm;
mod kimi;
mod minimax;
mod modelscope;
mod nvidia;
mod openai;
mod siliconflow;

pub use base::BaseAdapter;
pub use factory::{get_provider_adapter, is_provider_supported, supported_providers};
pub use traits::{
    AdapterExecutionResult, BuildModelParams, ProviderAdapter, ProviderCredentials, ToolCall,
    ToolCallFunction,
};
