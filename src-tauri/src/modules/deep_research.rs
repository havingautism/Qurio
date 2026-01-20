//! Deep Research Service - Multi-step research with plan execution and streaming
//! Orchestrates research workflows and streams results via SSE

use futures::Stream;
use rig::completion::Prompt;
use rig::prelude::CompletionClient;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use tracing::info;

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

/// Research plan step
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchStep {
    pub step: u32,
    pub action: String,
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

/// Research plan metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchPlanMeta {
    pub goal: String,
    #[serde(default)]
    pub question_type: String,
    #[serde(default)]
    pub assumptions: Vec<String>,
    #[serde(default)]
    pub plan: Vec<ResearchStep>,
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

/// SSE Event types for deep research streaming
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum DeepResearchEvent {
    ResearchStep {
        step: u32,
        total: u32,
        title: String,
        status: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        duration_ms: Option<u64>,
        #[serde(skip_serializing_if = "Option::is_none")]
        error: Option<String>,
    },
    Text {
        content: String,
    },
    Done {
        content: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        sources: Option<Vec<ResearchSource>>,
    },
    Error {
        error: String,
    },
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

    async fn get_sources(&self) -> Vec<ResearchSource> {
        self.sources.lock().await.values().cloned().collect()
    }

    async fn add_finding(&self, finding: String) {
        self.findings.lock().await.push(finding);
    }

    async fn get_findings(&self) -> Vec<String> {
        self.findings.lock().await.clone()
    }

    fn generate_default_plan(question: &str) -> ResearchPlanMeta {
        ResearchPlanMeta {
            goal: question.to_string(),
            question_type: "analysis".to_string(),
            assumptions: vec!["Reader wants comprehensive information".to_string()],
            plan: vec![
                ResearchStep {
                    step: 1,
                    action: "Research and gather key information".to_string(),
                    expected_output: "Summary of key findings".to_string(),
                    deliverable_format: "paragraph".to_string(),
                    depth: "medium".to_string(),
                    requires_search: true,
                    acceptance_criteria: vec!["Cover main topics".to_string()],
                },
                ResearchStep {
                    step: 2,
                    action: "Analyze and synthesize findings".to_string(),
                    expected_output: "Detailed analysis".to_string(),
                    deliverable_format: "paragraph".to_string(),
                    depth: "medium".to_string(),
                    requires_search: false,
                    acceptance_criteria: vec!["Connect related concepts".to_string()],
                },
                ResearchStep {
                    step: 3,
                    action: "Summarize conclusions and recommendations".to_string(),
                    expected_output: "Final summary".to_string(),
                    deliverable_format: "bullet_list".to_string(),
                    depth: "low".to_string(),
                    requires_search: false,
                    acceptance_criteria: vec!["Actionable insights".to_string()],
                },
            ],
        }
    }

    pub async fn execute_stream(
        &self,
        request: DeepResearchRequest,
    ) -> impl Stream<Item = Result<axum::response::sse::Event, std::convert::Infallible>> {
        let service = self.clone();
        let _ = service.reset_state().await;

        let provider = request.provider.clone();
        let api_key = request.api_key.clone();
        let base_url = request.base_url.clone();
        let model = request.model.clone();
        let question = request.question.clone().unwrap_or_default();
        let research_type = request.research_type.unwrap_or_else(|| "general".to_string());
        let plan_str = request.plan.clone();

        async_stream::stream! {
            yield Ok(axum::response::sse::Event::default()
                .event("comment")
                .data("ok"));

            let plan_meta = if let Some(plan_text) = plan_str {
                serde_json::from_str::<ResearchPlanMeta>(&plan_text)
                    .unwrap_or_else(|_| DeepResearchService::generate_default_plan(&question))
            } else {
                DeepResearchService::generate_default_plan(&question)
            };

            let steps = plan_meta.plan.clone();
            let total_steps = steps.len() as u32;

            info!("[DeepResearch] Starting research with {} steps", total_steps);

            let findings = service.get_findings().await;

            for (i, step) in steps.iter().enumerate() {
                yield Ok(axum::response::sse::Event::default()
                    .event("message")
                    .data(&serde_json::to_string(&DeepResearchEvent::ResearchStep {
                        step: (i + 1) as u32,
                        total: total_steps,
                        title: step.action.clone(),
                        status: "running".to_string(),
                        duration_ms: None,
                        error: None,
                    }).unwrap()));

                let step_start = std::time::Instant::now();

                let step_result = service.execute_step(
                    &step, i as u32, total_steps, &question,
                    &findings, &provider, &api_key, base_url.as_deref(), model.as_deref(),
                ).await;

                match step_result {
                    Ok(content) => {
                        service.add_finding(content.clone()).await;

                        yield Ok(axum::response::sse::Event::default()
                            .event("message")
                            .data(&serde_json::to_string(&DeepResearchEvent::ResearchStep {
                                step: (i + 1) as u32,
                                total: total_steps,
                                title: step.action.clone(),
                                status: "done".to_string(),
                                duration_ms: Some(step_start.elapsed().as_millis() as u64),
                                error: None,
                            }).unwrap()));
                    }
                    Err(e) => {
                        yield Ok(axum::response::sse::Event::default()
                            .event("message")
                            .data(&serde_json::to_string(&DeepResearchEvent::ResearchStep {
                                step: (i + 1) as u32,
                                total: total_steps,
                                title: step.action.clone(),
                                status: "error".to_string(),
                                duration_ms: Some(step_start.elapsed().as_millis() as u64),
                                error: Some(e),
                            }).unwrap()));
                    }
                }
            }

            let final_findings = service.get_findings().await;
            let final_sources = service.get_sources().await;

            let findings_text = if final_findings.is_empty() {
                "No findings yet.".to_string()
            } else {
                final_findings.iter().map(|f| format!("- {}", f)).collect::<Vec<_>>().join("\n")
            };

            let sources_text = if final_sources.is_empty() {
                "No sources available.".to_string()
            } else {
                final_sources.iter()
                    .enumerate()
                    .map(|(i, s)| format!("[{}] {} {}", i + 1, s.title, s.url))
                    .collect::<Vec<_>>()
                    .join("\n")
            };

            let is_academic = research_type == "academic";

            let prompt = if is_academic {
                format!(
                    r#"You are writing an academic research report based on a systematic literature review.

Question: {}
Goal: {}

Findings to synthesize:
{}

Sources (cite as [index]):
{}

Write a comprehensive academic report with proper structure.
"#,
                    question, plan_meta.goal, findings_text, sources_text
                )
            } else {
                format!(
                    r#"You are a deep research writer producing a final report.

Question: {}
Goal: {}

Findings to synthesize:
{}

Sources (cite as [index]):
{}

Write a comprehensive report with evidence-backed claims.
"#,
                    question, plan_meta.goal, findings_text, sources_text
                )
            };

            // Generate final report using completion (simplified - streaming would require more complex type handling)
            match service.complete(&prompt, &provider, &api_key, base_url.as_deref(), model.as_deref()).await {
                Ok(content) => {
                    // Stream the content in chunks for SSE
                    let chunk_size = 100;
                    let chars: Vec<char> = content.chars().collect();
                    for chunk in chars.chunks(chunk_size) {
                        let chunk_text: String = chunk.iter().collect();
                        yield Ok(axum::response::sse::Event::default()
                            .event("message")
                            .data(&serde_json::to_string(&DeepResearchEvent::Text {
                                content: chunk_text,
                            }).unwrap()));
                    }

                    let sources_json = if final_sources.is_empty() {
                        None
                    } else {
                        Some(final_sources)
                    };

                    yield Ok(axum::response::sse::Event::default()
                        .event("message")
                        .data(&serde_json::to_string(&DeepResearchEvent::Done {
                            content: content.clone(),
                            sources: sources_json,
                        }).unwrap()));
                }
                Err(e) => {
                    yield Ok(axum::response::sse::Event::default()
                        .event("message")
                        .data(&serde_json::to_string(&DeepResearchEvent::Error { error: e }).unwrap()));
                }
            }
        }
    }

    async fn execute_step(
        &self,
        step: &ResearchStep,
        step_index: u32,
        total_steps: u32,
        question: &str,
        findings: &[String],
        provider: &str,
        api_key: &str,
        base_url: Option<&str>,
        model: Option<&str>,
    ) -> Result<String, String> {
        let prior_findings = if findings.is_empty() {
            "None".to_string()
        } else {
            findings.iter().map(|f| format!("- {}", f)).collect::<Vec<_>>().join("\n")
        };

        let prompt = format!(
            r#"You are executing research step {}/{}.

Step: {}
Expected output: {}

Prior findings:
{}

Write a concise response (2-3 paragraphs).
"#,
            step_index + 1, total_steps, step.action, step.expected_output, prior_findings,
        );

        self.complete(&prompt, provider, api_key, base_url, model).await
    }

    async fn complete(
        &self,
        prompt: &str,
        provider: &str,
        api_key: &str,
        base_url: Option<&str>,
        model: Option<&str>,
    ) -> Result<String, String> {
        match provider {
            "gemini" => {
                let client = rig::providers::gemini::Client::builder()
                    .api_key(api_key.to_string())
                    .build()
                    .map_err(|e| e.to_string())?;
                let model_name = model.unwrap_or("gemini-1.5-flash");
                let agent = client.agent(model_name.to_string()).build();
                agent.prompt(prompt).await.map_err(|e| e.to_string())
            }
            "openai" | "openai_compatibility" => {
                let mut builder = rig::providers::openai::CompletionsClient::<reqwest::Client>::builder()
                    .api_key(api_key.to_string());
                if let Some(url) = base_url {
                    builder = builder.base_url(url);
                }
                let client = builder.build().map_err(|e| e.to_string())?;
                let model_name = model.unwrap_or("gpt-4o-mini");
                let agent = client.agent(model_name.to_string()).build();
                agent.prompt(prompt).await.map_err(|e| e.to_string())
            }
            _ => Err(format!("Provider '{}' not supported", provider)),
        }
    }
}

pub static DEEP_RESEARCH_SERVICE: once_cell::sync::Lazy<Arc<DeepResearchService>> =
    once_cell::sync::Lazy::new(|| Arc::new(DeepResearchService::new()));
