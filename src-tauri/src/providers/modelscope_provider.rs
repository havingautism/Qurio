// ModelScope Custom Provider Module
//
// This module implements a custom provider for ModelScope (GLM-based models)
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

/// ModelScope Client
#[derive(Clone, Debug)]
pub struct ModelScopeClient {
    pub api_key: String,
    pub base_url: String,
    pub http_client: reqwest::Client,
}

/// Builder for ModelScopeClient
pub struct ModelScopeClientBuilder {
    api_key: Option<String>,
    base_url: Option<String>,
}

impl ModelScopeClient {
    pub fn builder() -> ModelScopeClientBuilder {
        ModelScopeClientBuilder {
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

    pub fn agent(self, model: String) -> rig::agent::AgentBuilder<ModelScopeCompletionModel> {
        rig::agent::AgentBuilder::new(ModelScopeCompletionModel {
            client: self,
            model,
        })
    }
}

impl ModelScopeClientBuilder {
    pub fn api_key(mut self, api_key: String) -> Self {
        self.api_key = Some(api_key);
        self
    }

    pub fn base_url(mut self, base_url: &str) -> Self {
        self.base_url = Some(base_url.to_string());
        self
    }

    pub fn build(self) -> Result<ModelScopeClient, String> {
        let api_key = self.api_key.ok_or("API key is required")?;
        let base_url = self.base_url.unwrap_or_else(|| "https://api-inference.modelscope.cn/v1".to_string());

        Ok(ModelScopeClient::new(api_key, base_url))
    }
}

// Implement CompletionClient trait for ModelScopeClient
impl CompletionClient for ModelScopeClient {
    type CompletionModel = ModelScopeCompletionModel;

    fn completion_model(&self, model: impl Into<String>) -> Self::CompletionModel {
        ModelScopeCompletionModel {
            client: self.clone(),
            model: model.into(),
        }
    }
}

/// ModelScope Completion Model
#[derive(Clone, Debug)]
pub struct ModelScopeCompletionModel {
    client: ModelScopeClient,
    model: String,
}

// ============================================================================
// Response Structures
// ============================================================================

/// State for accumulating tool calls during streaming
#[derive(Debug, Clone)]
struct ModelScopeToolCallState {
    id: String,
    name: String,
    arguments: String,
}

/// ModelScope Streaming Delta - includes reasoning_content field
/// Handles null values in role, tool_calls, function_calls fields
#[derive(Debug, Deserialize, Serialize)]
pub struct ModelScopeStreamingDelta {
    #[serde(default)]
    pub role: Option<String>,  // Can be null in streaming responses

    #[serde(default)]
    pub content: Option<String>,

    #[serde(default, alias = "reasoning_content")]
    pub reasoning: Option<String>,  // ← ModelScope/GLM uses "reasoning_content"

    #[serde(default)]
    pub tool_calls: Option<Vec<ModelScopeToolCall>>,  // Can be null

    #[serde(default)]
    pub function_calls: Option<Value>,  // Can be null, ignore this field
}

#[derive(Debug, Deserialize, Serialize)]
pub struct ModelScopeToolCall {
    pub id: Option<String>,
    pub r#type: Option<String>,
    pub function: ModelScopeFunction,
    pub index: Option<usize>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct ModelScopeFunction {
    pub name: Option<String>,
    pub arguments: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ModelScopeStreamingChoice {
    pub delta: ModelScopeStreamingDelta,
    #[serde(default)]
    pub finish_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ModelScopeStreamingChunk {
    pub choices: Vec<ModelScopeStreamingChoice>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelScopeStreamingResponse {
    pub content: String,
}

// Implement GetTokenUsage trait
impl GetTokenUsage for ModelScopeStreamingResponse {
    fn token_usage(&self) -> Option<rig::completion::Usage> {
        // TODO: Extract actual usage from ModelScope response
        None
    }
}

// ============================================================================
// CompletionModel Implementation
// ============================================================================

impl rig::completion::CompletionModel for ModelScopeCompletionModel {
    type Response = ModelScopeStreamingResponse;
    type StreamingResponse = ModelScopeStreamingResponse;
    type Client = ModelScopeClient;

    fn make(client: &Self::Client, model: impl Into<String>) -> Self {
        ModelScopeCompletionModel {
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
            "Non-streaming not implemented for ModelScope custom provider yet".to_string(),
        ))
    }

    async fn stream(
        &self,
        request: CompletionRequest,
    ) -> Result<StreamingCompletionResponse<Self::StreamingResponse>, CompletionError> {
        stream_modelscope_completion(&self.client, &self.model, request).await
    }
}


async fn stream_modelscope_completion(
    client: &ModelScopeClient,
    model: &str,
    request: CompletionRequest,
) -> Result<StreamingCompletionResponse<ModelScopeStreamingResponse>, CompletionError> {
    // 1. Build request body
    let mut messages = Vec::new();

    // Add preamble as system message if present
    if let Some(preamble) = &request.preamble {
        messages.push(json!({
            "role": "system",
            "content": preamble
        }));
    }

    // Convert chat history to ModelScope format
    for msg in request.chat_history.iter() {
        messages.push(convert_message_to_modelscope(msg)?);
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

    // Handle ModelScope-specific thinking mode
    if let Some(additional) = &request.additional_params {
        // Check for thinking parameter and enable thinking mode
        if let Some(thinking) = additional.get("thinking") {
            if let Some(thinking_obj) = thinking.as_object() {
                // Get thinking budget (default 1024)
                let default_budget = json!(1024);
                let budget = thinking_obj.get("budget_tokens")
                    .or(thinking_obj.get("budgetTokens"))
                    .unwrap_or(&default_budget);

                // Enable thinking mode
                request_body["extra_body"] = json!({
                    "enable_thinking": true,
                    "thinking_budget": budget,
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
    eprintln!("[MODELSCOPE DEBUG] Request URL: {}", url);
    eprintln!("[MODELSCOPE DEBUG] Model: {}", model);

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
    eprintln!("[MODELSCOPE DEBUG] Response status: {}", response.status());

    // 3. Process SSE stream
    let byte_stream = response.bytes_stream();

    let stream = stream! {
        let mut lines_buffer = String::new();
        let mut stream = byte_stream;

        // Accumulate tool calls by index while streaming
        let mut tool_calls: HashMap<usize, ModelScopeToolCallState> = HashMap::new();

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
                            eprintln!("[MODELSCOPE DEBUG] Raw chunk: {}", data);

                            // Parse JSON chunk
                            match serde_json::from_str::<ModelScopeStreamingChunk>(data) {
                                Ok(ms_chunk) => {
                                    if let Some(choice) = ms_chunk.choices.first() {
                                        let delta = &choice.delta;
                                        let finish_reason = &choice.finish_reason;

                                        // Debug: Print delta structure
                                        eprintln!("[MODELSCOPE DEBUG] Delta - content: {:?}, reasoning: {:?}, tool_calls: {:?}",
                                            delta.content, delta.reasoning, delta.tool_calls.as_ref().map(|v| v.len()).unwrap_or(0));

                                        // Handle reasoning_content - KEY FEATURE!
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
                                        if let Some(ref tool_calls_vec) = delta.tool_calls {
                                            if !tool_calls_vec.is_empty() {
                                                eprintln!("[MODELSCOPE DEBUG] Processing {} tool calls", tool_calls_vec.len());
                                                for tool_call in tool_calls_vec {
                                                    let index = tool_call.index.unwrap_or(0);

                                                    // Get or create tool call entry
                                                    let existing_tool_call = tool_calls.entry(index).or_insert_with(|| ModelScopeToolCallState {
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
                                                            eprintln!("[MODELSCOPE DEBUG] Yielding ToolCallDelta::Name: {}", name);
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
                                                            eprintln!("[MODELSCOPE DEBUG] Yielding ToolCallDelta::Delta: {}", args);
                                                            yield Ok(RawStreamingChoice::ToolCallDelta {
                                                                id: existing_tool_call.id.clone(),
                                                                content: rig::streaming::ToolCallDeltaContent::Delta(args.clone()),
                                                            });
                                                        }
                                                    }
                                                }
                                            }
                                        }

                                        // When finish_reason is "tool_calls", emit the final ToolCall
                                        if finish_reason.as_ref().map(|s| s == "tool_calls").unwrap_or(false) {
                                            eprintln!("[MODELSCOPE DEBUG] Finish reason is tool_calls, emitting {} accumulated tool calls", tool_calls.len());
                                            for (_, tool_call_state) in tool_calls.into_iter() {
                                                if !tool_call_state.name.is_empty() {
                                                    eprintln!("[MODELSCOPE DEBUG] Yielding ToolCall: id={}, name={}, args={}",
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
                                    eprintln!("[MODELSCOPE] Failed to parse chunk: {} - Data: {}", e, data);
                                }
                            }
                        }
                    }
                }
                Err(e) => {
                    eprintln!("[MODELSCOPE] Stream error: {:?}", e);
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
        yield Ok(RawStreamingChoice::FinalResponse(ModelScopeStreamingResponse {
            content: String::new(),
        }));
    };

    Ok(StreamingCompletionResponse::stream(Box::pin(stream)))
}

// Helper function to convert rig messages to ModelScope format
fn convert_message_to_modelscope(msg: &rig::completion::Message) -> Result<Value, CompletionError> {
    // Simplified conversion - expand as needed
    Ok(json!({
        "role": "user", // TODO: Properly map roles
        "content": format!("{:?}", msg) // TODO: Properly extract content
    }))
}
