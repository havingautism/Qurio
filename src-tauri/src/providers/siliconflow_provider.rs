// SiliconFlow Custom Provider Module
//
// This module implements a custom provider for SiliconFlow (DeepSeek and other models)
// that properly handles `reasoning_content` fields in streaming responses.
//
// Based on Rig's official custom provider guide:
// https://docs.rig.rs/guides/extension/write_your_own_provider

use async_stream::stream;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;

use rig::completion::{CompletionError, CompletionRequest, GetTokenUsage};
use rig::streaming::{RawStreamingChoice, RawStreamingToolCall, StreamingCompletionResponse};
use rig::prelude::CompletionClient;

// ============================================================================
// Client and Model Structures
// ============================================================================

/// SiliconFlow Client
#[derive(Clone, Debug)]
pub struct SiliconFlowClient {
    pub api_key: String,
    pub base_url: String,
    pub http_client: reqwest::Client,
}

/// Builder for SiliconFlowClient
pub struct SiliconFlowClientBuilder {
    api_key: Option<String>,
    base_url: Option<String>,
}

impl SiliconFlowClient {
    pub fn builder() -> SiliconFlowClientBuilder {
        SiliconFlowClientBuilder {
            api_key: None,
            base_url: None,
        }
    }

    pub fn new(api_key: String, base_url: String) -> Self {
        Self {
            api_key,
            base_url,
            http_client: reqwest::Client::new(),
        }
    }

    pub fn agent(self, model: String) -> rig::agent::AgentBuilder<SiliconFlowCompletionModel> {
        rig::agent::AgentBuilder::new(SiliconFlowCompletionModel {
            client: self,
            model,
        })
    }
}

impl SiliconFlowClientBuilder {
    pub fn api_key(mut self, api_key: String) -> Self {
        self.api_key = Some(api_key);
        self
    }

    pub fn base_url(mut self, base_url: &str) -> Self {
        self.base_url = Some(base_url.to_string());
        self
    }

    pub fn build(self) -> Result<SiliconFlowClient, String> {
        let api_key = self.api_key.ok_or("API key is required")?;
        let base_url = self.base_url.unwrap_or_else(|| "https://api.siliconflow.cn/v1".to_string());

        Ok(SiliconFlowClient::new(api_key, base_url))
    }
}

// Implement CompletionClient trait for SiliconFlowClient
impl CompletionClient for SiliconFlowClient {
    type CompletionModel = SiliconFlowCompletionModel;

    fn completion_model(&self, model: impl Into<String>) -> Self::CompletionModel {
        SiliconFlowCompletionModel {
            client: self.clone(),
            model: model.into(),
        }
    }
}

/// SiliconFlow Completion Model
#[derive(Clone, Debug)]
pub struct SiliconFlowCompletionModel {
    client: SiliconFlowClient,
    model: String,
}

// ============================================================================
// Response Structures
// ============================================================================

/// State for accumulating tool calls during streaming
#[derive(Debug, Clone)]
struct SiliconFlowToolCallState {
    id: String,
    name: String,
    arguments: String,
}

/// SiliconFlow Streaming Delta - includes reasoning_content field (for DeepSeek models)
#[derive(Debug, Deserialize, Serialize)]
pub struct SiliconFlowStreamingDelta {
    #[serde(default)]
    pub content: Option<String>,

    #[serde(default, alias = "reasoning_content")]
    pub reasoning: Option<String>,  // ← DeepSeek uses "reasoning_content"

    #[serde(default)]
    pub tool_calls: Vec<SiliconFlowToolCall>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct SiliconFlowToolCall {
    pub id: Option<String>,
    pub r#type: Option<String>,
    pub function: SiliconFlowFunction,
    pub index: Option<usize>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct SiliconFlowFunction {
    pub name: Option<String>,
    pub arguments: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SiliconFlowStreamingChoice {
    pub delta: SiliconFlowStreamingDelta,
    pub finish_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SiliconFlowStreamingChunk {
    pub choices: Vec<SiliconFlowStreamingChoice>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SiliconFlowStreamingResponse {
    pub content: String,
}

// Implement GetTokenUsage trait
impl GetTokenUsage for SiliconFlowStreamingResponse {
    fn token_usage(&self) -> Option<rig::completion::Usage> {
        // TODO: Extract actual usage from SiliconFlow response
        None
    }
}

// ============================================================================
// CompletionModel Implementation
// ============================================================================

impl rig::completion::CompletionModel for SiliconFlowCompletionModel {
    type Response = SiliconFlowStreamingResponse;
    type StreamingResponse = SiliconFlowStreamingResponse;
    type Client = SiliconFlowClient;

    fn make(client: &Self::Client, model: impl Into<String>) -> Self {
        SiliconFlowCompletionModel {
            client: client.clone(),
            model: model.into(),
        }
    }

    async fn completion(
        &self,
        _request: CompletionRequest,
    ) -> Result<rig::completion::CompletionResponse<Self::Response>, CompletionError> {
        // For now, we'll focus on streaming. Non-streaming can be added later.
        Err(CompletionError::ProviderError(
            "Non-streaming not implemented for SiliconFlow custom provider yet".to_string(),
        ))
    }

    async fn stream(
        &self,
        request: CompletionRequest,
    ) -> Result<StreamingCompletionResponse<Self::StreamingResponse>, CompletionError> {
        stream_siliconflow_completion(&self.client, &self.model, request).await
    }
}


async fn stream_siliconflow_completion(
    client: &SiliconFlowClient,
    model: &str,
    request: CompletionRequest,
) -> Result<StreamingCompletionResponse<SiliconFlowStreamingResponse>, CompletionError> {
    // 1. Build request body
    let mut messages = Vec::new();

    // Add preamble as system message if present
    if let Some(preamble) = &request.preamble {
        messages.push(json!({
            "role": "system",
            "content": preamble
        }));
    }

    // Convert chat history to SiliconFlow format
    for msg in request.chat_history.iter() {
        messages.push(convert_message_to_siliconflow(msg)?);
    }

    let mut request_body = json!({
        "model": model,
        "messages": messages,
        "stream": true,
    });

    // Add tools if present
    if !request.tools.is_empty() {
        let tools_array: Vec<Value> = request
            .tools
            .iter()
            .map(|tool| {
                json!({
                    "type": "function",
                    "function": {
                        "name": tool.name,
                        "description": tool.description,
                        "parameters": tool.parameters
                    }
                })
            })
            .collect();
        request_body["tools"] = json!(tools_array);
    }

    // Add tool_choice if present
    if let Some(ref tool_choice) = request.tool_choice {
        request_body["tool_choice"] = serde_json::to_value(tool_choice)
            .unwrap_or(json!("auto"));
    }

    // Add additional parameters
    if let Some(temp) = request.temperature {
        request_body["temperature"] = json!(temp);
    }
    if let Some(max_tokens) = request.max_tokens {
        request_body["max_tokens"] = json!(max_tokens);
    }

    // Handle SiliconFlow/DeepSeek-specific thinking mode
    if let Some(additional) = &request.additional_params {
        // Check for thinking parameter and enable thinking mode for DeepSeek
        if let Some(thinking) = additional.get("thinking") {
            if let Some(thinking_obj) = thinking.as_object() {
                // Get thinking budget (default 1024)
                let default_budget = json!(1024);
                let budget = thinking_obj.get("budget_tokens")
                    .or(thinking_obj.get("budgetTokens"))
                    .unwrap_or(&default_budget);

                // Enable thinking mode
                request_body["extra_body"] = json!({
                    "thinking_budget": budget,
                    "enable_thinking": true
                });
                request_body["enable_thinking"] = json!(true);
                request_body["thinking_budget"] = budget.clone();
            }
        }

        // Merge other additional params
        if let Value::Object(map) = additional {
            for (key, value) in map.iter() {
                if key != "thinking" {
                    request_body[key] = value.clone();
                }
            }
        }
    }

    // 2. Send HTTP request and get SSE stream
    let url = format!("{}/chat/completions", client.base_url);

    // Debug: Print request info
    eprintln!("[SILICONFLOW DEBUG] Request URL: {}", url);
    eprintln!("[SILICONFLOW DEBUG] Model: {}", model);

    let response = client
        .http_client
        .post(&url)
        .header("Authorization", format!("Bearer {}", client.api_key))
        .header("Content-Type", "application/json")
        .json(&request_body)
        .send()
        .await
        .map_err(|e| CompletionError::ProviderError(e.to_string()))?;

    // Debug: Print response status
    eprintln!("[SILICONFLOW DEBUG] Response status: {}", response.status());

    // 3. Process SSE stream
    let byte_stream = response.bytes_stream();

    let stream = stream! {
        let mut lines_buffer = String::new();
        let mut stream = byte_stream;

        // Accumulate tool calls by index while streaming
        let mut tool_calls: HashMap<usize, SiliconFlowToolCallState> = HashMap::new();

        while let Some(chunk_result) = futures::StreamExt::next(&mut stream).await {
            match chunk_result {
                Ok(chunk) => {
                    // Convert bytes to string
                    let text = String::from_utf8_lossy(&chunk);
                    lines_buffer.push_str(&text);

                    // Process complete lines
                    while let Some(line_end) = lines_buffer.find('\n') {
                        let line = lines_buffer[..line_end].trim().to_string();
                        lines_buffer = lines_buffer[line_end + 1..].to_string();

                        // Skip empty lines
                        if line.is_empty() {
                            continue;
                        }

                        // Parse SSE data line
                        if let Some(data) = line.strip_prefix("data: ") {
                            if data == "[DONE]" {
                                break;
                            }

                            // Debug: Print raw data
                            eprintln!("[SILICONFLOW DEBUG] Raw chunk: {}", data);

                            // Parse JSON chunk
                            match serde_json::from_str::<SiliconFlowStreamingChunk>(data) {
                                Ok(sf_chunk) => {
                                    if let Some(choice) = sf_chunk.choices.first() {
                                        let delta = &choice.delta;
                                        let finish_reason = &choice.finish_reason;

                                        // Debug: Print delta structure
                                        eprintln!("[SILICONFLOW DEBUG] Delta - content: {:?}, reasoning: {:?}, tool_calls: {:?}",
                                            delta.content, delta.reasoning, delta.tool_calls.len());

                                        // Handle reasoning_content - KEY FEATURE for DeepSeek models!
                                        if let Some(ref reasoning) = delta.reasoning {
                                            if !reasoning.is_empty() {
                                                yield Ok(RawStreamingChoice::ReasoningDelta {
                                                    id: None,
                                                    reasoning: reasoning.clone(),
                                                });
                                            }
                                        }

                                        // Handle regular content
                                        if let Some(content) = &delta.content {
                                            if !content.is_empty() {
                                                yield Ok(RawStreamingChoice::Message(content.clone()));
                                            }
                                        }

                                        // Handle tool calls - streaming format
                                        if !delta.tool_calls.is_empty() {
                                            eprintln!("[SILICONFLOW DEBUG] Processing {} tool calls", delta.tool_calls.len());
                                            for tool_call in &delta.tool_calls {
                                                let index = tool_call.index.unwrap_or(0);

                                                // Get or create tool call entry
                                                let existing_tool_call = tool_calls.entry(index).or_insert_with(|| SiliconFlowToolCallState {
                                                    id: String::new(),
                                                    name: String::new(),
                                                    arguments: String::new(),
                                                });

                                                // Update ID if present
                                                if let Some(ref id) = tool_call.id {
                                                    if !id.is_empty() {
                                                        existing_tool_call.id = id.clone();
                                                    }
                                                }

                                                // Handle function name delta
                                                if let Some(ref name) = tool_call.function.name {
                                                    if !name.is_empty() {
                                                        existing_tool_call.name = name.clone();
                                                        eprintln!("[SILICONFLOW DEBUG] Yielding ToolCallDelta::Name: {}", name);
                                                        yield Ok(RawStreamingChoice::ToolCallDelta {
                                                            id: existing_tool_call.id.clone(),
                                                            content: rig::streaming::ToolCallDeltaContent::Name(name.clone()),
                                                        });
                                                    }
                                                }

                                                // Handle function arguments delta
                                                if let Some(ref args) = tool_call.function.arguments {
                                                    if !args.is_empty() {
                                                        existing_tool_call.arguments.push_str(args);
                                                        eprintln!("[SILICONFLOW DEBUG] Yielding ToolCallDelta::Delta: {}", args);
                                                        yield Ok(RawStreamingChoice::ToolCallDelta {
                                                            id: existing_tool_call.id.clone(),
                                                            content: rig::streaming::ToolCallDeltaContent::Delta(args.clone()),
                                                        });
                                                    }
                                                }
                                            }
                                        }

                                        // When finish_reason is "tool_calls", emit the final ToolCall
                                        if finish_reason.as_ref().map(|s| s == "tool_calls").unwrap_or(false) {
                                            eprintln!("[SILICONFLOW DEBUG] Finish reason is tool_calls, emitting {} accumulated tool calls", tool_calls.len());
                                            for (_, tool_call_state) in tool_calls.into_iter() {
                                                if !tool_call_state.name.is_empty() {
                                                    eprintln!("[SILICONFLOW DEBUG] Yielding ToolCall: id={}, name={}, args={}",
                                                        tool_call_state.id, tool_call_state.name, tool_call_state.arguments);
                                                    yield Ok(RawStreamingChoice::ToolCall(
                                                        RawStreamingToolCall::new(
                                                            tool_call_state.id,
                                                            tool_call_state.name,
                                                            serde_json::to_value(&tool_call_state.arguments).unwrap_or(serde_json::Value::Null),
                                                        )
                                                    ));
                                                }
                                            }
                                            tool_calls = HashMap::new();
                                        }
                                    }
                                }
                                Err(e) => {
                                    eprintln!("[SILICONFLOW] Failed to parse chunk: {} - Data: {}", e, data);
                                }
                            }
                        }
                    }
                }
                Err(e) => {
                    eprintln!("[SILICONFLOW] Stream error: {:?}", e);
                    yield Err(CompletionError::ProviderError(format!("Stream error: {}", e)));
                    break;
                }
            }
        }

        // Flush any remaining tool calls that weren't emitted
        for (_, tool_call_state) in tool_calls.into_iter() {
            if !tool_call_state.name.is_empty() {
                yield Ok(RawStreamingChoice::ToolCall(
                    RawStreamingToolCall::new(
                        tool_call_state.id,
                        tool_call_state.name,
                        serde_json::to_value(&tool_call_state.arguments).unwrap_or(serde_json::Value::Null),
                    )
                ));
            }
        }

        // Final response
        yield Ok(RawStreamingChoice::FinalResponse(SiliconFlowStreamingResponse {
            content: String::new(),
        }));
    };

    Ok(StreamingCompletionResponse::stream(Box::pin(stream)))
}

// Helper function to convert rig messages to SiliconFlow format
fn convert_message_to_siliconflow(msg: &rig::completion::Message) -> Result<Value, CompletionError> {
    // Simplified conversion - expand as needed
    Ok(json!({
        "role": "user", // TODO: Properly map roles
        "content": format!("{:?}", msg) // TODO: Properly extract content
    }))
}
