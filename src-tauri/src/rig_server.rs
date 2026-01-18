
use axum::{
  Router,
  body::Body,
  extract::{Json, Path, State},
  http::{HeaderMap, HeaderValue, Method, StatusCode, Uri},
  response::{IntoResponse, Response, sse::{Event, Sse}},
  routing::{any, get, post},
};
use futures::{Stream, StreamExt};
use rig::{
  OneOrMany,
  agent::Agent,
  completion::{AssistantContent, Message, Prompt},
  message::{ToolChoice, UserContent},
  prelude::CompletionClient,
  providers::{gemini, openai},
  streaming::{StreamedAssistantContent, StreamedUserContent, StreamingChat},
  tool::Tool,
};
use rig::agent::MultiTurnStreamItem;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
  cell::RefCell,
  collections::{HashMap, HashSet},
  convert::Infallible,
  net::SocketAddr,
  pin::Pin,
};
use tower_http::cors::{Any, CorsLayer};

const DEFAULT_OPENAI_MODEL: &str = "gpt-4o-mini";
const DEFAULT_GEMINI_MODEL: &str = "gemini-2.0-flash-exp";
const MAX_STREAM_TURNS: usize = 10;

const ACADEMIC_DOMAINS: &[&str] = &[
  "arxiv.org",
  "biorxiv.org",
  "medrxiv.org",
  "ssrn.com",
  "preprints.org",
  "scholar.google.com",
  "semanticscholar.org",
  "pubmed.ncbi.nlm.nih.gov",
  "www.ncbi.nlm.nih.gov",
  "sciencedirect.com",
  "springer.com",
  "link.springer.com",
  "wiley.com",
  "onlinelibrary.wiley.com",
  "nature.com",
  "science.org",
  "pnas.org",
  "cell.com",
  "thelancet.com",
  "jamanetwork.com",
  "bmj.com",
  "oup.com",
  "academic.oup.com",
  "cambridge.org",
  "tandfonline.com",
  "sagepub.com",
  "journals.sagepub.com",
  "frontiersin.org",
  "plos.org",
  "mdpi.com",
  "hindawi.com",
  "ieee.org",
  "acm.org",
  "jstor.org",
  "nih.gov",
  "ncbi.nlm.nih.gov",
  "cdc.gov",
  "who.int",
  "un.org",
  "worldbank.org",
  "imf.org",
  "nber.org",
  "cern.ch",
  "nasa.gov",
  "noaa.gov",
  "nsf.gov",
  ".edu",
  "researchgate.net",
  "academia.edu",
];

#[derive(Clone)]
pub struct RigServerConfig {
  pub host: String,
  pub port: u16,
  pub node_base: String,
  pub allowed_origins: Vec<String>,
}

#[derive(Clone)]
struct AppState {
  node_base: String,
  http: reqwest::Client,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RigCompleteRequest {
  provider: String,
  prompt: String,
  api_key: String,
  model: Option<String>,
  base_url: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RigCompleteResponse {
  response: String,
  model: String,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct StreamChatRequest {
  provider: String,
  api_key: String,
  base_url: Option<String>,
  model: Option<String>,
  messages: Vec<ChatMessage>,
  tools: Option<Vec<ToolDefinition>>,
  tool_choice: Option<Value>,
  response_format: Option<Value>,
  thinking: Option<Value>,
  temperature: Option<f64>,
  top_k: Option<u32>,
  top_p: Option<f64>,
  frequency_penalty: Option<f64>,
  presence_penalty: Option<f64>,
  context_message_limit: Option<usize>,
  tool_ids: Option<Vec<String>>,
  search_provider: Option<String>,
  tavily_api_key: Option<String>,
}

#[derive(Debug, Deserialize, Clone)]
struct ChatMessage {
  role: String,
  content: Option<Value>,
  tool_calls: Option<Vec<ChatToolCall>>,
  tool_call_id: Option<String>,
  name: Option<String>,
  id: Option<String>,
}

#[derive(Debug, Deserialize, Clone)]
struct ChatToolCall {
  id: Option<String>,
  #[serde(rename = "type")]
  tool_type: Option<String>,
  function: Option<ChatToolFunction>,
}

#[derive(Debug, Deserialize, Clone)]
struct ChatToolFunction {
  name: Option<String>,
  arguments: Option<Value>,
}

#[derive(Debug, Deserialize, Clone)]
struct ToolDefinition {
  #[serde(rename = "type")]
  tool_type: Option<String>,
  function: Option<ToolFunctionDefinition>,
}

#[derive(Debug, Deserialize, Clone)]
struct ToolFunctionDefinition {
  name: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ToolDescriptor {
  id: String,
  name: String,
  category: String,
  description: String,
  parameters: Value,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ToolsResponse {
  tools: Vec<ToolDescriptor>,
}

#[derive(Debug, Deserialize)]
struct CalculatorArgs {
  expression: String,
}

#[derive(Debug, Serialize)]
struct CalculatorOutput {
  result: f64,
}

#[derive(Clone)]
struct CalculatorTool;

#[derive(Debug, thiserror::Error)]
enum CalculatorError {
  #[error("Expression is required")]
  MissingExpression,
  #[error("Expression contains unsupported characters")]
  InvalidCharacters,
  #[error("Failed to evaluate expression")]
  EvalError,
}

impl Tool for CalculatorTool {
  const NAME: &'static str = "calculator";
  type Error = CalculatorError;
  type Args = CalculatorArgs;
  type Output = CalculatorOutput;

  async fn definition(&self, _prompt: String) -> rig::completion::ToolDefinition {
    rig::completion::ToolDefinition {
      name: "calculator".to_string(),
      description: "Evaluate a math expression safely.".to_string(),
      parameters: json!({
        "type": "object",
        "required": ["expression"],
        "properties": {
          "expression": {
            "type": "string",
            "description": "Math expression, e.g. \"(2+3)*4/5\"."
          }
        }
      }),
    }
  }

  async fn call(&self, args: Self::Args) -> Result<Self::Output, Self::Error> {
    if args.expression.trim().is_empty() {
      return Err(CalculatorError::MissingExpression);
    }
    if !is_safe_expression(&args.expression) {
      return Err(CalculatorError::InvalidCharacters);
    }
    let result = meval::eval_str(&args.expression).map_err(|_| CalculatorError::EvalError)?;
    Ok(CalculatorOutput { result })
  }
}

#[derive(Debug, Deserialize)]
struct TavilyArgs {
  query: String,
  max_results: Option<u32>,
}

#[derive(Debug, Serialize)]
struct TavilyResult {
  title: String,
  url: String,
  content: Option<String>,
  score: Option<f64>,
}

#[derive(Debug, Serialize)]
struct TavilyOutput {
  answer: Option<String>,
  results: Vec<TavilyResult>,
  query_type: Option<String>,
}

#[derive(Clone)]
struct TavilyWebSearchTool {
  api_key: String,
  http: reqwest::Client,
}

#[derive(Clone)]
struct TavilyAcademicSearchTool {
  api_key: String,
  http: reqwest::Client,
}

#[derive(Debug, thiserror::Error)]
enum TavilyError {
  #[error("Tavily API key not configured")]
  MissingApiKey,
  #[error("Tavily API error: {0}")]
  ApiError(String),
  #[error("Search failed: {0}")]
  RequestError(String),
}

#[derive(Debug, Deserialize)]
struct TavilyResponse {
  answer: Option<String>,
  results: Option<Vec<TavilyResponseItem>>,
}

#[derive(Debug, Deserialize)]
struct TavilyResponseItem {
  title: Option<String>,
  url: Option<String>,
  content: Option<String>,
  score: Option<f64>,
}

impl TavilyWebSearchTool {
  fn new(api_key: String, http: reqwest::Client) -> Self {
    Self { api_key, http }
  }
}

impl TavilyAcademicSearchTool {
  fn new(api_key: String, http: reqwest::Client) -> Self {
    Self { api_key, http }
  }
}

impl Tool for TavilyWebSearchTool {
  const NAME: &'static str = "Tavily_web_search";
  type Error = TavilyError;
  type Args = TavilyArgs;
  type Output = TavilyOutput;

  async fn definition(&self, _prompt: String) -> rig::completion::ToolDefinition {
    rig::completion::ToolDefinition {
      name: "Tavily_web_search".to_string(),
      description: "Search the web for current information using Tavily API.".to_string(),
      parameters: json!({
        "type": "object",
        "required": ["query"],
        "properties": {
          "query": { "type": "string", "description": "Search query." },
          "max_results": {
            "type": "integer",
            "description": "Maximum number of results to return (default 5)."
          }
        }
      }),
    }
  }

  async fn call(&self, args: Self::Args) -> Result<Self::Output, Self::Error> {
    if self.api_key.trim().is_empty() {
      return Err(TavilyError::MissingApiKey);
    }
    let max_results = args.max_results.unwrap_or(5);
    let resp = self
      .http
      .post("https://api.tavily.com/search")
      .json(&json!({
        "api_key": self.api_key,
        "query": args.query,
        "search_depth": "basic",
        "include_answer": true,
        "max_results": max_results,
      }))
      .send()
      .await
      .map_err(|err| TavilyError::RequestError(err.to_string()))?;

    if !resp.status().is_success() {
      return Err(TavilyError::ApiError(resp.status().to_string()));
    }

    let data: TavilyResponse = resp
      .json()
      .await
      .map_err(|err| TavilyError::RequestError(err.to_string()))?;

    let results = data
      .results
      .unwrap_or_default()
      .into_iter()
      .filter_map(|item| {
        Some(TavilyResult {
          title: item.title?,
          url: item.url?,
          content: item.content,
          score: item.score,
        })
      })
      .collect::<Vec<_>>();

    Ok(TavilyOutput {
      answer: data.answer,
      results,
      query_type: None,
    })
  }
}

impl Tool for TavilyAcademicSearchTool {
  const NAME: &'static str = "Tavily_academic_search";
  type Error = TavilyError;
  type Args = TavilyArgs;
  type Output = TavilyOutput;

  async fn definition(&self, _prompt: String) -> rig::completion::ToolDefinition {
    rig::completion::ToolDefinition {
      name: "Tavily_academic_search".to_string(),
      description: "Search academic journals and scholarly resources using Tavily API.".to_string(),
      parameters: json!({
        "type": "object",
        "required": ["query"],
        "properties": {
          "query": { "type": "string", "description": "Academic search query." },
          "max_results": {
            "type": "integer",
            "description": "Maximum number of academic results to return (default 5)."
          }
        }
      }),
    }
  }

  async fn call(&self, args: Self::Args) -> Result<Self::Output, Self::Error> {
    if self.api_key.trim().is_empty() {
      return Err(TavilyError::MissingApiKey);
    }
    let max_results = args.max_results.unwrap_or(5);
    let resp = self
      .http
      .post("https://api.tavily.com/search")
      .json(&json!({
        "api_key": self.api_key,
        "query": args.query,
        "search_depth": "advanced",
        "include_domains": ACADEMIC_DOMAINS,
        "include_answer": true,
        "max_results": max_results,
      }))
      .send()
      .await
      .map_err(|err| TavilyError::RequestError(err.to_string()))?;

    if !resp.status().is_success() {
      return Err(TavilyError::ApiError(resp.status().to_string()));
    }

    let data: TavilyResponse = resp
      .json()
      .await
      .map_err(|err| TavilyError::RequestError(err.to_string()))?;

    let results = data
      .results
      .unwrap_or_default()
      .into_iter()
      .filter_map(|item| {
        Some(TavilyResult {
          title: item.title?,
          url: item.url?,
          content: item.content,
          score: item.score,
        })
      })
      .collect::<Vec<_>>();

    Ok(TavilyOutput {
      answer: data.answer,
      results,
      query_type: Some("academic".to_string()),
    })
  }
}

struct TaggedTextParser {
  enable_tags: bool,
  in_thought_block: bool,
}

impl TaggedTextParser {
  fn new(enable_tags: bool) -> Self {
    Self {
      enable_tags,
      in_thought_block: false,
    }
  }

  fn handle<F, G>(&mut self, text: &str, mut emit_text: F, mut emit_thought: G)
  where
    F: FnMut(&str),
    G: FnMut(&str),
  {
    if !self.enable_tags {
      emit_text(text);
      return;
    }

    let mut remaining = text;
    while !remaining.is_empty() {
      if !self.in_thought_block {
        if let Some((idx, len)) = find_first_tag(remaining, &["<think>", "<thought>"]) {
          if idx > 0 {
            emit_text(&remaining[..idx]);
          }
          remaining = &remaining[idx + len..];
          self.in_thought_block = true;
        } else {
          emit_text(remaining);
          return;
        }
      } else if let Some((idx, len)) = find_first_tag(remaining, &["</think>", "</thought>"]) {
        if idx > 0 {
          emit_thought(&remaining[..idx]);
        }
        remaining = &remaining[idx + len..];
        self.in_thought_block = false;
      } else {
        emit_thought(remaining);
        return;
      }
    }
  }
}

#[derive(Debug, Serialize)]
struct SourceItem {
  title: String,
  uri: String,
}

pub async fn serve(config: RigServerConfig) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
  let state = AppState {
    node_base: config.node_base,
    http: reqwest::Client::new(),
  };

  let cors = if config.allowed_origins.is_empty() {
    CorsLayer::new()
      .allow_origin(Any)
      .allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE, Method::OPTIONS])
      .allow_headers(Any)
  } else {
    let origins = config
      .allowed_origins
      .iter()
      .filter_map(|origin| HeaderValue::from_str(origin).ok())
      .collect::<Vec<_>>();
    CorsLayer::new()
      .allow_origin(origins)
      .allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE, Method::OPTIONS])
      .allow_headers(Any)
  };

  let app = Router::new()
    .route("/api/health", get(health))
    .route("/api/rig/complete", post(rig_complete))
    .route("/api/stream-chat", post(stream_chat))
    .route("/api/tools", get(list_tools))
    .route("/api/*path", any(proxy_api))
    .with_state(state)
    .layer(cors);

  let addr: SocketAddr = format!("{}:{}", config.host, config.port).parse()?;
  let listener = tokio::net::TcpListener::bind(addr).await?;
  axum::serve(listener, app).await?;
  Ok(())
}

async fn health() -> impl IntoResponse {
  Json(json!({ "status": "ok" }))
}

async fn rig_complete(
  State(_state): State<AppState>,
  Json(payload): Json<RigCompleteRequest>,
) -> Result<Json<RigCompleteResponse>, (StatusCode, Json<Value>)> {
  if payload.provider.trim().is_empty() {
    return Err(bad_request("Missing required field: provider"));
  }
  if payload.api_key.trim().is_empty() {
    return Err(bad_request("Missing required field: apiKey"));
  }
  if payload.prompt.trim().is_empty() {
    return Err(bad_request("Missing required field: prompt"));
  }

  match payload.provider.as_str() {
    "gemini" => {
      let model = payload.model.unwrap_or_else(|| DEFAULT_GEMINI_MODEL.to_string());
      let client = gemini::Client::builder()
        .api_key(payload.api_key)
        .build()
        .map_err(|err| internal_error(err.to_string()))?;

      let agent = client
        .agent(model.clone())
        .build();

      let response = agent
        .prompt(payload.prompt)
        .await
        .map_err(|err| internal_error(err.to_string()))?;

      Ok(Json(RigCompleteResponse { response, model }))
    }
    _ => {
      let model = payload.model.unwrap_or_else(|| DEFAULT_OPENAI_MODEL.to_string());
      let mut builder =
        openai::CompletionsClient::<reqwest::Client>::builder().api_key(payload.api_key);
      if let Some(base_url) = resolve_base_url(payload.base_url) {
        builder = builder.base_url(&base_url);
      }
      let client = builder.build().map_err(|err| internal_error(err.to_string()))?;
      let agent = client.agent(model.clone()).build();
      let response = agent
        .prompt(payload.prompt)
        .await
        .map_err(|err| internal_error(err.to_string()))?;

      Ok(Json(RigCompleteResponse { response, model }))
    }
  }
}

async fn stream_chat(
  State(state): State<AppState>,
  Json(payload): Json<StreamChatRequest>,
) -> Result<Sse<impl Stream<Item = Result<Event, Infallible>>>, (StatusCode, Json<Value>)> {
  if payload.provider.trim().is_empty() {
    return Err(bad_request("Missing required field: provider"));
  }
  if payload.api_key.trim().is_empty() {
    return Err(bad_request("Missing required field: apiKey"));
  }
  if payload.messages.is_empty() {
    return Err(bad_request("Missing required field: messages"));
  }

  let trimmed = apply_context_limit(&payload.messages, payload.context_message_limit);
  let (preamble, mut messages) = convert_messages(&trimmed)?;
  let (prompt, history) = split_prompt_history(&mut messages)?;
  let tool_choice = parse_tool_choice(payload.tool_choice.as_ref());
  let enabled = resolve_enabled_tools(&payload);
  let tavily_key = resolve_tavily_key(&payload);
  let model = payload.model.unwrap_or_else(|| {
    if payload.provider == "gemini" {
      DEFAULT_GEMINI_MODEL.to_string()
    } else {
      DEFAULT_OPENAI_MODEL.to_string()
    }
  });

  let mut additional_params = serde_json::Map::new();
  if let Some(response_format) = payload.response_format.clone() {
    additional_params.insert("response_format".to_string(), response_format);
  }
  if let Some(thinking) = payload.thinking.clone() {
    additional_params.insert("thinking".to_string(), thinking);
  }
  if let Some(top_k) = payload.top_k {
    additional_params.insert("top_k".to_string(), json!(top_k));
  }
  if let Some(top_p) = payload.top_p {
    additional_params.insert("top_p".to_string(), json!(top_p));
  }
  if let Some(freq) = payload.frequency_penalty {
    additional_params.insert("frequency_penalty".to_string(), json!(freq));
  }
  if let Some(presence) = payload.presence_penalty {
    additional_params.insert("presence_penalty".to_string(), json!(presence));
  }

  let enable_tag_parsing = payload.provider != "siliconflow";
  let http = state.http.clone();

  let event_stream = match payload.provider.as_str() {
    "gemini" => {
      let client = gemini::Client::builder()
        .api_key(payload.api_key.clone())
        .build()
        .map_err(|err| internal_error(err.to_string()))?;

      let mut builder = AgentBuilderWrapper::Plain(client.agent(model.clone()));
      if let Some(preamble) = preamble.as_deref() {
        builder = builder.preamble(preamble);
      }
      if let Some(tool_choice) = tool_choice.clone() {
        builder = builder.tool_choice(tool_choice);
      }
      if let Some(temp) = payload.temperature {
        builder = builder.temperature(temp);
      }
      if !additional_params.is_empty() {
        builder = builder.additional_params(Value::Object(additional_params.clone()));
      }
      if enabled.calculator {
        builder = builder.tool(CalculatorTool);
      }
      if enabled.web_search {
        builder = builder.tool(TavilyWebSearchTool::new(tavily_key.clone(), http.clone()));
      }
      if enabled.academic_search {
        builder = builder.tool(TavilyAcademicSearchTool::new(tavily_key.clone(), http.clone()));
      }
      let agent = builder.build();
      stream_chat_with_agent(
        agent,
        prompt,
        history,
        enable_tag_parsing,
      )
    }
    _ => {
      let mut builder =
        openai::CompletionsClient::<reqwest::Client>::builder().api_key(payload.api_key.clone());
      if let Some(base_url) = resolve_base_url(payload.base_url.clone()) {
        builder = builder.base_url(&base_url);
      }
      let client = builder
        .build()
        .map_err(|err| internal_error(err.to_string()))?;
      let mut builder = AgentBuilderWrapper::Plain(client.agent(model.clone()));
      if let Some(preamble) = preamble.as_deref() {
        builder = builder.preamble(preamble);
      }
      if let Some(tool_choice) = tool_choice.clone() {
        builder = builder.tool_choice(tool_choice);
      }
      if let Some(temp) = payload.temperature {
        builder = builder.temperature(temp);
      }
      if !additional_params.is_empty() {
        builder = builder.additional_params(Value::Object(additional_params.clone()));
      }
      if enabled.calculator {
        builder = builder.tool(CalculatorTool);
      }
      if enabled.web_search {
        builder = builder.tool(TavilyWebSearchTool::new(tavily_key.clone(), http.clone()));
      }
      if enabled.academic_search {
        builder = builder.tool(TavilyAcademicSearchTool::new(tavily_key.clone(), http.clone()));
      }
      let agent = builder.build();
      stream_chat_with_agent(
        agent,
        prompt,
        history,
        enable_tag_parsing,
      )
    }
  };

  Ok(Sse::new(event_stream))
}

async fn list_tools() -> impl IntoResponse {
  let tools = vec![
    ToolDescriptor {
      id: "calculator".to_string(),
      name: "calculator".to_string(),
      category: "math".to_string(),
      description: "Evaluate a math expression safely.".to_string(),
      parameters: json!({
        "type": "object",
        "required": ["expression"],
        "properties": {
          "expression": {
            "type": "string",
            "description": "Math expression, e.g. \"(2+3)*4/5\"."
          }
        }
      }),
    },
    ToolDescriptor {
      id: "Tavily_web_search".to_string(),
      name: "Tavily_web_search".to_string(),
      category: "search".to_string(),
      description: "Search the web for current information using Tavily API.".to_string(),
      parameters: json!({
        "type": "object",
        "required": ["query"],
        "properties": {
          "query": { "type": "string", "description": "Search query." },
          "max_results": {
            "type": "integer",
            "description": "Maximum number of results to return (default 5)."
          }
        }
      }),
    },
    ToolDescriptor {
      id: "Tavily_academic_search".to_string(),
      name: "Tavily_academic_search".to_string(),
      category: "search".to_string(),
      description: "Search academic journals and scholarly resources using Tavily API.".to_string(),
      parameters: json!({
        "type": "object",
        "required": ["query"],
        "properties": {
          "query": { "type": "string", "description": "Academic search query." },
          "max_results": {
            "type": "integer",
            "description": "Maximum number of academic results to return (default 5)."
          }
        }
      }),
    },
  ];

  Json(ToolsResponse { tools })
}

async fn proxy_api(
  State(state): State<AppState>,
  method: Method,
  Path(path): Path<String>,
  uri: Uri,
  headers: HeaderMap,
  body: Body,
) -> Response {
  let mut url = format!("{}/api/{}", state.node_base.trim_end_matches('/'), path);
  if let Some(query) = uri.query() {
    url.push('?');
    url.push_str(query);
  }

  let body_bytes = match axum::body::to_bytes(body, usize::MAX).await {
    Ok(bytes) => bytes,
    Err(_) => return StatusCode::BAD_REQUEST.into_response(),
  };

  let mut req = state.http.request(method, url).body(body_bytes);
  for (name, value) in headers.iter() {
    if name == "host" || name == "content-length" {
      continue;
    }
    req = req.header(name, value);
  }

  match req.send().await {
    Ok(resp) => {
      let status = resp.status();
      let mut response_builder = Response::builder().status(status);
      for (name, value) in resp.headers().iter() {
        response_builder = response_builder.header(name, value);
      }
      match resp.bytes().await {
        Ok(bytes) => response_builder.body(Body::from(bytes)).unwrap_or_else(|_| {
          StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }),
        Err(_) => StatusCode::BAD_GATEWAY.into_response(),
      }
    }
    Err(_) => StatusCode::BAD_GATEWAY.into_response(),
  }
}

fn resolve_base_url(base_url: Option<String>) -> Option<String> {
  if let Some(base_url) = base_url {
    if !base_url.trim().is_empty() {
      return Some(base_url);
    }
  }
  std::env::var("OPENAI_BASE_URL")
    .ok()
    .or_else(|| std::env::var("PUBLIC_OPENAI_BASE_URL").ok())
}

fn resolve_tavily_key(payload: &StreamChatRequest) -> String {
  if let Some(key) = payload.tavily_api_key.as_ref() {
    if !key.trim().is_empty() {
      return key.to_string();
    }
  }
  std::env::var("TAVILY_API_KEY")
    .ok()
    .or_else(|| std::env::var("PUBLIC_TAVILY_API_KEY").ok())
    .unwrap_or_default()
}

fn apply_context_limit(messages: &[ChatMessage], limit: Option<usize>) -> Vec<ChatMessage> {
  let limit = match limit {
    Some(limit) if limit > 0 => limit,
    _ => return messages.to_vec(),
  };
  if messages.len() <= limit {
    return messages.to_vec();
  }
  let system: Vec<_> = messages
    .iter()
    .filter(|m| m.role == "system")
    .cloned()
    .collect();
  let mut non_system: Vec<_> = messages
    .iter()
    .filter(|m| m.role != "system")
    .cloned()
    .collect();
  if non_system.len() > limit {
    non_system = non_system[non_system.len() - limit..].to_vec();
  }
  system.into_iter().chain(non_system).collect()
}

fn convert_messages(messages: &[ChatMessage]) -> Result<(Option<String>, Vec<Message>), (StatusCode, Json<Value>)> {
  let mut preamble_parts = Vec::new();
  let mut converted = Vec::new();

  for message in messages {
    match message.role.as_str() {
      "system" => {
        if let Some(text) = extract_text_content(message.content.as_ref()) {
          preamble_parts.push(text);
        }
      }
      "user" => {
        let contents = convert_user_contents(message.content.as_ref());
        if contents.is_empty() {
          continue;
        }
        let content = OneOrMany::many(contents)
          .map_err(|_| bad_request("Invalid user message content"))?;
        converted.push(Message::User { content });
      }
      "assistant" => {
        let mut contents = Vec::new();
        if let Some(text) = extract_text_content(message.content.as_ref()) {
          if !text.is_empty() {
            contents.push(AssistantContent::text(text));
          }
        }
        if let Some(tool_calls) = message.tool_calls.as_ref() {
          for (index, tool_call) in tool_calls.iter().enumerate() {
            if let Some(tool) = convert_tool_call(tool_call, index) {
              contents.push(AssistantContent::ToolCall(tool));
            }
          }
        }
        if contents.is_empty() {
          continue;
        }
        let content = OneOrMany::many(contents)
          .map_err(|_| bad_request("Invalid assistant message content"))?;
        converted.push(Message::Assistant { id: message.id.clone(), content });
      }
      "tool" => {
        let tool_id = message
          .tool_call_id
          .clone()
          .or_else(|| message.name.clone())
          .unwrap_or_else(|| "tool".to_string());
        let content_value = extract_text_content(message.content.as_ref()).unwrap_or_default();
        let tool_result = if let Some(call_id) = message.tool_call_id.clone() {
          UserContent::tool_result_with_call_id(
            tool_id.clone(),
            call_id,
            OneOrMany::one(rig::completion::message::ToolResultContent::text(content_value)),
          )
        } else {
          UserContent::tool_result(
            tool_id.clone(),
            OneOrMany::one(rig::completion::message::ToolResultContent::text(content_value)),
          )
        };
        converted.push(Message::User {
          content: OneOrMany::one(tool_result),
        });
      }
      _ => {}
    }
  }

  let preamble = if preamble_parts.is_empty() {
    None
  } else {
    Some(preamble_parts.join("\n"))
  };

  Ok((preamble, converted))
}

fn split_prompt_history(messages: &mut Vec<Message>) -> Result<(Message, Vec<Message>), (StatusCode, Json<Value>)> {
  if messages.is_empty() {
    return Err(bad_request("Missing required field: messages"));
  }
  let prompt = messages.pop().unwrap();
  Ok((prompt, messages.clone()))
}

fn extract_text_content(content: Option<&Value>) -> Option<String> {
  match content {
    Some(Value::String(text)) => Some(text.to_string()),
    Some(Value::Array(items)) => {
      let mut combined = String::new();
      for item in items {
        if let Some(text) = extract_text_from_part(item) {
          combined.push_str(&text);
        }
      }
      if combined.is_empty() { None } else { Some(combined) }
    }
    Some(Value::Object(map)) => map.get("text").and_then(|v| v.as_str()).map(|v| v.to_string()),
    _ => None,
  }
}

fn extract_text_from_part(value: &Value) -> Option<String> {
  match value {
    Value::String(text) => Some(text.to_string()),
    Value::Object(map) => {
      if let Some(Value::String(text)) = map.get("text") {
        return Some(text.to_string());
      }
      None
    }
    _ => None,
  }
}

fn convert_user_contents(content: Option<&Value>) -> Vec<UserContent> {
  let mut contents = Vec::new();
  match content {
    Some(Value::String(text)) => {
      contents.push(UserContent::text(text.to_string()));
    }
    Some(Value::Array(parts)) => {
      for part in parts {
        if let Some(text) = extract_text_from_part(part) {
          contents.push(UserContent::text(text));
          continue;
        }
        if let Some(url) = extract_image_url(part) {
          contents.push(UserContent::image_url(url, None, None));
        }
      }
    }
    Some(Value::Object(map)) => {
      if let Some(Value::String(text)) = map.get("text") {
        contents.push(UserContent::text(text.to_string()));
      }
    }
    _ => {}
  }
  contents
}

fn extract_image_url(value: &Value) -> Option<String> {
  let Value::Object(map) = value else { return None };
  let Some(Value::String(kind)) = map.get("type") else { return None };
  if kind != "image_url" {
    return None;
  }
  let image = map.get("image_url")?;
  let Value::Object(image_map) = image else { return None };
  image_map.get("url")?.as_str().map(|v| v.to_string())
}

fn convert_tool_call(tool_call: &ChatToolCall, index: usize) -> Option<rig::completion::message::ToolCall> {
  let function = tool_call.function.as_ref()?;
  let name = function.name.as_ref()?.to_string();
  let raw_args = function.arguments.clone().unwrap_or(Value::Object(Default::default()));
  let arguments = normalize_tool_arguments(raw_args);
  let id = tool_call
    .id
    .clone()
    .unwrap_or_else(|| format!("tool-call-{}", index));
  Some(rig::completion::message::ToolCall::new(
    id,
    rig::completion::message::ToolFunction::new(name, arguments),
  ))
}

fn normalize_tool_arguments(args: Value) -> Value {
  match args {
    Value::String(text) => serde_json::from_str(&text).unwrap_or(Value::String(text)),
    other => other,
  }
}

fn parse_tool_choice(value: Option<&Value>) -> Option<ToolChoice> {
  let value = value?;
  match value {
    Value::String(choice) => match choice.as_str() {
      "auto" => Some(ToolChoice::Auto),
      "none" => Some(ToolChoice::None),
      "required" => Some(ToolChoice::Required),
      _ => None,
    },
    Value::Object(map) => {
      let function = map.get("function")?;
      let Value::Object(function_map) = function else { return None };
      let name = function_map.get("name")?.as_str()?;
      Some(ToolChoice::Specific {
        function_names: vec![name.to_string()],
      })
    }
    _ => None,
  }
}

struct EnabledTools {
  calculator: bool,
  web_search: bool,
  academic_search: bool,
}

fn resolve_enabled_tools(payload: &StreamChatRequest) -> EnabledTools {
  let mut names = HashSet::new();
  if let Some(tools) = payload.tools.as_ref() {
    for tool in tools {
      if let Some(function) = tool.function.as_ref() {
        if let Some(name) = function.name.as_ref() {
          names.insert(name.to_string());
        }
      }
    }
  }
  if let Some(tool_ids) = payload.tool_ids.as_ref() {
    for id in tool_ids {
      names.insert(id.to_string());
    }
  }

  let search_active = payload
    .search_provider
    .as_ref()
    .map(|v| v == "tavily")
    .unwrap_or(false);

  let enable_web = names.contains("Tavily_web_search")
    || names.contains("web_search")
    || (search_active && names.is_empty());
  let enable_academic =
    names.contains("Tavily_academic_search") || names.contains("academic_search");
  let enable_calculator = names.contains("calculator");

  EnabledTools {
    calculator: enable_calculator,
    web_search: enable_web,
    academic_search: enable_academic,
  }
}

fn stream_chat_with_agent<M>(
  agent: Agent<M>,
  prompt: Message,
  history: Vec<Message>,
  enable_tag_parsing: bool,
) -> Pin<Box<dyn Stream<Item = Result<Event, Infallible>> + Send>>
where
  M: rig::completion::CompletionModel + 'static,
  M::StreamingResponse: rig::completion::GetTokenUsage,
{
  Box::pin(async_stream::stream! {
    yield Ok(Event::default().comment("ok"));
    let mut parser = TaggedTextParser::new(enable_tag_parsing);
    let mut full_content = String::new();
    let mut full_thought = String::new();
    let mut sources: HashMap<String, SourceItem> = HashMap::new();
    let mut tool_names: HashMap<String, String> = HashMap::new();

    let mut stream = agent
      .stream_chat(prompt, history)
      .multi_turn(MAX_STREAM_TURNS)
      .await;

    while let Some(item) = stream.next().await {
      match item {
        Ok(MultiTurnStreamItem::StreamAssistantItem(StreamedAssistantContent::Text(text))) => {
          let events = RefCell::new(Vec::new());
          parser.handle(
            &text.text,
            |chunk| {
              if chunk.is_empty() {
                return;
              }
              full_content.push_str(chunk);
              events
                .borrow_mut()
                .push(json!({"type": "text", "content": chunk}));
            },
            |chunk| {
              if chunk.is_empty() {
                return;
              }
              full_thought.push_str(chunk);
              events
                .borrow_mut()
                .push(json!({"type": "thought", "content": chunk}));
            },
          );
          for payload in events.into_inner() {
            yield Ok(Event::default().data(payload.to_string()));
          }
        }
        Ok(MultiTurnStreamItem::StreamAssistantItem(StreamedAssistantContent::Reasoning(reasoning))) => {
          let text = reasoning.reasoning.join("");
          if !text.is_empty() {
            full_thought.push_str(&text);
            yield Ok(Event::default().data(json!({"type": "thought", "content": text}).to_string()));
          }
        }
        Ok(MultiTurnStreamItem::StreamAssistantItem(StreamedAssistantContent::ReasoningDelta { reasoning, .. })) => {
          if !reasoning.is_empty() {
            full_thought.push_str(&reasoning);
            yield Ok(Event::default().data(json!({"type": "thought", "content": reasoning}).to_string()));
          }
        }
        Ok(MultiTurnStreamItem::StreamAssistantItem(StreamedAssistantContent::ToolCall(tool_call))) => {
          let args = serde_json::to_string(&tool_call.function.arguments).unwrap_or_default();
          tool_names.insert(tool_call.id.clone(), tool_call.function.name.clone());
          yield Ok(Event::default().data(json!({
            "type": "tool_call",
            "id": tool_call.id,
            "name": tool_call.function.name,
            "arguments": args,
          }).to_string()));
        }
        Ok(MultiTurnStreamItem::StreamAssistantItem(StreamedAssistantContent::ToolCallDelta { .. })) => {}
        Ok(MultiTurnStreamItem::StreamUserItem(StreamedUserContent::ToolResult(tool_result))) => {
          let tool_name = tool_names.get(&tool_result.id).cloned();
          let output_value = tool_result_content_to_value(&tool_result.content);
          if let Some(name) = tool_name.as_ref() {
            if name == "Tavily_web_search" || name == "Tavily_academic_search" {
              collect_tavily_sources(&output_value, &mut sources);
            }
          }
          yield Ok(Event::default().data(json!({
            "type": "tool_result",
            "id": tool_result.id,
            "name": tool_name,
            "status": "done",
            "output": output_value,
          }).to_string()));
        }
        Ok(MultiTurnStreamItem::StreamAssistantItem(StreamedAssistantContent::Final(_))) => {}
        Ok(MultiTurnStreamItem::FinalResponse(_)) => {}
        Ok(_) => {}
        Err(err) => {
          yield Ok(Event::default().data(json!({"type": "error", "error": err.to_string()}).to_string()));
          return;
        }
      }
    }

    let sources_list = if sources.is_empty() {
      Value::Null
    } else {
      let values = sources.into_values().collect::<Vec<_>>();
      serde_json::to_value(values).unwrap_or(Value::Null)
    };

    let mut done = json!({
      "type": "done",
      "content": full_content,
    });
    if !full_thought.is_empty() {
      done["thought"] = json!(full_thought);
    }
    if sources_list != Value::Null {
      done["sources"] = sources_list;
    }
    yield Ok(Event::default().data(done.to_string()));
  })
}

fn tool_result_content_to_value(content: &OneOrMany<rig::completion::message::ToolResultContent>) -> Value {
  let mut texts = Vec::new();
  for item in content.iter() {
    if let rig::completion::message::ToolResultContent::Text(text) = item {
      texts.push(text.text.clone());
    }
  }
  if texts.len() == 1 {
    parse_json_or_string(&texts[0])
  } else if texts.is_empty() {
    Value::Null
  } else {
    Value::Array(texts.into_iter().map(Value::String).collect())
  }
}

fn parse_json_or_string(text: &str) -> Value {
  serde_json::from_str(text).unwrap_or_else(|_| Value::String(text.to_string()))
}

fn collect_tavily_sources(value: &Value, sources: &mut HashMap<String, SourceItem>) {
  let Value::Object(map) = value else { return };
  let Some(Value::Array(results)) = map.get("results") else { return };
  for result in results {
    let Value::Object(item) = result else { continue };
    let Some(Value::String(url)) = item.get("url") else { continue };
    if sources.contains_key(url) {
      continue;
    }
    let title = item
      .get("title")
      .and_then(|v| v.as_str())
      .unwrap_or(url)
      .to_string();
    sources.insert(
      url.to_string(),
      SourceItem {
        title,
        uri: url.to_string(),
      },
    );
  }
}

fn is_safe_expression(expression: &str) -> bool {
  let allowed = regex::Regex::new(r"^[0-9+\-*/%^().,\sA-Za-z_]*$").ok();
  match allowed {
    Some(re) => re.is_match(expression),
    None => false,
  }
}

fn find_first_tag(text: &str, tags: &[&str]) -> Option<(usize, usize)> {
  let lower = text.to_lowercase();
  let mut best: Option<(usize, usize)> = None;
  for tag in tags {
    if let Some(idx) = lower.find(tag) {
      if best.map(|(best_idx, _)| idx < best_idx).unwrap_or(true) {
        best = Some((idx, tag.len()));
      }
    }
  }
  best
}

fn bad_request(message: &str) -> (StatusCode, Json<Value>) {
  (StatusCode::BAD_REQUEST, Json(json!({ "error": message })))
}

fn internal_error(message: String) -> (StatusCode, Json<Value>) {
  (
    StatusCode::INTERNAL_SERVER_ERROR,
    Json(json!({ "error": "Internal server error", "message": message })),
  )
}

enum AgentBuilderWrapper<M>
where
  M: rig::completion::CompletionModel,
{
  Plain(rig::agent::AgentBuilder<M>),
  WithTools(rig::agent::AgentBuilderSimple<M>),
}

impl<M> AgentBuilderWrapper<M>
where
  M: rig::completion::CompletionModel,
{
  fn preamble(self, preamble: &str) -> Self {
    match self {
      Self::Plain(builder) => Self::Plain(builder.preamble(preamble)),
      Self::WithTools(builder) => Self::WithTools(builder.preamble(preamble)),
    }
  }

  fn tool_choice(self, choice: ToolChoice) -> Self {
    match self {
      Self::Plain(builder) => Self::Plain(builder.tool_choice(choice)),
      Self::WithTools(builder) => Self::WithTools(builder.tool_choice(choice)),
    }
  }

  fn temperature(self, temp: f64) -> Self {
    match self {
      Self::Plain(builder) => Self::Plain(builder.temperature(temp)),
      Self::WithTools(builder) => Self::WithTools(builder.temperature(temp)),
    }
  }

  fn additional_params(self, params: Value) -> Self {
    match self {
      Self::Plain(builder) => Self::Plain(builder.additional_params(params)),
      Self::WithTools(builder) => Self::WithTools(builder.additional_params(params)),
    }
  }

  fn tool<T>(self, tool: T) -> Self
  where
    T: Tool + 'static,
  {
    match self {
      Self::Plain(builder) => Self::WithTools(builder.tool(tool)),
      Self::WithTools(builder) => Self::WithTools(builder.tool(tool)),
    }
  }

  fn build(self) -> Agent<M> {
    match self {
      Self::Plain(builder) => builder.build(),
      Self::WithTools(builder) => builder.build(),
    }
  }
}
