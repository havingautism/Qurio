//! Deep Research Service - Multi-step research with plan execution and streaming
//! Orchestrates research workflows and streams results via SSE
//! Fully migrated from Node.js deepResearchAgentService.js

use std::pin::Pin;

use futures::{Stream, StreamExt, TryStreamExt};
use rig::agent::MultiTurnStreamItem;
use rig::completion::{CompletionModel, Message, Prompt};
use rig::prelude::CompletionClient;
use rig::streaming::StreamingChat;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use tracing::info;

// Import custom providers
use crate::providers::glm_provider::GLMClient;
use crate::providers::kimi_provider::KimiClient;
use crate::providers::minimax_provider::MinimaxClient;
use crate::providers::modelscope_provider::ModelScopeClient;
use crate::providers::nvidia_provider::NvidiaNimClient;
use crate::providers::siliconflow_provider::SiliconFlowClient;
use crate::providers::{get_base_url, get_default_model};
use crate::modules::research_plan::{ResearchPlanRequest, RESEARCH_PLAN_SERVICE};

/// Resolve base URL for a provider (mirrors Node.js implementation)
fn resolve_base_url(provider: &str, custom_url: Option<&str>) -> String {
    match provider {
        "siliconflow" => "https://api.siliconflow.cn/v1".to_string(),
        "glm" => "https://open.bigmodel.cn/api/paas/v4".to_string(),
        "modelscope" => "https://api-inference.modelscope.cn/v1".to_string(),
        "kimi" => "https://api.moonshot.cn/v1".to_string(),
        "nvidia" => "https://integrate.api.nvidia.com/v1".to_string(),
        "minimax" => "https://api.minimax.io/v1".to_string(),
        "openai_compatibility" => custom_url.unwrap_or("https://api.openai.com/v1").to_string(),
        _ => custom_url
            .or(get_base_url(provider))
            .unwrap_or("https://api.openai.com/v1")
            .to_string(),
    }
}

/// Get default model for a provider
fn get_model_name(provider: &str, model: Option<&str>) -> String {
    model
        .map(|s| s.to_string())
        .or_else(|| get_default_model(provider).map(|s| s.to_string()))
        .unwrap_or_else(|| "gpt-4o-mini".to_string())
}

// ============================================================================
// Request/Response Types
// ============================================================================

/// Deep research request
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeepResearchRequest {
    pub provider: String,
    pub api_key: String,
    pub base_url: Option<String>,
    pub model: Option<String>,
    pub messages: Vec<Value>,
    pub tools: Option<Vec<Value>>,
    pub tool_choice: Option<Value>,
    pub temperature: Option<f64>,
    pub top_k: Option<u32>,
    pub top_p: Option<f64>,
    pub frequency_penalty: Option<f64>,
    pub presence_penalty: Option<f64>,
    pub context_message_limit: Option<u32>,
    pub tool_ids: Option<Vec<String>>,
    pub plan: Option<String>,
    pub question: Option<String>,
    pub research_type: Option<String>,
    pub concurrent_execution: Option<bool>,
    pub search_provider: Option<String>,
    pub tavily_api_key: Option<String>,
}

/// Research plan step (matches Node.js structure)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchStep {
    pub step: u32,
    pub action: String,
    #[serde(default)]
    pub thought: String,
    #[serde(default)]
    pub expected_output: String,
    #[serde(default)]
    pub deliverable_format: String,
    #[serde(default)]
    pub depth: String,
    #[serde(default)]
    pub requires_search: bool,
    #[serde(default)]
    pub acceptance_criteria: Vec<String>,
}

/// Research plan metadata (matches Node.js structure)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchPlanMeta {
    #[serde(default)]
    pub research_type: String,
    #[serde(default)]
    pub goal: String,
    #[serde(default)]
    pub complexity: String,
    #[serde(default)]
    pub question_type: String,
    #[serde(default)]
    pub assumptions: Vec<String>,
    #[serde(default)]
    pub plan: Vec<ResearchStep>,
    #[serde(default)]
    pub risks: Vec<String>,
    #[serde(default)]
    pub success_criteria: Vec<String>,
}

/// Research source
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchSource {
    pub title: String,
    pub url: String,
    #[serde(default)]
    pub uri: String,
    #[serde(default)]
    pub snippet: String,
}

/// SSE Event types for deep research streaming (matches Node.js types)
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum DeepResearchEvent {
    #[serde(rename = "research_step")]
    ResearchStep {
        step: u32,
        total: u32,
        title: String,
        status: String,
        #[serde(skip_serializing_if = "Option::is_none", rename = "duration_ms")]
        duration_ms: Option<u64>,
        #[serde(skip_serializing_if = "Option::is_none")]
        error: Option<String>,
    },
    #[serde(rename = "tool_call")]
    ToolCall {
        id: Option<String>,
        name: Option<String>,
        arguments: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        step: Option<u32>,
        #[serde(skip_serializing_if = "Option::is_none")]
        total: Option<u32>,
    },
    #[serde(rename = "tool_result")]
    ToolResult {
        id: Option<String>,
        name: Option<String>,
        status: String,
        #[serde(skip_serializing_if = "Option::is_none", rename = "duration_ms")]
        duration_ms: Option<u64>,
        output: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        error: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        step: Option<u32>,
        #[serde(skip_serializing_if = "Option::is_none")]
        total: Option<u32>,
    },
    #[serde(rename = "text")]
    Text {
        content: String,
    },
    #[serde(rename = "done")]
    Done {
        content: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        sources: Option<Vec<ResearchSource>>,
    },
    #[serde(rename = "error")]
    Error {
        error: String,
    },
}

// ============================================================================
// Helper Functions
// ============================================================================

/// Parse research plan from JSON text (mirrors Node.js parsePlan)
fn parse_plan(plan_text: &str) -> ResearchPlanMeta {
    let parsed: Result<serde_json::Value, _> = serde_json::from_str(plan_text);

    match parsed {
        Ok(value) => {
            if let Some(plan) = value.get("plan").and_then(|p| p.as_array()) {
                if !plan.is_empty() {
                    // Try to deserialize the full structure
                    if let Ok(meta) = serde_json::from_value(value.clone()) {
                        return meta;
                    }
                }
            }
        }
        Err(_) => {}
    }

    // Default plan if parsing fails
    ResearchPlanMeta {
        research_type: "general".to_string(),
        goal: "".to_string(),
        complexity: "medium".to_string(),
        question_type: "analysis".to_string(),
        assumptions: vec![],
        plan: vec![ResearchStep {
            step: 1,
            action: "Summarize the topic and gather key evidence.".to_string(),
            thought: "Gather initial information".to_string(),
            expected_output: "A concise summary with evidence.".to_string(),
            deliverable_format: "paragraph".to_string(),
            depth: "medium".to_string(),
            requires_search: true,
            acceptance_criteria: vec![],
        }],
        risks: vec![],
        success_criteria: vec![],
    }
}

/// Build sources list string (mirrors Node.js buildSourcesList)
fn build_sources_list(sources: &HashMap<String, ResearchSource>) -> Vec<String> {
    sources
        .values()
        .enumerate()
        .map(|(idx, source)| {
            let title = if !source.title.is_empty() {
                &source.title
            } else if !source.url.is_empty() {
                &source.url
            } else if !source.uri.is_empty() {
                &source.uri
            } else {
                &format!("Source {}", idx + 1)
            };
            let url = if !source.url.is_empty() {
                &source.url
            } else if !source.uri.is_empty() {
                &source.uri
            } else {
                ""
            };
            let url_part: &str = if url.is_empty() { "" } else { &format!(" {}", url) };
            format!("[{}] {}{}", idx + 1, title, url_part)
        })
        .collect()
}

/// Check if tool name is a Tavily search tool (mirrors Node.js isTavilySearchToolName)
fn is_tavily_search_tool_name(name: &str) -> bool {
    name == "Tavily_web_search"
        || name == "Tavily_academic_search"
        || name == "web_search"
        || name == "academic_search"
}

/// Collect web search sources (mirrors Node.js collectWebSearchSources)
fn collect_web_search_sources(result: &Value, sources_map: &mut HashMap<String, ResearchSource>) {
    if let Some(results) = result.get("results").and_then(|r| r.as_array()) {
        for item in results {
            if let Some(url) = item.get("url").and_then(|u| u.as_str()) {
                if !sources_map.contains_key(url) {
                    let title = item
                        .get("title")
                        .and_then(|t| t.as_str())
                        .unwrap_or("Unknown Source")
                        .to_string();
                    let snippet = item
                        .get("content")
                        .and_then(|c| c.as_str())
                        .map(|s| s.chars().take(200).collect())
                        .unwrap_or_default();
                    sources_map.insert(
                        url.to_string(),
                        ResearchSource {
                            title,
                            url: url.to_string(),
                            uri: url.to_string(),
                            snippet,
                        },
                    );
                }
            }
        }
    }
}

/// Build step prompt (mirrors Node.js buildStepPrompt)
fn build_step_prompt(
    plan_meta: &ResearchPlanMeta,
    step: &ResearchStep,
    step_index: usize,
    prior_findings: &[String],
    sources_list: &[String],
    research_type: &str,
) -> String {
    let assumptions = &plan_meta.assumptions;
    let acceptance_criteria = &step.acceptance_criteria;
    let is_academic = research_type == "academic";

    let base_info = format!(
        r#"Goal: {}
Question type: {}
Step {}: {}
Expected output: {}
Deliverable format: {}
Depth: {}
Requires search: {}

Assumptions:
{}

Acceptance criteria:
{}

Prior findings:
{}

Known sources (cite as [index]):
{}"#,
        plan_meta.goal,
        plan_meta.question_type,
        step_index + 1,
        step.action,
        step.expected_output,
        step.deliverable_format,
        step.depth,
        if step.requires_search { "true" } else { "false" },
        if assumptions.is_empty() {
            "- None".to_string()
        } else {
            assumptions.iter().map(|a| format!("- {}", a)).collect::<Vec<_>>().join("\n")
        },
        if acceptance_criteria.is_empty() {
            "- None".to_string()
        } else {
            acceptance_criteria.iter().map(|a| format!("- {}", a)).collect::<Vec<_>>().join("\n")
        },
        if prior_findings.is_empty() {
            "- None".to_string()
        } else {
            prior_findings.iter().map(|f| format!("- {}", f)).collect::<Vec<_>>().join("\n")
        },
        if sources_list.is_empty() {
            "- None".to_string()
        } else {
            sources_list.join("\n")
        },
    );

    if is_academic {
        format!(
            r#"You are executing an academic research plan step.

{base_info}

CRITICAL ACADEMIC REQUIREMENTS:

1. SOURCE QUALITY
   - Prioritize peer-reviewed journal articles and conference proceedings
   - For each source, note: publication venue, year, and whether it's peer-reviewed
   - Distinguish between primary research, reviews, and meta-analyses
   - Flag preprints or non-peer-reviewed sources explicitly

2. EVIDENCE AND CITATION
   - Cite ALL factual claims using [index] format
   - Never make unsourced claims about research findings or statistics
   - When multiple sources agree/disagree, cite all relevant ones
   - Note the strength of evidence (e.g., "based on large-scale RCT" vs "preliminary findings")

3. CRITICAL EVALUATION
   - Assess methodological rigor of cited studies
   - Note sample sizes, study designs, and potential limitations
   - Identify potential biases or confounding factors
   - Highlight any conflicting findings across studies

4. SCHOLARLY LANGUAGE
   - Use formal academic tone (third person, precise terminology)
   - Employ appropriate hedging language ("suggests", "indicates", "implies")
   - Avoid overgeneralizations or absolute claims
   - Define technical terms when first introduced

5. SYSTEMATIC APPROACH
   - Follow the step's acceptance criteria rigorously
   - If this is a search step, use broad, well-defined search terms
   - If this is an analysis step, organize findings thematically
   - Build logically on prior findings

Instructions:
- Use Tavily_academic_search or Tavily_web_search tools as needed to gather peer-reviewed evidence
- When citing sources, use [1], [2], etc. based on the known sources list
- Return a scholarly, well-structured output suitable for inclusion in an academic report
- Maintain objectivity and acknowledge uncertainty where appropriate

NEGATIVE CONSTRAINTS (CRITICAL):
- **NO OUTSIDE KNOWLEDGE**: You must ONLY use the information provided in "Prior findings" and "Known sources".
- **NO HALLUCINATION**: If the provided sources do not contain the answer, explicitly state it. DO NOT make up facts.
- **STRICT CITATION**: Every single factual claim must have a citation [x].
- **NO SYNTHETIC SOURCES**: Do not invent source titles or links. Use the [index] exactly as listed."#,
            base_info = base_info.trim()
        )
    } else {
        format!(
            r#"You are executing a structured research plan step.

{base_info}

Instructions:
- Use the available tools when needed to gather evidence.
- When citing sources, use [1], [2], etc. based on the known sources list.
- Return a concise step output that can be used by subsequent steps."#,
            base_info = base_info.trim()
        )
    }
}

/// Build final report prompt (mirrors Node.js buildFinalReportPrompt)
fn build_final_report_prompt(
    plan_meta: &ResearchPlanMeta,
    question: &str,
    findings: &[String],
    sources_list: &[String],
    research_type: &str,
) -> String {
    let is_academic = research_type == "academic";

    let base_info = format!(
        r#"Question: {}
Plan goal: {}
Question type: {}

Findings to synthesize:
{}

Sources (cite as [index]):
{}"#,
        question,
        plan_meta.goal,
        plan_meta.question_type,
        if findings.is_empty() {
            "- None".to_string()
        } else {
            findings.iter().map(|f| format!("- {}", f)).collect::<Vec<_>>().join("\n")
        },
        if sources_list.is_empty() {
            "- None".to_string()
        } else {
            sources_list.join("\n")
        },
    );

    if is_academic {
        format!(
            r#"You are writing an academic research report based on a systematic literature review.

{base_info}

REPORT STRUCTURE:

Your report MUST follow this academic structure:

## 1. ABSTRACT (150-250 words)
   - Brief summary of research question, methods, key findings, and implications
   - Written last, but appears first

## 2. INTRODUCTION
   - Background and context for the research question
   - Significance and relevance of the topic
   - Clear statement of research objectives/questions
   - Scope and limitations of the review

## 3. METHODOLOGY (if applicable)
   - Search strategy (databases, keywords, timeframe)
   - Inclusion/exclusion criteria
   - Quality assessment approach
   - Data extraction and synthesis methods

## 4. LITERATURE REVIEW / FINDINGS
   Organize thematically (NOT source-by-source):
   - Group findings by major themes or subtopics
   - For each theme:
     * Synthesize what multiple sources say
     * Cite all relevant sources [1][2][3]
     * Note consensus and disagreements
     * Assess quality of evidence
   - Present conflicting findings objectively
   - Distinguish between well-established and preliminary findings

## 5. DISCUSSION
   - Interpret the synthesized findings
   - Compare with broader theoretical frameworks
   - Address research questions posed in introduction
   - Note implications for theory and practice
   - Acknowledge limitations of the evidence base:
     * Methodological limitations of cited studies
     * Gaps in coverage (populations, contexts, outcomes)
     * Potential publication bias
   - Discuss areas of uncertainty or ongoing debate

## 6. CONCLUSION
   - Summarize key findings and their significance
   - Highlight main contributions of this review
   - Suggest directions for future research
   - Provide actionable recommendations (if appropriate)

## 7. REFERENCES
   - **MANDATORY**: This section must ONLY contain sources listed in the "Sources" block provided above.
   - **NO OMISSIONS**: Include every source you cited in the text.
   - **NO ADDITIONS**: Do NOT add any external books, papers, or links that are not in the provided Source list.
   - Format: "[index] Title. URL" (Copy exactly from the Source list).

ACADEMIC WRITING STANDARDS:

- **Tone**: Formal, objective, third-person
- **Language**: Precise terminology, appropriate hedging
- **Citations**: Every factual claim must have a citation
- **Evidence hierarchy**: Note study designs and sample sizes
- **Critical thinking**: Evaluate rather than just summarize
- **Synthesis**: Integrate across sources, don't just list findings
- **Limitations**: Always acknowledge what is NOT known

QUALITY CHECKLIST:
- [ ] Every factual claim is cited
- [ ] Sources are critically evaluated, not just reported
- [ ] Conflicting evidence is presented fairly
- [ ] Limitations are explicitly discussed
- [ ] Implications for future research are clear
- [ ] Academic tone is maintained throughout

NEGATIVE CONSTRAINTS (CRITICAL):
- **NO EXTERNAL KNOWLEDGE**: You must ONLY use the information provided in the "Sources" section. Do not use outside knowledge to fill gaps.
- **NO HALLUCINATION**: If the provided sources do not contain the answer, explicitly state "The provided sources do not contain information about X". DO NOT make up facts, authors, or years.
- **STRICT CITATION**: Every single paragraph must contain at least one citation [x].
- **NO SYNTHETIC SOURCES**: Do not invent source titles or links. Use the [index] exactly as listed in the "Sources" section.

HALLUCINATION CHECK:
Before writing each sentence, ask: "Is this fact present in source [x]?" If no, delete it.
If you violate these constraints, the task is considered failed.

Produce a comprehensive, publication-quality academic report.

CRITICAL FINAL INSTRUCTION:
When writing the "7. REFERENCES" section, you MUST strictly copy the list below. Do NOT add anything else.

OFFICIAL SOURCE LIST (USE THESE AND ONLY THESE):
{}"#,
            if sources_list.is_empty() {
                "No sources available.".to_string()
            } else {
                sources_list.join("\n")
            },
            base_info = base_info.trim(),
        )
    } else {
        format!(
            r#"You are a deep research writer producing a final report.

{base_info}

Requirements:
- Evidence-driven and traceable: every factual claim must be backed by a citation.
- Include a short "Self-check" section at the end with 3-5 bullets.
- Use clear headings and complete the full report in one response."#,
            base_info = base_info.trim()
        )
    }
}

// ============================================================================
// Stream Content Collection
// ============================================================================

/// Extract text content from streaming response
async fn collect_stream_content<R>(
    stream: &mut rig::streaming::StreamingCompletionResponse<R>,
) -> Result<String, String>
where
    R: Clone + Unpin + rig::completion::GetTokenUsage,
{
    let mut content = String::new();
    while let Some(chunk) = stream.next().await {
        match chunk {
            Ok(rig::streaming::StreamedAssistantContent::Text(text)) => {
                content.push_str(&text.text);
            }
            Ok(rig::streaming::StreamedAssistantContent::Reasoning(reasoning)) => {
                for line in &reasoning.reasoning {
                    content.push_str(line);
                    content.push('\n');
                }
            }
            Ok(rig::streaming::StreamedAssistantContent::ReasoningDelta { reasoning, .. }) => {
                content.push_str(&reasoning);
            }
            _ => {
                // Ignore tool calls and other content types for simple completion
            }
        }
    }
    Ok(content)
}

// ============================================================================
// Deep Research Service
// ============================================================================

#[derive(Clone)]
pub struct DeepResearchService {
    sources: Arc<Mutex<HashMap<String, ResearchSource>>>,
    findings: Arc<Mutex<Vec<String>>>,
}

impl DeepResearchService {
    pub fn new() -> Self {
        Self {
            sources: Arc::new(Mutex::new(HashMap::new())),
            findings: Arc::new(Mutex::new(Vec::new())),
        }
    }

    async fn reset_state(&self) {
        self.sources.lock().await.clear();
        self.findings.lock().await.clear();
    }

    async fn get_sources(&self) -> HashMap<String, ResearchSource> {
        self.sources.lock().await.clone()
    }

    async fn add_finding(&self, finding: String) {
        self.findings.lock().await.push(finding);
    }

    async fn get_findings(&self) -> Vec<String> {
        self.findings.lock().await.clone()
    }

    /// Execute a step with tool calling (plan/execute agent pattern)
    /// Creates an agent with Tavily search tool based on research_type
    async fn execute_with_tools(
        &self,
        messages: &[Value],
        provider: &str,
        api_key: &str,
        base_url: Option<&str>,
        model: Option<&str>,
        research_type: &str,
        tavily_api_key: Option<String>,
        step_index: u32,
        total_steps: u32,
    ) -> Result<(String, Vec<DeepResearchEvent>), String> {
        const MAX_TURNS: usize = 4;

        let resolved_url = resolve_base_url(provider, base_url);
        let model_name = get_model_name(provider, model);

        // Convert messages: collect system content, use last user message as prompt
        let mut system_parts: Vec<String> = Vec::new();
        let mut last_user = String::new();

        for m in messages {
            let role = m.get("role").and_then(|r| r.as_str()).unwrap_or("user");
            let content = m.get("content").and_then(|c| c.as_str()).unwrap_or("");
            match role {
                "system" => system_parts.push(content.to_string()),
                "user" => last_user = content.to_string(),
                _ => {}
            }
        }

        let prompt = if system_parts.is_empty() {
            Message::user(last_user)
        } else {
            Message::user(format!("{}\n\nUser Question: {}", system_parts.join("\n\n"), last_user))
        };

        // Build agent with tools based on research_type (mirrors Node.js buildModel)
        // All providers use OpenAI-compatible API format for tool calling
        let builder = rig::providers::openai::CompletionsClient::<reqwest::Client>::builder()
            .api_key(api_key.to_string())
            .base_url(&resolved_url);
        let client = builder.build().map_err(|e| e.to_string())?;

        // Use helper function to build agent with tools
        let agent = crate::rig_server::build_research_agent(
            &client,
            &model_name,
            research_type,
            tavily_api_key,
            None,
        )?;

        let mut stream = agent.stream_chat(prompt, vec![]).multi_turn(MAX_TURNS).await;
        let mut content = String::new();
        let mut tool_events = Vec::new();
        let mut tool_names: HashMap<String, String> = HashMap::new();
        let mut turn_count = 0;

        while let Some(item) = stream.next().await {
            turn_count += 1;
            match item {
                Ok(MultiTurnStreamItem::StreamAssistantItem(c)) => {
                    content.push_str(&Self::extract_text(c));
                }
                Ok(MultiTurnStreamItem::StreamAssistantItem(
                    rig::streaming::StreamedAssistantContent::ToolCall(tc),
                )) => {
                    tracing::info!("[DeepResearch] Tool call received: {}", tc.function.name);
                    tool_names.insert(tc.id.clone(), tc.function.name.clone());
                    let args = serde_json::to_string(&tc.function.arguments).unwrap_or_default();
                    tool_events.push(DeepResearchEvent::ToolCall {
                        id: Some(tc.id),
                        name: Some(tc.function.name),
                        arguments: args,
                        step: Some(step_index),
                        total: Some(total_steps),
                    });
                }
                Ok(MultiTurnStreamItem::StreamUserItem(
                    rig::streaming::StreamedUserContent::ToolResult(tr),
                )) => {
                    let name = tool_names.get(&tr.id).cloned();
                    tracing::info!("[DeepResearch] Tool result received: {:?}", name);
                    let output = Self::parse_tool_result(&tr.content);
                    tool_events.push(DeepResearchEvent::ToolResult {
                        id: Some(tr.id),
                        name,
                        status: "done".to_string(),
                        duration_ms: None,
                        output,
                        error: None,
                        step: Some(step_index),
                        total: Some(total_steps),
                    });
                }
                _ => {}
            }
        }

        tracing::info!("[DeepResearch] Step {} completed - turns: {}, content_len: {}, tool_calls: {}",
                      step_index, turn_count, content.len(), tool_events.len());

        Ok((content, tool_events))
    }

    /// Parse tool result content
    fn parse_tool_result(content: &rig::OneOrMany<rig::completion::message::ToolResultContent>) -> String {
        let mut texts = Vec::new();
        for item in content.iter() {
            if let rig::completion::message::ToolResultContent::Text(t) = item {
                texts.push(t.text.clone());
            }
        }
        // Return empty object string if no output, to avoid null display issues
        if texts.is_empty() {
            return "{}".to_string();
        }
        serde_json::to_string(&texts[0])
            .unwrap_or_else(|_| texts[0].clone())
    }

    /// Extract text from streamed assistant content
    fn extract_text<R>(content: rig::streaming::StreamedAssistantContent<R>) -> String {
        match content {
            rig::streaming::StreamedAssistantContent::Text(t) => t.text,
            rig::streaming::StreamedAssistantContent::Reasoning(r) => r.reasoning.join("\n"),
            rig::streaming::StreamedAssistantContent::ReasoningDelta { reasoning, .. } => reasoning,
            _ => String::new(),
        }
    }

    /// Stream deep research (mirrors Node.js streamDeepResearch)
    pub async fn execute_stream(
        &self,
        request: DeepResearchRequest,
    ) -> Pin<Box<dyn Stream<Item = Result<axum::response::sse::Event, std::convert::Infallible>> + Send>> {
        let service = self.clone();
        let _ = service.reset_state().await;

        // Extract request parameters
        let provider = request.provider.clone();
        let api_key = request.api_key.clone();
        let base_url = request.base_url.clone();
        let model = request.model.clone();
        let messages = request.messages;
        let context_message_limit = request.context_message_limit;
        let plan = request.plan;
        let question = request.question.unwrap_or_default();
        let research_type = request.research_type.unwrap_or_else(|| "general".to_string());
        let concurrent_execution = request.concurrent_execution.unwrap_or(false);
        let tavily_api_key = request.tavily_api_key.clone();
        let search_provider = request.search_provider.clone();

        // Trim messages if context limit is set
        let trimmed_messages: Vec<Value> = if let Some(limit) = context_message_limit {
            if limit > 0 {
                messages.iter().rev().take(limit as usize).rev().cloned().collect()
            } else {
                messages
            }
        } else {
            messages
        };

        let resolved_url = resolve_base_url(&provider, base_url.as_deref());
        let model_name = get_model_name(&provider, model.as_deref());

        info!("[DeepResearch] Starting execute_stream. Type: {}", research_type);
        info!("[DeepResearch] Provider: {}, Model: {}", provider, model_name);

        let stream = async_stream::stream! {
            // Send initial comment event
            yield Ok(axum::response::sse::Event::default()
                .event("comment")
                .data("ok"));

            // Phase 1: Generate or use provided plan
            let plan_content = if plan.as_ref().map_or(true, |p| p.trim().is_empty()) {
                // Generate plan using RESEARCH_PLAN_SERVICE (mirrors Node.js)
                info!("[DeepResearch] Generating plan with research_type: {}", research_type);

                let plan_request = ResearchPlanRequest {
                    provider: provider.clone(),
                    message: question.clone(),
                    api_key: api_key.clone(),
                    base_url: base_url.clone(),
                    model: model.clone(),
                    research_type: Some(research_type.clone()),
                };

                match RESEARCH_PLAN_SERVICE.generate(&plan_request).await {
                    Ok(content) => content,
                    Err(e) => {
                        info!("[DeepResearch] Plan generation failed: {}", e);
                        // Return default plan
                        serde_json::to_string(&ResearchPlanMeta {
                            research_type: research_type.clone(),
                            goal: question.clone(),
                            complexity: "medium".to_string(),
                            question_type: if research_type == "academic" { "analysis".to_string() } else { "analysis".to_string() },
                            assumptions: vec!["Reader wants comprehensive information".to_string()],
                            plan: vec![
                                ResearchStep {
                                    step: 1,
                                    action: "Research and gather key information".to_string(),
                                    thought: "Initial research".to_string(),
                                    expected_output: "Summary of key findings".to_string(),
                                    deliverable_format: "paragraph".to_string(),
                                    depth: "medium".to_string(),
                                    requires_search: true,
                                    acceptance_criteria: vec!["Cover main topics".to_string()],
                                },
                                ResearchStep {
                                    step: 2,
                                    action: "Analyze and synthesize findings".to_string(),
                                    thought: "Analysis".to_string(),
                                    expected_output: "Detailed analysis".to_string(),
                                    deliverable_format: "paragraph".to_string(),
                                    depth: "medium".to_string(),
                                    requires_search: false,
                                    acceptance_criteria: vec!["Connect related concepts".to_string()],
                                },
                                ResearchStep {
                                    step: 3,
                                    action: "Summarize conclusions and recommendations".to_string(),
                                    thought: "Conclusion".to_string(),
                                    expected_output: "Final summary".to_string(),
                                    deliverable_format: "bullet_list".to_string(),
                                    depth: "low".to_string(),
                                    requires_search: false,
                                    acceptance_criteria: vec!["Actionable insights".to_string()],
                                },
                            ],
                            risks: vec![],
                            success_criteria: vec!["Reader understands the topic".to_string()],
                        }).unwrap_or_default()
                    }
                }
            } else {
                // Use provided plan
                plan.unwrap()
            };

            let plan_meta = parse_plan(&plan_content);
            let steps = &plan_meta.plan;
            let total_steps = steps.len() as u32;

            info!("[DeepResearch] Plan parsed with {} steps", total_steps);

            // Phase 2: Execute research steps
            let mut findings = service.get_findings().await;

            info!("[DeepResearch] Starting Phase 2 - executing {} steps", total_steps);

            // For each step, execute and collect findings
            for (i, step) in steps.iter().enumerate() {
                let step_title = if !step.action.is_empty() {
                    &step.action
                } else {
                    "Research"
                };

                info!("[DeepResearch] Phase 2 - Step {}/{}: {}", i + 1, total_steps, step_title);

                // Emit running event
                yield Ok(axum::response::sse::Event::default()
                    .event("message")
                    .data(&serde_json::to_string(&DeepResearchEvent::ResearchStep {
                        step: (i + 1) as u32,
                        total: total_steps,
                        title: step_title.to_string(),
                        status: "running".to_string(),
                        duration_ms: None,
                        error: None,
                    }).unwrap()));

                let step_start = std::time::Instant::now();

                // Get current sources list
                let current_sources = service.get_sources().await;
                let sources_list = build_sources_list(&current_sources);

                // Build step prompt with full context (mirrors Node.js buildStepPrompt)
                let step_prompt = build_step_prompt(
                    &plan_meta,
                    step,
                    i,
                    &findings,
                    &sources_list,
                    &research_type,
                );

                // Build stepMessages mirroring Node.js structure:
                // [{role: 'system', content: stepPrompt}, ...trimmedMessages, {role: 'user', content: question}]
                let step_messages: Vec<Value> = vec![
                    serde_json::json!({ "role": "system", "content": step_prompt }),
                ]
                .into_iter()
                .chain(
                    trimmed_messages
                        .iter()
                        .filter(|m| {
                            // Filter out system messages from the original context
                            m.get("role").map(|r| r != "system").unwrap_or(true)
                        })
                        .cloned(),
                )
                .chain(vec![serde_json::json!({ "role": "user", "content": question })].into_iter())
                .collect();

                // Execute step with tool calling (mirrors Node.js runToolCallingStep)
                let step_result = service.execute_with_tools(
                    &step_messages,
                    &provider,
                    &api_key,
                    base_url.as_deref(),
                    model.as_deref(),
                    &research_type,
                    tavily_api_key.clone(),
                    (i + 1) as u32,
                    total_steps,
                ).await;

                match step_result {
                    Ok((content, tool_events)) => {
                        // Emit tool events first
                        let events: Vec<DeepResearchEvent> = tool_events;
                        for event in events {
                            let event_json = serde_json::to_string(&event).unwrap();
                            yield Ok(axum::response::sse::Event::default()
                                .event("message")
                                .data(&event_json));
                        }

                        // Store step content in findings (NOT sent as text event)
                        // Only the final report in Phase 3 uses text events
                        findings.push(content.clone());
                        service.add_finding(content).await;

                        // Emit done event
                        yield Ok(axum::response::sse::Event::default()
                            .event("message")
                            .data(&serde_json::to_string(&DeepResearchEvent::ResearchStep {
                                step: (i + 1) as u32,
                                total: total_steps,
                                title: step_title.to_string(),
                                status: "done".to_string(),
                                duration_ms: Some(step_start.elapsed().as_millis() as u64),
                                error: None,
                            }).unwrap()));
                    }
                    Err(e) => {
                        // Emit error event
                        yield Ok(axum::response::sse::Event::default()
                            .event("message")
                            .data(&serde_json::to_string(&DeepResearchEvent::ResearchStep {
                                step: (i + 1) as u32,
                                total: total_steps,
                                title: step_title.to_string(),
                                status: "error".to_string(),
                                duration_ms: Some(step_start.elapsed().as_millis() as u64),
                                error: Some(e),
                            }).unwrap()));
                    }
                }
            }

            // Phase 3: Stream final report (mirrors Node.js phase 3)
            info!("[DeepResearch] Starting Phase 3 - generating final report");
            let final_sources = service.get_sources().await;
            let final_findings = service.get_findings().await;
            info!("[DeepResearch] Phase 3 - findings count: {}, sources count: {}",
                  final_findings.len(), final_sources.len());
            let sources_list = build_sources_list(&final_sources);

            // Build final report prompt (mirrors Node.js buildFinalReportPrompt)
            let report_prompt = build_final_report_prompt(
                &plan_meta,
                &question,
                &final_findings,
                &sources_list,
                &research_type,
            );

            info!("[DeepResearch] Building final report");

            // Build messages for report (mirrors Node.js reportMessages)
            let report_messages: Vec<Value> = vec![
                serde_json::json!({ "role": "system", "content": report_prompt }),
            ]
            .into_iter()
            .chain(
                trimmed_messages
                    .iter()
                    .filter(|m| {
                        m.get("role").map(|r| r != "system").unwrap_or(true)
                    })
                    .cloned(),
            )
            .chain(vec![serde_json::json!({ "role": "user", "content": question })].into_iter())
            .collect();

            // Stream the report using true streaming (mirrors Node.js reportModel.stream)
            match service.stream_completion(&report_messages, &provider, &api_key, base_url.as_deref(), model.as_deref()).await {
                Ok(mut stream) => {
                    let mut full_content = String::new();

                    while let Some(chunk_result) = stream.next().await {
                        match chunk_result {
                            Ok(chunk_text) => {
                                if !chunk_text.is_empty() {
                                    full_content.push_str(&chunk_text);
                                    yield Ok(axum::response::sse::Event::default()
                                        .event("message")
                                        .data(&serde_json::to_string(&DeepResearchEvent::Text {
                                            content: chunk_text,
                                        }).unwrap()));
                                }
                            }
                            Err(e) => {
                                tracing::error!("[DeepResearch] Stream error: {}", e);
                            }
                        }
                    }

                    // Emit done event
                    let final_sources_vec: Vec<ResearchSource> = final_sources.values().cloned().collect();
                    let sources_json = if final_sources_vec.is_empty() {
                        None
                    } else {
                        Some(final_sources_vec)
                    };

                    yield Ok(axum::response::sse::Event::default()
                        .event("message")
                        .data(&serde_json::to_string(&DeepResearchEvent::Done {
                            content: full_content,
                            sources: sources_json,
                        }).unwrap()));
                }
                Err(e) => {
                    yield Ok(axum::response::sse::Event::default()
                        .event("message")
                        .data(&serde_json::to_string(&DeepResearchEvent::Error {
                            error: e,
                        }).unwrap()));
                }
            }
        };
        Box::pin(stream)
    }

    /// Complete with a simple prompt (non-streaming)
    async fn complete(
        &self,
        prompt: &str,
        provider: &str,
        api_key: &str,
        base_url: Option<&str>,
        model: Option<&str>,
    ) -> Result<String, String> {
        let resolved_url = resolve_base_url(provider, base_url);
        let model_name = get_model_name(provider, model);

        let use_streaming = matches!(
            provider,
            "siliconflow" | "glm" | "modelscope" | "kimi" | "nvidia" | "minimax"
        );

        match provider {
            "gemini" => {
                let client = rig::providers::gemini::Client::builder()
                    .api_key(api_key.to_string())
                    .build()
                    .map_err(|e| e.to_string())?;
                let agent = client.agent(model_name).build();
                agent.prompt(prompt).await.map_err(|e| e.to_string())
            }
            "openai" | "openai_compatibility" => {
                let builder = rig::providers::openai::CompletionsClient::<reqwest::Client>::builder()
                    .api_key(api_key.to_string())
                    .base_url(&resolved_url);
                let client = builder.build().map_err(|e| e.to_string())?;
                let agent = client.agent(model_name).build();
                agent.prompt(prompt).await.map_err(|e| e.to_string())
            }
            "siliconflow" if use_streaming => {
                let client = SiliconFlowClient::builder()
                    .api_key(api_key.to_string())
                    .base_url(&resolved_url)
                    .build()
                    .map_err(|e| e.to_string())?;
                let completion_model = client.completion_model(model_name);
                let request = completion_model.completion_request(prompt).build();
                let mut stream = completion_model.stream(request).await.map_err(|e| e.to_string())?;
                collect_stream_content(&mut stream).await
            }
            "glm" if use_streaming => {
                let client = GLMClient::builder()
                    .api_key(api_key.to_string())
                    .base_url(&resolved_url)
                    .build()
                    .map_err(|e| e.to_string())?;
                let completion_model = client.completion_model(model_name);
                let request = completion_model.completion_request(prompt).build();
                let mut stream = completion_model.stream(request).await.map_err(|e| e.to_string())?;
                collect_stream_content(&mut stream).await
            }
            "modelscope" if use_streaming => {
                let client = ModelScopeClient::builder()
                    .api_key(api_key.to_string())
                    .base_url(&resolved_url)
                    .build()
                    .map_err(|e| e.to_string())?;
                let completion_model = client.completion_model(model_name);
                let request = completion_model.completion_request(prompt).build();
                let mut stream = completion_model.stream(request).await.map_err(|e| e.to_string())?;
                collect_stream_content(&mut stream).await
            }
            "kimi" if use_streaming => {
                let client = KimiClient::builder()
                    .api_key(api_key.to_string())
                    .base_url(&resolved_url)
                    .build()
                    .map_err(|e| e.to_string())?;
                let completion_model = client.completion_model(model_name);
                let request = completion_model.completion_request(prompt).build();
                let mut stream = completion_model.stream(request).await.map_err(|e| e.to_string())?;
                collect_stream_content(&mut stream).await
            }
            "nvidia" if use_streaming => {
                let client = NvidiaNimClient::builder()
                    .api_key(api_key.to_string())
                    .base_url(&resolved_url)
                    .build()
                    .map_err(|e| e.to_string())?;
                let completion_model = client.completion_model(model_name);
                let request = completion_model.completion_request(prompt).build();
                let mut stream = completion_model.stream(request).await.map_err(|e| e.to_string())?;
                collect_stream_content(&mut stream).await
            }
            "minimax" if use_streaming => {
                let client = MinimaxClient::builder()
                    .api_key(api_key.to_string())
                    .base_url(&resolved_url)
                    .build()
                    .map_err(|e| e.to_string())?;
                let completion_model = client.completion_model(model_name);
                let request = completion_model.completion_request(prompt).build();
                let mut stream = completion_model.stream(request).await.map_err(|e| e.to_string())?;
                collect_stream_content(&mut stream).await
            }
            _ => Err(format!("Provider '{}' not supported", provider)),
        }
    }

    /// Complete with messages (non-streaming)
    async fn complete_messages(
        &self,
        messages: &[Value],
        provider: &str,
        api_key: &str,
        base_url: Option<&str>,
        model: Option<&str>,
    ) -> Result<String, String> {
        let resolved_url = resolve_base_url(provider, base_url);
        let model_name = get_model_name(provider, model);

        let use_streaming = matches!(
            provider,
            "siliconflow" | "glm" | "modelscope" | "kimi" | "nvidia" | "minimax"
        );

        // Convert messages to prompt format
        let prompt = messages
            .iter()
            .map(|m| {
                let role = m.get("role").and_then(|r| r.as_str()).unwrap_or("user");
                let content = m.get("content").and_then(|c| c.as_str()).unwrap_or("");
                format!("{}: {}", role, content)
            })
            .collect::<Vec<_>>()
            .join("\n");

        match provider {
            "gemini" => {
                let client = rig::providers::gemini::Client::builder()
                    .api_key(api_key.to_string())
                    .build()
                    .map_err(|e| e.to_string())?;
                let agent = client.agent(model_name).build();
                agent.prompt(&prompt).await.map_err(|e| e.to_string())
            }
            "openai" | "openai_compatibility" => {
                let builder = rig::providers::openai::CompletionsClient::<reqwest::Client>::builder()
                    .api_key(api_key.to_string())
                    .base_url(&resolved_url);
                let client = builder.build().map_err(|e| e.to_string())?;
                let agent = client.agent(model_name).build();
                agent.prompt(&prompt).await.map_err(|e| e.to_string())
            }
            "siliconflow" if use_streaming => {
                let client = SiliconFlowClient::builder()
                    .api_key(api_key.to_string())
                    .base_url(&resolved_url)
                    .build()
                    .map_err(|e| e.to_string())?;
                let completion_model = client.completion_model(model_name);
                let request = completion_model.completion_request(&prompt).build();
                let mut stream = completion_model.stream(request).await.map_err(|e| e.to_string())?;
                collect_stream_content(&mut stream).await
            }
            "glm" if use_streaming => {
                let client = GLMClient::builder()
                    .api_key(api_key.to_string())
                    .base_url(&resolved_url)
                    .build()
                    .map_err(|e| e.to_string())?;
                let completion_model = client.completion_model(model_name);
                let request = completion_model.completion_request(&prompt).build();
                let mut stream = completion_model.stream(request).await.map_err(|e| e.to_string())?;
                collect_stream_content(&mut stream).await
            }
            "modelscope" if use_streaming => {
                let client = ModelScopeClient::builder()
                    .api_key(api_key.to_string())
                    .base_url(&resolved_url)
                    .build()
                    .map_err(|e| e.to_string())?;
                let completion_model = client.completion_model(model_name);
                let request = completion_model.completion_request(&prompt).build();
                let mut stream = completion_model.stream(request).await.map_err(|e| e.to_string())?;
                collect_stream_content(&mut stream).await
            }
            "kimi" if use_streaming => {
                let client = KimiClient::builder()
                    .api_key(api_key.to_string())
                    .base_url(&resolved_url)
                    .build()
                    .map_err(|e| e.to_string())?;
                let completion_model = client.completion_model(model_name);
                let request = completion_model.completion_request(&prompt).build();
                let mut stream = completion_model.stream(request).await.map_err(|e| e.to_string())?;
                collect_stream_content(&mut stream).await
            }
            "nvidia" if use_streaming => {
                let client = NvidiaNimClient::builder()
                    .api_key(api_key.to_string())
                    .base_url(&resolved_url)
                    .build()
                    .map_err(|e| e.to_string())?;
                let completion_model = client.completion_model(model_name);
                let request = completion_model.completion_request(&prompt).build();
                let mut stream = completion_model.stream(request).await.map_err(|e| e.to_string())?;
                collect_stream_content(&mut stream).await
            }
            "minimax" if use_streaming => {
                let client = MinimaxClient::builder()
                    .api_key(api_key.to_string())
                    .base_url(&resolved_url)
                    .build()
                    .map_err(|e| e.to_string())?;
                let completion_model = client.completion_model(model_name);
                let request = completion_model.completion_request(&prompt).build();
                let mut stream = completion_model.stream(request).await.map_err(|e| e.to_string())?;
                collect_stream_content(&mut stream).await
            }
            _ => Err(format!("Provider '{}' not supported", provider)),
        }
    }

    /// Stream completion (true streaming)
    /// Returns a boxed stream that yields text chunks
    async fn stream_completion(
        &self,
        messages: &[Value],
        provider: &str,
        api_key: &str,
        base_url: Option<&str>,
        model: Option<&str>,
    ) -> Result<Box<dyn Stream<Item = Result<String, String>> + Unpin + Send>, String> {
        let resolved_url = resolve_base_url(provider, base_url);
        let model_name = get_model_name(provider, model);

        // Convert messages to prompt format
        let prompt = messages
            .iter()
            .map(|m| {
                let role = m.get("role").and_then(|r| r.as_str()).unwrap_or("user");
                let content = m.get("content").and_then(|c| c.as_str()).unwrap_or("");
                format!("{}: {}", role, content)
            })
            .collect::<Vec<_>>()
            .join("\n");

        // Helper to convert StreamedAssistantContent to String
        fn extract_text<R>(content: rig::streaming::StreamedAssistantContent<R>) -> String {
            match content {
                rig::streaming::StreamedAssistantContent::Text(text) => text.text,
                rig::streaming::StreamedAssistantContent::Reasoning(reasoning) => {
                    reasoning.reasoning.join("\n")
                }
                rig::streaming::StreamedAssistantContent::ReasoningDelta { reasoning, .. } => reasoning,
                _ => String::new(),
            }
        }

        // Helper to convert CompletionError to String
        fn map_err(e: rig::completion::CompletionError) -> String {
            e.to_string()
        }

        match provider {
            "gemini" => {
                let client = rig::providers::gemini::Client::builder()
                    .api_key(api_key.to_string())
                    .build()
                    .map_err(|e| e.to_string())?;
                let agent = client.agent(model_name).build();

                // Convert messages to prompt and history for stream_chat
                use rig::completion::Message;
                let (prompt, history): (Message, Vec<Message>) = if messages.len() <= 1 {
                    (Message::user(prompt), vec![])
                } else {
                    let (history_msgs, _) = messages.split_at(messages.len() - 1);
                    let history: Vec<Message> = history_msgs
                        .iter()
                        .filter_map(|m| {
                            let role = m.get("role")?.as_str()?;
                            let content = m.get("content")?.as_str()?;
                            match role {
                                "user" => Some(Message::user(content)),
                                "assistant" => Some(Message::assistant(content)),
                                _ => None,
                            }
                        })
                        .collect();
                    (Message::user(prompt), history)
                };

                let mut stream = agent.stream_chat(prompt, history).await;
                use async_stream::stream;
                let adapted = stream! {
                    while let Some(item) = stream.next().await {
                        match item {
                            Ok(MultiTurnStreamItem::StreamAssistantItem(content)) => {
                                let text = extract_text(content);
                                if !text.is_empty() {
                                    yield Ok(text);
                                }
                            }
                            Err(e) => {
                                yield Err(e.to_string());
                                break;
                            }
                            _ => {}
                        }
                    }
                };
                let boxed: Box<dyn Stream<Item = Result<String, String>> + Unpin + Send> =
                    Box::new(Box::pin(adapted));
                Ok(boxed)
            }
            "openai" | "openai_compatibility" => {
                let builder = rig::providers::openai::CompletionsClient::<reqwest::Client>::builder()
                    .api_key(api_key.to_string())
                    .base_url(&resolved_url);
                let client = builder.build().map_err(|e| e.to_string())?;
                let agent = client.agent(model_name).build();

                // Convert messages to prompt and history for stream_chat
                use rig::completion::Message;
                let (prompt, history): (Message, Vec<Message>) = if messages.len() <= 1 {
                    (Message::user(prompt), vec![])
                } else {
                    let (history_msgs, _) = messages.split_at(messages.len() - 1);
                    let history: Vec<Message> = history_msgs
                        .iter()
                        .filter_map(|m| {
                            let role = m.get("role")?.as_str()?;
                            let content = m.get("content")?.as_str()?;
                            match role {
                                "user" => Some(Message::user(content)),
                                "assistant" => Some(Message::assistant(content)),
                                _ => None,
                            }
                        })
                        .collect();
                    (Message::user(prompt), history)
                };

                let mut stream = agent.stream_chat(prompt, history).await;
                use async_stream::stream;
                let adapted = stream! {
                    while let Some(item) = stream.next().await {
                        match item {
                            Ok(MultiTurnStreamItem::StreamAssistantItem(content)) => {
                                let text = extract_text(content);
                                if !text.is_empty() {
                                    yield Ok(text);
                                }
                            }
                            Err(e) => {
                                yield Err(e.to_string());
                                break;
                            }
                            _ => {}
                        }
                    }
                };
                let boxed: Box<dyn Stream<Item = Result<String, String>> + Unpin + Send> =
                    Box::new(Box::pin(adapted));
                Ok(boxed)
            }
            "siliconflow" => {
                let client = SiliconFlowClient::builder()
                    .api_key(api_key.to_string())
                    .base_url(&resolved_url)
                    .build()
                    .map_err(|e| e.to_string())?;
                let completion_model = client.completion_model(model_name);
                let request = completion_model.completion_request(&prompt).build();
                let stream = completion_model.stream(request).await.map_err(|e| e.to_string())?;
                let boxed: Box<dyn Stream<Item = Result<String, String>> + Unpin + Send> =
                    Box::new(stream.map_ok(extract_text).map_err(map_err));
                Ok(boxed)
            }
            "glm" => {
                let client = GLMClient::builder()
                    .api_key(api_key.to_string())
                    .base_url(&resolved_url)
                    .build()
                    .map_err(|e| e.to_string())?;
                let completion_model = client.completion_model(model_name);
                let request = completion_model.completion_request(&prompt).build();
                let stream = completion_model.stream(request).await.map_err(|e| e.to_string())?;
                let boxed: Box<dyn Stream<Item = Result<String, String>> + Unpin + Send> =
                    Box::new(stream.map_ok(extract_text).map_err(map_err));
                Ok(boxed)
            }
            "modelscope" => {
                let client = ModelScopeClient::builder()
                    .api_key(api_key.to_string())
                    .base_url(&resolved_url)
                    .build()
                    .map_err(|e| e.to_string())?;
                let completion_model = client.completion_model(model_name);
                let request = completion_model.completion_request(&prompt).build();
                let stream = completion_model.stream(request).await.map_err(|e| e.to_string())?;
                let boxed: Box<dyn Stream<Item = Result<String, String>> + Unpin + Send> =
                    Box::new(stream.map_ok(extract_text).map_err(map_err));
                Ok(boxed)
            }
            "kimi" => {
                let client = KimiClient::builder()
                    .api_key(api_key.to_string())
                    .base_url(&resolved_url)
                    .build()
                    .map_err(|e| e.to_string())?;
                let completion_model = client.completion_model(model_name);
                let request = completion_model.completion_request(&prompt).build();
                let stream = completion_model.stream(request).await.map_err(|e| e.to_string())?;
                let boxed: Box<dyn Stream<Item = Result<String, String>> + Unpin + Send> =
                    Box::new(stream.map_ok(extract_text).map_err(map_err));
                Ok(boxed)
            }
            "nvidia" => {
                let client = NvidiaNimClient::builder()
                    .api_key(api_key.to_string())
                    .base_url(&resolved_url)
                    .build()
                    .map_err(|e| e.to_string())?;
                let completion_model = client.completion_model(model_name);
                let request = completion_model.completion_request(&prompt).build();
                let stream = completion_model.stream(request).await.map_err(|e| e.to_string())?;
                let boxed: Box<dyn Stream<Item = Result<String, String>> + Unpin + Send> =
                    Box::new(stream.map_ok(extract_text).map_err(map_err));
                Ok(boxed)
            }
            "minimax" => {
                let client = MinimaxClient::builder()
                    .api_key(api_key.to_string())
                    .base_url(&resolved_url)
                    .build()
                    .map_err(|e| e.to_string())?;
                let completion_model = client.completion_model(model_name);
                let request = completion_model.completion_request(&prompt).build();
                let stream = completion_model.stream(request).await.map_err(|e| e.to_string())?;
                let boxed: Box<dyn Stream<Item = Result<String, String>> + Unpin + Send> =
                    Box::new(stream.map_ok(extract_text).map_err(map_err));
                Ok(boxed)
            }
            _ => Err(format!("Provider '{}' not supported", provider)),
        }
    }
}

pub static DEEP_RESEARCH_SERVICE: once_cell::sync::Lazy<Arc<DeepResearchService>> =
    once_cell::sync::Lazy::new(|| Arc::new(DeepResearchService::new()));
