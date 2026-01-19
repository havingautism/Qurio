//! Provider Adapter System
//! Provides a unified interface for different AI providers with provider-specific logic

pub mod traits;
pub mod factory;

mod gemini;
mod glm;
mod kimi;
mod modelscope;
mod openai;
mod siliconflow;
mod nvidia;
mod minimax;
mod base;

pub use traits::{ProviderAdapter, ProviderCredentials, BuildModelParams, ToolCall, ToolCallFunction, AdapterExecutionResult};
pub use factory::{get_provider_adapter, is_provider_supported, supported_providers};
pub use base::BaseAdapter;
