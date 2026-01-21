//! Application modules
//! Contains specialized services for different features

pub mod local_tools;
pub mod mcp_manager;
pub mod deep_research;
pub mod research_plan;

pub use mcp_manager::{McpToolManager, McpTool, McpServerConfig, MCP_TOOL_MANAGER};
pub use deep_research::{DeepResearchService, DeepResearchRequest, DeepResearchEvent, DEEP_RESEARCH_SERVICE};
pub use research_plan::{ResearchPlanService, ResearchPlanRequest, ResearchPlanResponse, RESEARCH_PLAN_PROMPT_GENERAL, RESEARCH_PLAN_PROMPT_ACADEMIC, RESEARCH_PLAN_SERVICE};
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
