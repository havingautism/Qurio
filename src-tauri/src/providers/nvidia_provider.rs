// NVIDIA NIM Custom Provider Module
//
// This module implements a custom provider for NVIDIA NIM (OpenAI-compatible)
// that properly handles streaming responses with reasoning_content support.
//
// Key features:
// - OpenAI-compatible API format
// - Streaming support with reasoning_content
// - Tool calls support
//
// Based on Rig's official custom provider guide and ModelScope provider implementation.

use async_stream::stream;
use futures::StreamExt;
use rig::completion::{CompletionError, CompletionRequest, GetTokenUsage};
use rig::streaming::{RawStreamingChoice, RawStreamingToolCall, StreamingCompletionResponse};
use rig::prelude::CompletionClient;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;

// ============================================================================
// Client and Model Structures
// ============================================================================

/// NVIDIA NIM Client
#[derive(Clone, Debug)]
pub struct NvidiaNimClient {
    pub api_key: String,
    pub base_url: String,
    pub http_client: reqwest::Client,
}

/// Builder for NvidiaNimClient
pub struct NvidiaNimClientBuilder {
    api_key: Option<String>,
    base_url: Option<String>,
}

impl NvidiaNimClient {
    pub fn builder() -> NvidiaNimClientBuilder {
        NvidiaNimClientBuilder {
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

    pub fn agent(self, model: String) -> rig::agent::AgentBuilder<NvidiaNimCompletionModel> {
        rig::agent::AgentBuilder::new(NvidiaNimCompletionModel {
            client: self,
            model,
        })
    }
}

impl NvidiaNimClientBuilder {
    pub fn api_key(mut self, api_key: String) -> Self {
        self.api_key = Some(api_key);
        self
    }

    pub fn base_url(mut self, base_url: &str) -> Self {
        self.base_url = Some(base_url.to_string());
        self
    }

    pub fn build(self) -> Result<NvidiaNimClient, String> {
        let api_key = self.api_key.ok_or("API key is required")?;
        let base_url = self.base_url.unwrap_or_else(|| "https://integrate.api.nvidia.com/v1".to_string());

        Ok(NvidiaNimClient::new(api_key, base_url))
    }
}

// Implement CompletionClient trait for NvidiaNimClient
impl CompletionClient for NvidiaNimClient {
    type CompletionModel = NvidiaNimCompletionModel;

    fn completion_model(&self, model: impl Into<String>) -> Self::CompletionModel {
        NvidiaNimCompletionModel {
            client: self.clone(),
            model: model.into(),
        }
    }
}

/// NVIDIA NIM Completion Model
#[derive(Clone, Debug)]
pub struct NvidiaNimCompletionModel {
    client: NvidiaNimClient,
    model: String,
}

// ============================================================================
// Response Structures
// ============================================================================

/// State for accumulating tool calls during streaming
#[derive(Debug, Clone)]
struct NvidiaNimToolCallState {
    id: String,
    name: String,
    arguments: String,
}

/// NVIDIA NIM Streaming Delta
#[derive(Debug, Deserialize, Serialize)]
pub struct NvidiaNimStreamingDelta {
    #[serde(default)]
    pub content: Option<String>,

    #[serde(default)]
    pub role: Option<String>,

    #[serde(default)]
    pub tool_calls: Option<Vec<NvidiaNimToolCall>>,

    #[serde(default, alias = "reasoning_content")]
    pub reasoning: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct NvidiaNimToolCall {
    pub id: Option<String>,
    pub r#type: Option<String>,
    pub function: NvidiaNimFunction,
    pub index: Option<usize>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct NvidiaNimFunction {
    pub name: Option<String>,
    pub arguments: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct NvidiaNimStreamingChoice {
    pub delta: NvidiaNimStreamingDelta,
    #[serde(default)]
    pub finish_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct NvidiaNimStreamingChunk {
    pub choices: Vec<NvidiaNimStreamingChoice>,
    #[serde(default)]
    pub usage: Option<NvidiaNimUsage>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct NvidiaNimUsage {
    pub prompt_tokens: Option<u32>,
    pub completion_tokens: Option<u32>,
    pub total_tokens: Option<u32>,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct NvidiaNimFinalResponse {
    pub usage: NvidiaNimUsage,
}

impl GetTokenUsage for NvidiaNimFinalResponse {
    fn token_usage(&self) -> Option<rig::completion::Usage> {
        let mut usage = rig::completion::Usage::new();
        if let Some(prompt) = self.usage.prompt_tokens {
            usage.input_tokens = prompt as u64;
        }
        if let Some(completion) = self.usage.completion_tokens {
            usage.output_tokens = completion as u64;
        }
        if let Some(total) = self.usage.total_tokens {
            usage.total_tokens = total as u64;
        }
        Some(usage)
    }
}

// ============================================================================
// CompletionModel Implementation
// ============================================================================

impl rig::completion::CompletionModel for NvidiaNimCompletionModel {
    type Response = NvidiaNimFinalResponse;
    type StreamingResponse = NvidiaNimFinalResponse;
    type Client = NvidiaNimClient;

    fn make(client: &Self::Client, model: impl Into<String>) -> Self {
        NvidiaNimCompletionModel {
            client: client.clone(),
            model: model.into(),
        }
    }

    async fn completion(
        &self,
        _request: CompletionRequest,
    ) -> Result<rig::completion::CompletionResponse<Self::Response>, CompletionError> {
        Err(CompletionError::ProviderError(
            "Non-streaming not implemented for NVIDIA NIM custom provider yet".to_string(),
        ))
    }

    async fn stream(
        &self,
        request: CompletionRequest,
    ) -> Result<StreamingCompletionResponse<Self::StreamingResponse>, CompletionError> {
        stream_nvidia_completion(&self.client, &self.model, request).await
    }
}

async fn stream_nvidia_completion(
    client: &NvidiaNimClient,
    model: &str,
    request: CompletionRequest,
) -> Result<StreamingCompletionResponse<NvidiaNimFinalResponse>, CompletionError> {
    // 1. Build request body
    let mut messages = Vec::new();

    // Add preamble as system message if present
    if let Some(preamble) = &request.preamble {
        messages.push(json!({
            "role": "system",
            "content": preamble
        }));
    }

    // Convert chat history to OpenAI format
    for msg in request.chat_history.iter() {
        messages.push(convert_message_to_openai(msg)?);
    }

    let mut request_body = json!({
        "model": model,
        "messages": messages,
        "stream": true,
        "stream_options": { "include_usage": true },
    });

    // Add temperature if present
    if let Some(temp) = request.temperature {
        request_body["temperature"] = json!(temp);
    }

    // Add max_tokens if present
    if let Some(max_tokens) = request.max_tokens {
        request_body["max_tokens"] = json!(max_tokens);
    }

    // Add tool_choice if present
    if let Some(ref tool_choice) = request.tool_choice {
        request_body["tool_choice"] = serde_json::to_value(tool_choice)
            .unwrap_or(json!("auto"));
    }

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

    // Add additional parameters (for thinking mode, etc.)
    // NVIDIA NIM requires `chat_template_kwargs: { thinking: true }` for thinking mode
    if let Some(additional) = &request.additional_params {
        if let Value::Object(map) = additional {
            for (key, value) in map.iter() {
                if key == "thinking" {
                    // Convert thinking parameter to chat_template_kwargs for NVIDIA
                    // e.g., `thinking: true` becomes `chat_template_kwargs: { thinking: true }`
                    request_body["chat_template_kwargs"] = json!({ "thinking": true });
                } else if !request_body.get(key).is_some() {
                    request_body[key] = value.clone();
                }
            }
        }
    }

    // 2. Send HTTP request and get SSE stream
    let url = format!("{}/chat/completions", client.base_url);

    let response = client
        .http_client
        .post(&url)
        .header("Authorization", format!("Bearer {}", client.api_key))
        .header("Content-Type", "application/json")
        .json(&request_body)
        .send()
        .await
        .map_err(|e| CompletionError::ProviderError(e.to_string()))?;

    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(CompletionError::ProviderError(format!(
            "Invalid status code {}: {}",
            status,
            body
        )));
    }

    // 3. Process SSE stream
    let byte_stream = response.bytes_stream();

    let stream = stream! {
        let mut lines_buffer = String::new();
        let mut stream = byte_stream;

        // Accumulate tool calls by index while streaming
        let mut tool_calls: HashMap<usize, NvidiaNimToolCallState> = HashMap::new();
        let mut text_content = String::new();
        let mut final_usage: Option<NvidiaNimUsage> = None;

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

                            // Parse and handle reasoning_content from raw JSON
                            // NVIDIA NIM uses "reasoning_content" field directly
                            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(data) {
                                if let Some(choices) = parsed.get("choices").and_then(|c| c.as_array()) {
                                    if let Some(first_choice) = choices.first() {
                                        if let Some(delta) = first_choice.get("delta") {
                                            // Handle reasoning_content
                                            if let Some(reasoning_content) = delta.get("reasoning_content") {
                                                if let Some(reasoning_str) = reasoning_content.as_str() {
                                                    if !reasoning_str.is_empty() {
                                                        yield Ok(RawStreamingChoice::ReasoningDelta {
                                                            id: None,
                                                            reasoning: reasoning_str.to_string(),
                                                        });
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }

                            // Parse JSON chunk for other fields (content, tool_calls, etc.)
                            match serde_json::from_str::<NvidiaNimStreamingChunk>(data) {
                                Ok(nvidia_chunk) => {
                                    // Handle usage if present
                                    if let Some(usage) = nvidia_chunk.usage {
                                        final_usage = Some(usage);
                                    }

                                    if let Some(choice) = nvidia_chunk.choices.first() {
                                        let delta = &choice.delta;
                                        let finish_reason = &choice.finish_reason;

                                        // Handle reasoning_content
                                        if let Some(ref reasoning) = delta.reasoning {
                                            if !reasoning.is_empty() {
                                                yield Ok(RawStreamingChoice::ReasoningDelta {
                                                    id: None,
                                                    reasoning: reasoning.clone(),
                                                });
                                            }
                                        }

                                        // Handle regular content
                                        if let Some(ref content) = delta.content {
                                            if !content.is_empty() {
                                                text_content.push_str(content);
                                                yield Ok(RawStreamingChoice::Message(content.clone()));
                                            }
                                        }

                                        // Handle tool calls
                                        if let Some(ref tool_calls_vec) = delta.tool_calls {
                                            for tool_call in tool_calls_vec {
                                                let index = tool_call.index.unwrap_or(0);

                                                let existing_tool_call = tool_calls
                                                    .entry(index)
                                                    .or_insert_with(|| NvidiaNimToolCallState {
                                                        id: String::new(),
                                                        name: String::new(),
                                                        arguments: String::new(),
                                                    });

                                                // Update ID
                                                if let Some(ref id) = tool_call.id {
                                                    if !id.is_empty() {
                                                        existing_tool_call.id = id.clone();
                                                    }
                                                }

                                                // Handle function name
                                                if let Some(ref name) = tool_call.function.name {
                                                    if !name.is_empty() {
                                                        existing_tool_call.name = name.clone();
                                                        yield Ok(RawStreamingChoice::ToolCallDelta {
                                                            id: existing_tool_call.id.clone(),
                                                            content: rig::streaming::ToolCallDeltaContent::Name(name.clone()),
                                                        });
                                                    }
                                                }

                                                // Handle function arguments
                                                if let Some(ref args) = tool_call.function.arguments {
                                                    if !args.is_empty() {
                                                        existing_tool_call.arguments.push_str(args);
                                                        yield Ok(RawStreamingChoice::ToolCallDelta {
                                                            id: existing_tool_call.id.clone(),
                                                            content: rig::streaming::ToolCallDeltaContent::Delta(args.clone()),
                                                        });
                                                    }
                                                }
                                            }
                                        }

                                        // When finish_reason is "tool_calls", emit final tool call
                                        if finish_reason.as_ref().map(|s| s == "tool_calls").unwrap_or(false) {
                                            for (_, tool_call) in tool_calls.into_iter() {
                                                let arguments = if tool_call.arguments.starts_with('{') {
                                                    match serde_json::from_str(&tool_call.arguments) {
                                                        Ok(v) => v,
                                                        Err(_) => serde_json::Value::String(tool_call.arguments),
                                                    }
                                                } else {
                                                    serde_json::Value::String(tool_call.arguments)
                                                };

                                                yield Ok(RawStreamingChoice::ToolCall(
                                                    RawStreamingToolCall::new(
                                                        tool_call.id,
                                                        tool_call.name,
                                                        arguments,
                                                    )
                                                ));
                                            }
                                            tool_calls = HashMap::new();
                                        }
                                    }
                                }
                                Err(e) => {
                                    eprintln!("[NVIDIA] Failed to parse chunk: {}", e);
                                    continue;
                                }
                            }
                        }
                    }
                }
                Err(e) => {
                    eprintln!("[NVIDIA] Stream error: {}", e);
                    yield Err(CompletionError::ProviderError(e.to_string()));
                    break;
                }
            }
        }

        // Flush any remaining tool calls
        for (_, tool_call) in tool_calls.into_iter() {
            let arguments = if tool_call.arguments.starts_with('{') {
                match serde_json::from_str(&tool_call.arguments) {
                    Ok(v) => v,
                    Err(_) => serde_json::Value::String(tool_call.arguments),
                }
            } else {
                serde_json::Value::String(tool_call.arguments)
            };

            yield Ok(RawStreamingChoice::ToolCall(
                RawStreamingToolCall::new(
                    tool_call.id,
                    tool_call.name,
                    arguments,
                )
            ));
        }

        // Emit final response with usage
        let usage = final_usage.unwrap_or_else(|| NvidiaNimUsage {
            prompt_tokens: None,
            completion_tokens: None,
            total_tokens: None,
        });

        yield Ok(RawStreamingChoice::FinalResponse(NvidiaNimFinalResponse { usage }));
    };

    Ok(StreamingCompletionResponse::stream(Box::pin(stream)))
}

// ============================================================================
// Helper Functions
// ============================================================================

/// Convert Rig message to OpenAI-compatible format
fn convert_message_to_openai(msg: &rig::completion::Message) -> Result<Value, CompletionError> {
    // Simplified conversion - expand as needed
    Ok(json!({
        "role": "user", // TODO: Properly map roles
        "content": format!("{:?}", msg) // TODO: Properly extract content
    }))
}
