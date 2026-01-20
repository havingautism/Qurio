//! Local Tools - Utility tools that run on the Rust backend
//! Implements: local_time, webpage_reader, interactive_form

use chrono::{DateTime, TimeZone, Utc};
use rig::tool::Tool;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::str::FromStr;

// ============================================================================
// Local Time Tool
// ============================================================================

#[derive(Debug, Deserialize)]
pub struct LocalTimeArgs {
    timezone: Option<String>,
    locale: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct LocalTimeOutput {
    timezone: String,
    formatted: String,
    iso: String,
    unix: i64,
}

#[derive(Clone)]
pub struct LocalTimeTool;

impl Tool for LocalTimeTool {
    const NAME: &'static str = "local_time";
    type Error = LocalTimeError;
    type Args = LocalTimeArgs;
    type Output = LocalTimeOutput;

    async fn definition(&self, _prompt: String) -> rig::completion::ToolDefinition {
        rig::completion::ToolDefinition {
            name: "local_time".to_string(),
            description: "Get current local date and time for a timezone.".to_string(),
            parameters: json!({
              "type": "object",
              "required": [],
              "properties": {
                "timezone": {
                  "type": "string",
                  "description": "IANA timezone, e.g. \"Asia/Shanghai\". Defaults to system timezone."
                },
                "locale": {
                  "type": "string",
                  "description": "Locale for formatting, e.g. \"zh-CN\" or \"en-US\". Defaults to \"en-US\"."
                }
              }
            }),
        }
    }

    async fn call(&self, args: Self::Args) -> Result<Self::Output, Self::Error> {
        let now = Utc::now();

        // Determine timezone
        let timezone = match args.timezone {
            Some(tz) => {
                // Validate timezone by attempting to parse
                match chrono_tz::Tz::from_str(&tz) {
                    Ok(t) => t,
                    Err(_) => {
                        // Fall back to system timezone
                        chrono_tz::UTC
                    }
                }
            }
            None => chrono_tz::UTC,
        };

        // Determine locale for formatting
        let locale = args.locale.unwrap_or_else(|| "en-US".to_string());

        // Format the time
        let formatted = format_time_in_timezone(now, &timezone, &locale);

        Ok(LocalTimeOutput {
            timezone: timezone.name().to_string(),
            formatted,
            iso: now.to_rfc3339(),
            unix: now.timestamp(),
        })
    }
}

#[derive(Debug, thiserror::Error)]
pub enum LocalTimeError {
    #[error("Invalid timezone: {0}")]
    InvalidTimezone(String),
}

fn format_time_in_timezone<T: TimeZone>(
    now: DateTime<T>,
    tz: &chrono_tz::Tz,
    locale: &str,
) -> String {
    let local_time = now.with_timezone(tz);

    // Use a simple formatting approach compatible with standard chrono
    let date_format = match locale.split('-').next() {
        Some("zh") => "%Y年%m月%d日 %H:%M:%S",
        Some("ja") => "%Y年%m月%d日 %H:%M:%S",
        Some("ko") => "%Y년 %m월 %d일 %H:%M:%S",
        Some("de") => "%d.%m.%Y %H:%M:%S",
        Some("fr") => "%d/%m/%Y %H:%M:%S",
        Some("es") => "%d/%m/%Y %H:%M:%S",
        Some("it") => "%d/%m/%Y %H:%M:%S",
        Some("pt") => "%d/%m/%Y %H:%M:%S",
        Some("ru") => "%d.%m.%Y %H:%M:%S",
        Some("ar") => "%d/%m/%Y %H:%M:%S",
        Some("hi") => "%d/%m/%Y %H:%M:%S",
        _ => "%Y-%m-%d %H:%M:%S",
    };

    local_time.format(date_format).to_string()
}

// ============================================================================
// Webpage Reader Tool
// ============================================================================

#[derive(Debug, Deserialize)]
pub struct WebpageReaderArgs {
    url: String,
}

#[derive(Debug, Serialize)]
pub struct WebpageReaderOutput {
    url: String,
    content: String,
    source: String,
}

#[derive(Clone)]
pub struct WebpageReaderTool {
    http: reqwest::Client,
}

impl WebpageReaderTool {
    pub fn new() -> Self {
        Self {
            http: reqwest::Client::new(),
        }
    }
}

impl Default for WebpageReaderTool {
    fn default() -> Self {
        Self::new()
    }
}

impl Tool for WebpageReaderTool {
    const NAME: &'static str = "webpage_reader";
    type Error = WebpageReaderError;
    type Args = WebpageReaderArgs;
    type Output = WebpageReaderOutput;

    async fn definition(&self, _prompt: String) -> rig::completion::ToolDefinition {
        rig::completion::ToolDefinition {
            name: "webpage_reader".to_string(),
            description: "Fetch webpage content and return clean text.".to_string(),
            parameters: json!({
              "type": "object",
              "required": ["url"],
              "properties": {
                "url": {
                  "type": "string",
                  "description": "Target webpage URL (e.g., https://example.com)."
                }
              }
            }),
        }
    }

    async fn call(&self, args: Self::Args) -> Result<Self::Output, Self::Error> {
        let input_url = args.url.trim().to_string();

        // Normalize URL - strip jina.ai prefix if already present
        let normalized = input_url
            .strip_prefix("https://r.jina.ai/http://")
            .or_else(|| input_url.strip_prefix("https://r.jina.ai/https://"))
            .or_else(|| input_url.strip_prefix("http://r.jina.ai/http://"))
            .or_else(|| input_url.strip_prefix("http://r.jina.ai/https://"))
            .or_else(|| input_url.strip_prefix("r.jina.ai/"))
            .unwrap_or(&input_url);

        // Ensure proper URL format
        let target_url = if normalized.starts_with("http://") || normalized.starts_with("https://")
        {
            format!(
                "https://r.jina.ai/{}",
                normalized
                    .trim_start_matches("https://")
                    .trim_start_matches("http://")
            )
        } else {
            format!("https://r.jina.ai/{}", normalized)
        };

        let response = self
            .http
            .get(&target_url)
            .header("Accept", "text/plain")
            .send()
            .await
            .map_err(|e| WebpageReaderError::Network(e.to_string()))?;

        if !response.status().is_success() {
            return Err(WebpageReaderError::HttpError(response.status().to_string()));
        }

        let content = response
            .text()
            .await
            .map_err(|e| WebpageReaderError::Network(e.to_string()))?;

        Ok(WebpageReaderOutput {
            url: normalized.to_string(),
            content,
            source: "jina.ai".to_string(),
        })
    }
}

#[derive(Debug, thiserror::Error)]
pub enum WebpageReaderError {
    #[error("Network error: {0}")]
    Network(String),
    #[error("HTTP error: {0}")]
    HttpError(String),
    #[error("Failed to read content")]
    ReadError,
}

// ============================================================================
// Interactive Form Tool
// ============================================================================

#[derive(Debug, Deserialize, Serialize)]
pub struct FormField {
    name: String,
    label: String,
    #[serde(rename = "type")]
    field_type: String,
    required: Option<bool>,
    options: Option<Vec<String>>,
    default: Option<serde_json::Value>,
    min: Option<f64>,
    max: Option<f64>,
    step: Option<f64>,
    placeholder: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct InteractiveFormArgs {
    id: String,
    title: String,
    description: Option<String>,
    fields: Vec<FormField>,
}

#[derive(Clone)]
pub struct InteractiveFormTool;

impl Tool for InteractiveFormTool {
    const NAME: &'static str = "interactive_form";
    type Error = InteractiveFormError;
    type Args = InteractiveFormArgs;
    type Output = serde_json::Value;

    async fn definition(&self, _prompt: String) -> rig::completion::ToolDefinition {
        rig::completion::ToolDefinition {
            name: "interactive_form".to_string(),
            description: "Display an interactive form to collect structured user input."
                .to_string(),
            parameters: json!({
              "type": "object",
              "required": ["id", "title", "fields"],
              "properties": {
                "id": {
                  "type": "string",
                  "description": "Unique identifier for this form"
                },
                "title": {
                  "type": "string",
                  "description": "Form title displayed to user"
                },
                "description": {
                  "type": "string",
                  "description": "Optional form description"
                },
                "fields": {
                  "type": "array",
                  "description": "Form fields to collect",
                  "items": {
                    "type": "object",
                    "required": ["name", "label", "type"],
                    "properties": {
                      "name": { "type": "string", "description": "Field identifier" },
                      "label": { "type": "string", "description": "Field label" },
                      "type": {
                        "type": "string",
                        "enum": ["text", "number", "select", "checkbox", "range"],
                        "description": "Field type"
                      },
                      "required": { "type": "boolean", "description": "Is this field required" },
                      "options": {
                        "type": "array",
                        "items": { "type": "string" },
                        "description": "Options for select/checkbox fields"
                      },
                      "default": { "description": "Default value" },
                      "min": { "type": "number", "description": "Min value for number/range" },
                      "max": { "type": "number", "description": "Max value for number/range" },
                      "step": { "type": "number", "description": "Step for number/range" },
                      "placeholder": { "type": "string", "description": "Placeholder text" }
                    }
                  }
                }
              }
            }),
        }
    }

    async fn call(&self, args: Self::Args) -> Result<Self::Output, Self::Error> {
        Ok(serde_json::json!({
            "id": args.id,
            "title": args.title,
            "description": args.description,
            "fields": args.fields,
            "kind": "interactive_form"
        }))
    }
}

#[derive(Debug, thiserror::Error)]
pub enum InteractiveFormError {
    #[error("Invalid form definition")]
    InvalidForm,
}
