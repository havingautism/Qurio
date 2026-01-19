# Rust 端 Provider 逻辑概览

本文档从整体结构和参数组装角度介绍当前 `src-tauri` 中的 Provider 实现，以与 Node.js 版本保持一致性，并辅助跟踪 Moonshot（Kimi）、Minimax、ModelScope、NVIDIA 等适配器的特殊逻辑。

## 1. 核心配置

* `src-tauri/src/providers/constants.rs`
  * 定义每个 provider 的 `base_url`、默认模型、能力（是否支持 Streaming、Tool Calls、Thinking、JSON Schema、Vision）。
  * `provider_alias` 会把 `moonshot` 映射到 `kimi`，背后的含义是 Rust 侧所有配置都以 Kimi 作为 canonical 名称。
  * 工具函数 `get_base_url/ get_default_model/get_capabilities/get_provider_config` 均先经过 alias，用于统一各适配器调用。

## 2. 基类 `BaseAdapter`

* 文件：`src-tauri/src/providers/adapters/base.rs`
* 负责构建通用的 `model_kwargs`（response_format、thinking 预算/类型、top_p/k、频率/存在惩罚、tools、tool_choice、stream_options）。
* 默认开启 `stream_options` 以禁用 usage 返回，和前端一致。
* `get_base_url` 优先接受 `custom_url`（比如 `openai_compatibility` 场景），否则走 `resolve_base_url`。

## 3. 各 Provider 特殊处理

### 3.1 Kimi / Moonshot

* `src-tauri/src/providers/adapters/kimi.rs`
  * 直接复用 `BaseAdapter` 的 `build_model_kwargs`，目前没有额外参数 —— 体现与 Node.js `KimiAdapter` 同样只传 `modelKwargs`（stream、tools、response_format）。
  * 通过 `Provider` 统一的 `resolve_base_url` 拉取 `kimi` 配置；`moonshot` 在别处通过 `normalize_provider` 也映射为 `moonshot`，并且在 `Rig` 里的请求里也统一使用 `moonshot::Client`。

### 3.2 Minimax

* `src-tauri/src/providers/adapters/minimax.rs`
  * 除了 base kwargs，还根据 thinking 状态决定是否添加 `extra_body: { reasoning_split: true }`，与前端 `MiniMaxAdapter` 中的 `reasoning_split` 保持一致，这样 streaming chunk 里的 thinking 内容会通过 `extra_body` 拆分。

### 3.3 ModelScope

* `src-tauri/src/providers/adapters/modelscope.rs`
  * Streaming 时且前端请求了 thinking，会把 `extra_body` / `enable_thinking` / `thinking_budget` 加入，默认预算 `1024`，与 JS 逻辑同步。
  * 非 streaming 情况则显式关闭 thinking，以免前端未带关键词仍被激活。
  * 还保留了 `supports_streaming_tool_calls` 返回 `false` 的声明，提示上层服务层需要通过 Probe-and-Stream 逻辑处理工具（和 Node.js 一致）。

### 3.4 NVIDIA NIM

* `src-tauri/src/providers/adapters/nvidia.rs`
  * 除了基础 kwargs，还在 `model_kwargs` 中添加 `chat_template_kwargs: { thinking } ` —— 参考 Node.js 的 `chat_template_kwargs` 用于控制 thinking 结构。
  * 其它参数（tools、response_format、top_k/p ← 继承自 base）与 JS 版本对齐。

## 4. 其他重要逻辑

* `src-tauri/src/rig_server.rs`
  * `normalize_provider` 把前端 `kimi` 也映射为 `moonshot`，所有调用 `moonshot::Client` 的地方内核一致。
  * `TaggedTextParser` 现在识别 `<thinking>`/`</thinking>` 标签，保证 Moonshot 的流式思考输出被分离为 `type: "thought"`。
  * 每个 endpoint（如 `stream_chat`、`generate_title`）在构建 `model`、`additional_params`（包含 `thinking`、`response_format` 等）时采用 `get_default_model()` 以及 `normalize_provider`，逻辑和 Node.js 版本保持一致。
  * `stream_chat` 使用 `AgentBuilderWrapper` 将 `tools`、`tool_choice`、`streaming` 传入相应的 `agent`，`enable_tag_parsing` 仅在非 SiliconFlow (其 thinking 依赖 `<think>` 标签) 时启用。

## 5. 建议

1. 若 future 需要支持更多 Rust 侧 provider，可继续沿用 `BaseAdapter` + 针对性 `build_model_kwargs` 的组合模式。
2. 若 Moonshot 的思考模式继续演进，可在 `BaseAdapter` 的 `thinking` 处理里加入更多字段（如 `thinking_type`/`budget`）的兼容逻辑，确保 `chat_template_kwargs` 与 streaming chunk tag 保持同步。
