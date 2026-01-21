//! Research Plan Service - Generates research plans using AI providers
//! Supports all custom providers (non-streaming mode)

use futures::StreamExt;
use rig::completion::{CompletionModel, Prompt};
use rig::prelude::CompletionClient;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::Arc;

// Import custom providers
use crate::providers::glm_provider::GLMClient;
use crate::providers::kimi_provider::KimiClient;
use crate::providers::minimax_provider::MinimaxClient;
use crate::providers::modelscope_provider::ModelScopeClient;
use crate::providers::nvidia_provider::NvidiaNimClient;
use crate::providers::siliconflow_provider::SiliconFlowClient;
use crate::providers::{get_base_url, get_default_model};

// ============================================================================
// Request/Response Types
// ============================================================================

/// Research plan request
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchPlanRequest {
    pub provider: String,
    pub message: String,
    pub api_key: String,
    pub base_url: Option<String>,
    pub model: Option<String>,
    pub research_type: Option<String>,
}

/// Research plan response
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchPlanResponse {
    pub plan: String,
}

// ============================================================================
// Prompts
// ============================================================================

pub const RESEARCH_PLAN_PROMPT_GENERAL: &str = r#"You are a task planner. Produce a detailed, execution-ready research plan in structured JSON.

## Input
User message contains:
- "question": research question
- "scope": research scope, or "Auto"
- "output": output format preference, or "Auto"

## Planning Rules
1. Detect question type:
   - Definition: 2-3 steps, define → characteristics → applications
   - Comparison: 3-4 steps, differences → scenarios → trade-offs → decision
   - How-it-works: 4-5 steps, overview → deep dive → examples → edge cases
   - How-to: 4-6 steps, prerequisites → process → alternatives → pitfalls
   - Analysis: 5-7 steps, context → factors → evidence → implications → recommendations
   - History: 3-5 steps, timeline → milestones → causes → effects
2. Hybrid questions: assign 70-80% steps to primary type, 20-30% to secondary
3. Step count must match complexity:
   - simple: 2-3 steps
   - medium: 4-5 steps (default)
   - complex: 6-8 steps
4. If scope/output is "Auto", choose formats:
   - Definition: paragraph
   - Comparison: table + bullet_list
   - How-it-works: paragraph + code_example
   - How-to: numbered_list + checklist
   - Analysis: mix formats
   - History: paragraph or timeline
5. Depth:
   - low: 1-2 paragraphs (~100-200 words)
   - medium: 3-4 paragraphs (~300-500 words)
   - high: 5+ paragraphs (~600+ words)
6. Step 1 must list assumptions if needed; all steps use these assumptions
7. Steps must be sequential, each with a clear, unique purpose, and executable using previous outputs
8. For each step, determine if search is needed:
   - Add "requires_search": true if the step needs up-to-date data, benchmarks, or external verification
   - Add "requires_search": false if the step relies on stable knowledge, definitions, or established concepts
   - Examples:
     * "Define HTTP" → requires_search: false (stable concept)
     * "Compare latest AI framework benchmarks" → requires_search: true (current data needed)
     * "Explain React component lifecycle" → requires_search: false (stable knowledge)
     * "List current React job market trends" → requires_search: true (time-sensitive)

## Deliverable Formats
paragraph, bullet_list, numbered_list, table, checklist, code_example, pros_and_cons

## Output Format
Return a valid JSON object with this structure:
```json
{
  "research_type": "general",
  "goal": "One-sentence research goal",
  "complexity": "simple|medium|complex",
  "question_type": "definition|comparison|how_it_works|how_to|analysis|history",
  "assumptions": ["string"],
  "plan": [
    {
      "step": 1,
      "thought": "short reasoning explaining purpose of this step",
      "action": "specific, executable action",
      "expected_output": "what this step produces, with format and detail",
      "deliverable_format": "paragraph|bullet_list|numbered_list|table|checklist|code_example|pros_and_cons",
      "acceptance_criteria": ["must include X", "must cover Y"],
      "depth": "low|medium|high",
      "requires_search": true|false
    }
  ],
  "risks": ["potential issues to avoid"],
  "success_criteria": ["how to tell if research succeeded"]
}
```"#;

pub const RESEARCH_PLAN_PROMPT_ACADEMIC: &str = r#"You are an academic research planner. Produce a detailed, rigorous research plan in structured JSON for scholarly literature review and analysis.

## Input
User message contains:
- "question": academic research question or topic
- "scope": research scope (time period, geographic region, specific databases, etc.), or "Auto"
- "output": output format preference, or "Auto"

## Academic Research Question Types
Classify the question into one of these academic research types:

1. **literature_review** (4-6 steps)
   - Systematic review of existing scholarly literature on a topic
   - Steps: Define scope → Search literature → Screen sources → Extract data → Synthesize findings → Identify gaps

2. **methodology_analysis** (5-7 steps)
   - Critical analysis of research methods used in a field
   - Steps: Identify methods → Compare approaches → Evaluate strengths/limitations → Recommend best practices

3. **empirical_study_review** (6-8 steps)
   - Review of empirical research evidence
   - Steps: Define criteria → Search studies → Quality assessment → Data extraction → Meta-analysis → Interpret findings

4. **theoretical_framework** (4-6 steps)
   - Analysis of theoretical foundations and conceptual frameworks
   - Steps: Identify theories → Trace development → Compare frameworks → Synthesize → Propose applications

5. **state_of_the_art** (5-7 steps)
   - Survey of current research frontiers and recent developments
   - Steps: Define recent timeframe → Search latest publications → Categorize trends → Identify innovations → Project future directions

## Academic Planning Rules

1. **Mandatory Literature Search**
   - ALL academic research plans MUST include at least one literature search step
   - First step should typically be "Define scope and search strategy"
   - Set requires_search: true for literature gathering steps

2. **Evidence Quality Emphasis**
   - Steps must emphasize peer-reviewed sources
   - Include quality assessment criteria (study design, sample size, methodology)
   - Note the need to distinguish between primary research and reviews

3. **Critical Analysis Requirements**
   - Each step should involve critical evaluation, not just summarization
   - Include acceptance criteria for methodological rigor
   - Require noting limitations and conflicting findings

4. **Systematic Approach**
   - Steps must be sequential and build on previous findings
   - Include clear inclusion/exclusion criteria where relevant
   - Specify analysis methods (e.g., thematic analysis, meta-synthesis)

5. **Research Gap Identification**
   - Final steps should identify what is NOT known
   - Note areas needing further investigation
   - Suggest implications for future research

6. **Citation and Source Tracking**
   - All steps must emphasize proper citation
   - Require tracking of source types (journals, conferences, preprints)
   - Note publication years to assess currency of evidence

7. **Default Search Requirement**
   - Unless explicitly dealing with well-established theory, set requires_search to true
   - Academic research prioritizes evidence over assumptions

## Step Count Guidelines
- literature_review: 4-6 steps
- methodology_analysis: 5-7 steps
- empirical_study_review: 6-8 steps
- theoretical_framework: 4-6 steps
- state_of_the_art: 5-7 steps

## Deliverable Formats for Academic Research
paragraph, bullet_list, numbered_list, table, annotated_bibliography, comparative_analysis, thematic_synthesis

## Output Format
Return a valid JSON object with this structure:
```json
{
  "research_type": "academic",
  "goal": "string - formal academic research objective",
  "complexity": "simple|medium|complex",
  "question_type": "literature_review|methodology_analysis|empirical_study_review|theoretical_framework|state_of_the_art",
  "assumptions": ["string - research scope assumptions, exclusions, focus areas"],
  "plan": [
    {
      "step": 1,
      "thought": "research rationale for this step",
      "action": "specific, executable academic research action",
      "expected_output": "scholarly deliverable with format and rigor specified",
      "deliverable_format": "paragraph|bullet_list|table|annotated_bibliography|comparative_analysis|thematic_synthesis",
      "acceptance_criteria": ["methodological requirement", "quality threshold", "coverage expectation"],
      "depth": "low|medium|high",
      "requires_search": true|false
    }
  ],
  "risks": ["potential methodological issues", "evidence limitations", "generalizability concerns"],
  "success_criteria": ["scholarly standard for completion", "quality benchmark"]
}
```"#;

// ============================================================================
// Helper Functions
// ============================================================================

/// Resolve base URL for a provider
fn resolve_base_url(provider: &str, custom_url: Option<&str>) -> String {
    match provider {
        "siliconflow" => "https://api.siliconflow.cn/v1".to_string(),
        "glm" => "https://open.bigmodel.cn/api/paas/v4".to_string(),
        "modelscope" => "https://api-inference.modelscope.cn/v1".to_string(),
        "kimi" => "https://api.moonshot.cn/v1".to_string(),
        "nvidia" => "https://integrate.api.nvidia.com/v1".to_string(),
        "minimax" => "https://api.minimax.io/v1".to_string(),
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

/// Collect streaming content into a string
async fn collect_stream_content<R>(stream: &mut rig::streaming::StreamingCompletionResponse<R>) -> Result<String, String>
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
            _ => {}
        }
    }
    Ok(content)
}

// ============================================================================
// Research Plan Service
// ============================================================================

#[derive(Clone)]
pub struct ResearchPlanService;

impl ResearchPlanService {
    pub fn new() -> Self {
        Self
    }

    /// Generate research plan (non-streaming)
    /// Uses streaming mode internally for providers that don't support non-streaming
    pub async fn generate(&self, request: &ResearchPlanRequest) -> Result<String, String> {
        let provider = request.provider.trim();
        let api_key = &request.api_key;
        let base_url = request.base_url.as_deref();
        let model = request.model.as_deref();
        let is_academic = request.research_type.as_deref() == Some("academic");

        let system_prompt = if is_academic {
            RESEARCH_PLAN_PROMPT_ACADEMIC
        } else {
            RESEARCH_PLAN_PROMPT_GENERAL
        };

        let prompt_text = format!("{}\n\nUser message: {}", system_prompt, request.message);
        let model_name = get_model_name(provider, model);
        let resolved_url = resolve_base_url(provider, base_url);

        let response_text = match provider {
            // Built-in providers
            "gemini" => {
                let client = rig::providers::gemini::Client::builder()
                    .api_key(api_key.to_string())
                    .build()
                    .map_err(|e| e.to_string())?;
                let agent = client.agent(model_name).build();
                agent.prompt(&prompt_text).await.map_err(|e| e.to_string())?
            }
            "openai" | "openai_compatibility" => {
                let builder = rig::providers::openai::CompletionsClient::<reqwest::Client>::builder()
                    .api_key(api_key.to_string())
                    .base_url(&resolved_url);
                let client = builder.build().map_err(|e| e.to_string())?;
                let mut agent_builder = client.agent(model_name);
                agent_builder = agent_builder.additional_params(serde_json::json!({
                    "response_format": { "type": "json_object" }
                }));
                let agent = agent_builder.build();
                agent.prompt(&prompt_text).await.map_err(|e| e.to_string())?
            }
            // Custom providers (use streaming internally)
            "siliconflow" => {
                let client = SiliconFlowClient::builder()
                    .api_key(api_key.to_string())
                    .base_url(&resolved_url)
                    .build()
                    .map_err(|e| e.to_string())?;
                let completion_model = client.completion_model(model_name);
                let request = completion_model.completion_request(&prompt_text)
                    .additional_params(serde_json::json!({
                        "response_format": { "type": "json_object" }
                    }))
                    .build();
                let mut stream = completion_model.stream(request).await.map_err(|e| e.to_string())?;
                collect_stream_content(&mut stream).await?
            }
            "glm" => {
                let client = GLMClient::builder()
                    .api_key(api_key.to_string())
                    .base_url(&resolved_url)
                    .build()
                    .map_err(|e| e.to_string())?;
                let completion_model = client.completion_model(model_name);
                let request = completion_model.completion_request(&prompt_text)
                    .additional_params(serde_json::json!({
                        "response_format": { "type": "json_object" }
                    }))
                    .build();
                let mut stream = completion_model.stream(request).await.map_err(|e| e.to_string())?;
                collect_stream_content(&mut stream).await?
            }
            "modelscope" => {
                let client = ModelScopeClient::builder()
                    .api_key(api_key.to_string())
                    .base_url(&resolved_url)
                    .build()
                    .map_err(|e| e.to_string())?;
                let completion_model = client.completion_model(model_name);
                let request = completion_model.completion_request(&prompt_text)
                    .additional_params(serde_json::json!({
                        "response_format": { "type": "json_object" }
                    }))
                    .build();
                let mut stream = completion_model.stream(request).await.map_err(|e| e.to_string())?;
                collect_stream_content(&mut stream).await?
            }
            "kimi" => {
                let client = KimiClient::builder()
                    .api_key(api_key.to_string())
                    .base_url(&resolved_url)
                    .build()
                    .map_err(|e| e.to_string())?;
                let completion_model = client.completion_model(model_name);
                let request = completion_model.completion_request(&prompt_text)
                    .additional_params(serde_json::json!({
                        "response_format": { "type": "json_object" }
                    }))
                    .build();
                let mut stream = completion_model.stream(request).await.map_err(|e| e.to_string())?;
                collect_stream_content(&mut stream).await?
            }
            "nvidia" => {
                let client = NvidiaNimClient::builder()
                    .api_key(api_key.to_string())
                    .base_url(&resolved_url)
                    .build()
                    .map_err(|e| e.to_string())?;
                let completion_model = client.completion_model(model_name);
                let request = completion_model.completion_request(&prompt_text)
                    .additional_params(serde_json::json!({
                        "response_format": { "type": "json_object" }
                    }))
                    .build();
                let mut stream = completion_model.stream(request).await.map_err(|e| e.to_string())?;
                collect_stream_content(&mut stream).await?
            }
            "minimax" => {
                let client = MinimaxClient::builder()
                    .api_key(api_key.to_string())
                    .base_url(&resolved_url)
                    .build()
                    .map_err(|e| e.to_string())?;
                let completion_model = client.completion_model(model_name);
                let request = completion_model.completion_request(&prompt_text)
                    .additional_params(serde_json::json!({
                        "response_format": { "type": "json_object" }
                    }))
                    .build();
                let mut stream = completion_model.stream(request).await.map_err(|e| e.to_string())?;
                collect_stream_content(&mut stream).await?
            }
            _ => {
                return Err(format!("Provider '{}' not supported", provider));
            }
        };

        // Parse JSON and format
        let parsed: Value = serde_json::from_str(&response_text)
            .or_else(|_| {
                if let Some(start) = response_text.find('{') {
                    if let Some(end) = response_text.rfind('}') {
                        return serde_json::from_str(&response_text[start..=end]);
                    }
                }
                Ok(json!({}))
            })
            .unwrap_or_else(|_| json!({}));

        let plan = if parsed.is_object() {
            serde_json::to_string_pretty(&parsed).unwrap_or_else(|_| response_text.trim().to_string())
        } else {
            response_text.trim().to_string()
        };

        Ok(plan)
    }
}

pub static RESEARCH_PLAN_SERVICE: once_cell::sync::Lazy<Arc<ResearchPlanService>> =
    once_cell::sync::Lazy::new(|| Arc::new(ResearchPlanService::new()));
