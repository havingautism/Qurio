# 自定义 Provider 实现指南

## 概述

本文档描述了自定义 LLM provider 的实现过程，用于支持各 AI 平台的 reasoning_content/thinking 内容输出。

## 1. 为什么需要自定义 Provider？

### 问题：Rig 官方 Provider 不支持 Reasoning Content

Rig 内置的 OpenAI 兼容 provider 无法正确处理 `reasoning_content` 字段：

| 问题 | 官方 OpenAI Provider | 自定义 Provider |
|------|---------------------|-----------------|
| `reasoning_content` 识别 | 不支持 ✅ | 完全支持 ❌ |
| 平台特定字段名 | 统一处理 | 平台适配 |
| Thinking 模式激活 | 不支持 | 按平台配置 |
| 特殊流式格式 | 无法处理 | 双重解析支持 |

### 各平台字段名差异

不同 AI 服务商对 thinking 内容使用不同的字段名：

| Provider | 字段名 |
|----------|--------|
| GLM (智谱AI) | `reasoning_content` |
| DeepSeek (SiliconFlow) | `reasoning_content` |
| Kimi (Moonshot AI) | `reasoning_content`、`reasoning` 或 `thinking` |
| NVIDIA NIM | `reasoning_content` |
| MiniMax | `reasoning_details` |

### Thinking 模式启用参数差异

各平台启用 thinking 模式的方式各不相同：

```rust
// SiliconFlow: enable_thinking + thinking_budget
request_body["enable_thinking"] = true;
request_body["thinking_budget"] = 1024;

// MiniMax: extra_body 中的 reasoning_split
request_body["extra_body"] = json!({ "reasoning_split": true });
```

## 2. 实现步骤

### 步骤 1：定义 Client 和 Model 结构

```rust
// 包含 api_key、base_url、http_client 的 Client
pub struct ProviderClient {
    pub api_key: String,
    pub base_url: String,
    pub http_client: reqwest::Client,
}

// 持有 client + model name 的 CompletionModel
pub struct ProviderCompletionModel {
    client: ProviderClient,
    model: String,
}
```

### 步骤 2：实现 CompletionClient Trait

```rust
impl CompletionClient for ProviderClient {
    type CompletionModel = ProviderCompletionModel;

    fn completion_model(&self, model: impl Into<String>) -> Self::CompletionModel {
        ProviderCompletionModel {
            client: self.clone(),
            model: model.into(),
        }
    }
}
```

### 步骤 3：定义流式响应结构

关键结构 - 包含 reasoning 字段的 `StreamingDelta`：

```rust
#[derive(Debug, Deserialize)]
pub struct ProviderStreamingDelta {
    #[serde(default)]
    pub content: Option<String>,

    #[serde(default, alias = "reasoning_content")]
    pub reasoning: Option<String>,  // 关键字段！

    #[serde(default)]
    pub tool_calls: Vec<ProviderToolCall>,
}
```

### 步骤 4：实现 CompletionModel Trait

```rust
impl rig::completion::CompletionModel for ProviderCompletionModel {
    type Response = ProviderStreamingResponse;
    type StreamingResponse = ProviderStreamingResponse;
    type Client = ProviderClient;

    async fn stream(
        &self,
        request: CompletionRequest,
    ) -> Result<StreamingCompletionResponse<Self::StreamingResponse>, CompletionError> {
        stream_provider_completion(&self.client, &self.model, request).await
    }
}
```

### 步骤 5：实现带 Reasoning 支持的 SSE 流式处理

核心流式函数，使用双重解析：

```rust
async fn stream_provider_completion(
    client: &ProviderClient,
    model: &str,
    request: CompletionRequest,
) -> Result<StreamingCompletionResponse<ProviderStreamingResponse>, CompletionError> {
    // 1. 构建请求体
    let request_body = build_request_body(model, request, None);

    // 2. 发送 HTTP 请求获取 SSE 流
    let response = client.http_client
        .post(&format!("{}/chat/completions", client.base_url))
        .header("Authorization", format!("Bearer {}", client.api_key))
        .json(&request_body)
        .send()
        .await?;

    // 3. 处理 SSE 流（双重解析）
    let stream = stream! {
        // ... 解析 SSE 行 ...

        // 从原始 JSON 解析 reasoning_content（针对放在结构体外的平台）
        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(data) {
            if let Some(reasoning) = parsed.get("choices")
                .and_then(|c| c.as_array())
                .and_then(|c| c.first())
                .and_then(|ch| ch.get("delta"))
                .and_then(|d| d.get("reasoning_content"))
                .and_then(|r| r.as_str())
            {
                if !reasoning.is_empty() {
                    yield Ok(RawStreamingChoice::ReasoningDelta {
                        id: None,
                        reasoning: reasoning.to_string(),
                    });
                }
            }
        }

        // 解析结构体字段
        match serde_json::from_str::<ProviderStreamingChunk>(data) {
            Ok(chunk) => {
                if let Some(choice) = chunk.choices.first() {
                    // 处理 reasoning
                    if let Some(ref reasoning) = choice.delta.reasoning {
                        if !reasoning.is_empty() {
                            yield Ok(RawStreamingChoice::ReasoningDelta {
                                id: None,
                                reasoning: reasoning.clone(),
                            });
                        }
                    }

                    // 处理 content
                    if let Some(ref content) = choice.delta.content {
                        if !content.is_empty() {
                            yield Ok(RawStreamingChoice::Message(content.clone()));
                        }
                    }

                    // 处理 tool calls
                    // ...
                }
            }
        }
    };
}
```

### 步骤 6：处理 Tool Calls

Tool calls 在流式传输过程中需要状态累积：

```rust
struct ToolCallState {
    id: String,
    name: String,
    arguments: String,
}

// 流式传输中：
let mut tool_calls: HashMap<usize, ToolCallState> = HashMap::new();

// 累积部分 tool calls
for tool_call in &delta.tool_calls {
    let index = tool_call.index.unwrap_or(0);
    let existing = tool_calls.entry(index).or_insert_with(ToolCallState::new);

    // 增量更新 ID、name、arguments
    // 对 name/arguments 变更发出 ToolCallDelta
}

// 当 finish_reason == "tool_calls" 时，发出最终 ToolCall
```

## 3. 已实现的 Provider

| Provider | 模型 | Base URL | Reasoning 字段 | 状态 |
|----------|------|----------|----------------|------|
| GLM | glm-4 | `https://open.bigmodel.cn/api/paas/v4` | `reasoning_content` | ✅ 完成 |
| SiliconFlow | deepseek-v3.2 | `https://api.siliconflow.cn/v1` | `reasoning_content` | ✅ 完成 |
| Kimi | k2-thinking | `https://api.moonshot.cn/v1` | `thinking` / `reasoning_content` | ✅ 完成 |
| NVIDIA NIM | deepseek-r1 | `https://integrate.api.nvidia.com/v1` | `reasoning_content` | ✅ 完成 |
| MiniMax | abab6.5s-chat | `https://api.minimax.io/v1` | `reasoning_details` | ✅ 完成 |
| ModelScope | deepseek-v2 | `https://api.modelscope.cn/v1` | `reasoning_content` | ✅ 完成 |

## 4. 关键挑战与解决方案

### 挑战 1：需要双重解析

部分 provider 在原始 JSON 和结构化数据中都会返回 reasoning_content。解决方案：解析两者并去重。

```rust
// 原始 JSON 解析 reasoning_content
if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(data) {
    if let Some(reasoning) = extract_reasoning_from_raw(&parsed) {
        // 发出 reasoning
    }
}

// 结构体解析其他字段
let chunk = serde_json::from_str::<ProviderChunk>(data)?;
```

### 挑战 2：字段名不同

使用 serde 别名处理不同字段名：

```rust
#[serde(default, alias = "reasoning_content", alias = "reasoning", alias = "thinking")]
pub reasoning: Option<String>,
```

### 挑战 3：Thinking 模式激活

各平台参数不同：

```rust
// SiliconFlow
if let Some(thinking) = additional.get("thinking") {
    request_body["enable_thinking"] = json!(true);
    request_body["thinking_budget"] = thinking_obj.get("budget_tokens");
}

// MiniMax
if has_thinking {
    request_body["extra_body"] = json!({ "reasoning_split": true });
}
```

## 5. 使用示例

```rust
use crate::providers::{glm_provider::GLMClient, kimi_provider::KimiClient};

fn main() {
    // GLM
    let glm_client = GLMClient::builder()
        .api_key("your-key".to_string())
        .base_url("https://open.bigmodel.cn/api/paas/v4")
        .build()
        .unwrap();

    let agent = glm_client.agent("glm-4".to_string())
        .preamble("You are a helpful assistant.")
        .build();

    // Kimi
    let kimi_client = KimiClient::builder()
        .api_key("your-key".to_string())
        .build()
        .unwrap();

    let agent = kimi_client.agent("kimi-k2".to_string())
        .build();
}
```

## 6. 未来改进

### 代码重复减少

当前各 provider 共享约 60% 相同代码：
- Client/Builder 模式
- SSE 流处理
- Tool call 处理
- 消息转换

潜在解决方案：创建 `BaseProvider` 模块，包含可复用组件。

### 可考虑添加的 Provider

- Anthropic（如果需要 reasoning_content 支持）
- Google Gemini（如果需要 reasoning_content 支持）
- Azure OpenAI（如果需要 reasoning_content 支持）

## 7. 相关文件

- [glm_provider.rs](../../src-tauri/src/providers/glm_provider.rs)
- [kimi_provider.rs](../../src-tauri/src/providers/kimi_provider.rs)
- [siliconflow_provider.rs](../../src-tauri/src/providers/siliconflow_provider.rs)
- [nvidia_provider.rs](../../src-tauri/src/providers/nvidia_provider.rs)
- [minimax_provider.rs](../../src-tauri/src/providers/minimax_provider.rs)
- [modelscope_provider.rs](../../src-tauri/src/providers/modelscope_provider.rs)
- [constants.rs](../../src-tauri/src/providers/constants.rs)
- [mod.rs](../../src-tauri/src/providers/mod.rs)
