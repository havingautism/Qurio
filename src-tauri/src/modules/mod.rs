//! Application modules
//! Contains specialized services for different features

pub mod local_tools;
pub mod mcp_manager;
pub mod deep_research;

pub use mcp_manager::{McpToolManager, McpTool, McpServerConfig, MCP_TOOL_MANAGER};
pub use deep_research::{DeepResearchService, DeepResearchRequest, DeepResearchEvent, DEEP_RESEARCH_SERVICE};
pub use local_tools::{
    LocalTimeTool,
    WebpageReaderTool,
    InteractiveFormTool,
    LocalTimeArgs,
    LocalTimeOutput,
    LocalTimeError,
    WebpageReaderArgs,
    WebpageReaderOutput,
    WebpageReaderError,
    InteractiveFormArgs,
    InteractiveFormError,
    FormField,
};
