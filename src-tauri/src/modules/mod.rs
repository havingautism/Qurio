//! Application modules
//! Contains specialized services for different features

pub mod mcp_manager;
pub mod deep_research;

pub use mcp_manager::{McpToolManager, McpTool, McpServerConfig, MCP_TOOL_MANAGER};
pub use deep_research::{DeepResearchService, DeepResearchRequest, DeepResearchEvent, DEEP_RESEARCH_SERVICE};
