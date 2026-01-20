// Kimi Custom Provider Module
//
// This module implements a custom provider for Kimi (Moonshot AI) that properly
// handles `reasoning_content` fields in streaming responses.
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

/// Kimi Client
#[derive(Clone, Debug)]
pub struct KimiClient {
    pub api_key: String,
    pub base_url: String,
    pub http_client: reqwest::Client,
}

/// Builder for KimiClient
pub struct KimiClientBuilder {
    api_key: Option<String>,
    base_url: Option<String>,
}

impl KimiClient {
    pub fn builder() -> KimiClientBuilder {
        KimiClientBuilder {
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

    pub fn agent(self, model: String) -> rig::agent::AgentBuilder<KimiCompletionModel> {
        rig::agent::AgentBuilder::new(KimiCompletionModel {
            client: self,
            model,
        })
    }
}

impl KimiClientBuilder {
    pub fn api_key(mut self, api_key: String) -> Self {
        self.api_key = Some(api_key);
        self
    }

    pub fn base_url(mut self, base_url: &str) -> Self {
        self.base_url = Some(base_url.to_string());
        self
    }

    pub fn build(self) -> Result<KimiClient, String> {
        let api_key = self.api_key.ok_or("API key is required")?;
        let base_url = self.base_url.unwrap_or_else(|| "https://api.moonshot.cn/v1".to_string());

        Ok(KimiClient::new(api_key, base_url))
    }
}

// Implement CompletionClient trait for KimiClient
impl CompletionClient for KimiClient {
    type CompletionModel = KimiCompletionModel;

    fn completion_model(&self, model: impl Into<String>) -> Self::CompletionModel {
        KimiCompletionModel {
            client: self.clone(),
            model: model.into(),
        }
    }
}

/// Kimi Completion Model
#[derive(Clone, Debug)]
pub struct KimiCompletionModel {
    client: KimiClient,
    model: String,
}

// ============================================================================
// Response Structures
// ============================================================================

/// State for accumulating tool calls during streaming
#[derive(Debug, Clone)]
struct KimiToolCallState {
    id: String,
    name: String,
    arguments: String,
}

/// Kimi Streaming Delta - includes reasoning_content field
#[derive(Debug, Deserialize)]
pub struct KimiStreamingDelta {
    #[serde(default)]
    pub content: Option<String>,

    #[serde(default, alias = "reasoning_content", alias = "reasoning")]
    pub thinking: Option<String>,  // ← Kimi uses "reasoning_content" or "reasoning"

    #[serde(default)]
    pub tool_calls: Vec<KimiToolCall>,
}

#[derive(Debug, Deserialize)]
pub struct KimiToolCall {
    pub id: Option<String>,
    pub r#type: Option<String>,
    pub function: KimiFunction,
    pub index: Option<usize>,
}

#[derive(Debug, Deserialize)]
pub struct KimiFunction {
    pub name: Option<String>,
    pub arguments: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct KimiStreamingChoice {
    pub delta: KimiStreamingDelta,
    pub finish_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct KimiStreamingChunk {
    pub choices: Vec<KimiStreamingChoice>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KimiStreamingResponse {
    pub content: String,
}

// Implement GetTokenUsage trait
impl GetTokenUsage for KimiStreamingResponse {
    fn token_usage(&self) -> Option<rig::completion::Usage> {
        // TODO: Extract actual usage from Kimi response
        None
    }
}

// ============================================================================
// CompletionModel Implementation
// ============================================================================

impl rig::completion::CompletionModel for KimiCompletionModel {
    type Response = KimiStreamingResponse;
    type StreamingResponse = KimiStreamingResponse;
    type Client = KimiClient;

    fn make(client: &Self::Client, model: impl Into<String>) -> Self {
        KimiCompletionModel {
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
            "Non-streaming not implemented for Kimi custom provider yet".to_string(),
        ))
    }

    async fn stream(
        &self,
        request: CompletionRequest,
    ) -> Result<StreamingCompletionResponse<Self::StreamingResponse>, CompletionError> {
        stream_kimi_completion(&self.client, &self.model, request).await
    }
}



async fn stream_kimi_completion(
    client: &KimiClient,
    model: &str,
    request: CompletionRequest,
) -> Result<StreamingCompletionResponse<KimiStreamingResponse>, CompletionError> {
    // 1. Build request body
    let mut messages = Vec::new();

    // Add preamble as system message if present
    if let Some(preamble) = &request.preamble {
        messages.push(json!({
            "role": "system",
            "content": preamble
        }));
    }

    // Convert chat history to Kimi format
    for msg in request.chat_history.iter() {
        messages.push(convert_message_to_kimi(msg)?);
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
    if let Some(additional) = request.additional_params {
        // Merge additional params
        if let Value::Object(map) = additional {
            if let Some(obj) = request_body.as_object_mut() {
                obj.extend(map);
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

    // 3. Process SSE stream
    let byte_stream = response.bytes_stream();

    let stream = stream! {
        let mut lines_buffer = String::new();
        let mut stream = byte_stream;

        // Accumulate tool calls by index while streaming
        let mut tool_calls: HashMap<usize, KimiToolCallState> = HashMap::new();

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

                            // Debug: Print raw data to see what Kimi is returning
                            eprintln!("[KIMI DEBUG] Raw chunk: {}", data);

                            // Parse JSON chunk
                            match serde_json::from_str::<KimiStreamingChunk>(data) {
                                Ok(kimi_chunk) => {
                                    if let Some(choice) = kimi_chunk.choices.first() {
                                        let delta = &choice.delta;
                                        let finish_reason = &choice.finish_reason;

                                        // Debug: Print delta structure
                                        eprintln!("[KIMI DEBUG] Delta - content: {:?}, thinking: {:?}, tool_calls: {:?}",
                                            delta.content, delta.thinking, delta.tool_calls.len());

                                        // Handle thinking content - KEY FEATURE for k2-thinking models!
                                        if let Some(thinking) = &delta.thinking {
                                            if !thinking.is_empty() {
                                                yield Ok(RawStreamingChoice::ReasoningDelta {
                                                    id: None,
                                                    reasoning: thinking.clone(),
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
                                            eprintln!("[KIMI DEBUG] Processing {} tool calls", delta.tool_calls.len());
                                            for tool_call in &delta.tool_calls {
                                                let index = tool_call.index.unwrap_or(0);

                                                // Get or create tool call entry
                                                let existing_tool_call = tool_calls.entry(index).or_insert_with(|| KimiToolCallState {
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
                                                        eprintln!("[KIMI DEBUG] Yielding ToolCallDelta::Name: {}", name);
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
                                                        eprintln!("[KIMI DEBUG] Yielding ToolCallDelta::Delta: {}", args);
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
                                            eprintln!("[KIMI DEBUG] Finish reason is tool_calls, emitting {} accumulated tool calls", tool_calls.len());
                                            for (_, tool_call_state) in tool_calls.into_iter() {
                                                if !tool_call_state.name.is_empty() {
                                                    eprintln!("[KIMI DEBUG] Yielding ToolCall: id={}, name={}, args={}",
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
                                    eprintln!("[KIMI] Failed to parse chunk: {} - Data: {}", e, data);
                                }
                            }
                        }
                    }
                }
                Err(e) => {
                    eprintln!("[KIMI] Stream error: {:?}", e);
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
        yield Ok(RawStreamingChoice::FinalResponse(KimiStreamingResponse {
            content: String::new(),
        }));
    };

    Ok(StreamingCompletionResponse::stream(Box::pin(stream)))
}

// Helper function to convert rig messages to Kimi format
fn convert_message_to_kimi(msg: &rig::completion::Message) -> Result<Value, CompletionError> {
    // Simplified conversion - expand as needed
    Ok(json!({
        "role": "user", // TODO: Properly map roles
        "content": format!("{:?}", msg) // TODO: Properly extract content
    }))
}
