# Rig 后端迁移（第一阶段）

本次变更在 Tauri 进程内新增 Rust 版后端服务，用于逐步替换现有 Node.js 后端。当前策略是“保留旧接口 + 新增 Rig 能力 + 代理旧接口”，确保功能不中断。

## 变更概览

- 新增 Rust 后端（Axum）并内置 Rig，提供 `/api/rig/complete` 入口。
- Rust 后端将未迁移的 `/api/*` 请求反向代理到旧 Node 后端。
- 旧 Node 后端改为启动在 `NODE_BACKEND_PORT`（默认 3002）。
- 前端仍通过原来的 `PUBLIC_BACKEND_URL`（默认 3001）访问，实际由 Rust 服务接管。

## 新增接口

### POST /api/rig/complete

用于快速验证 Rig 通路。请求示例：

```json
{
  "provider": "openai",
  "prompt": "你好，介绍一下 Rig。",
  "model": "gpt-4o-mini",
  "apiKey": "sk-xxx",
  "baseUrl": "https://api.openai.com/v1"
}
```

响应示例：

```json
{
  "response": "…",
  "model": "gpt-4o-mini"
}
```

说明：

- `provider` 使用 Rig 内置的 provider 名称（如 `openai`、`gemini`、`moonshot` 等）。
- 如果 provider 无法匹配，默认使用 Azure OpenAI provider。
- Azure fallback 可通过 `azureEndpoint` / `azureApiVersion` / `apiKey` 传入；也支持环境变量。

## 启动与端口

- Rust 后端端口：`HOST` + `PORT`（默认 `127.0.0.1:3001`）。
- Node 后端端口：`NODE_BACKEND_PORT`（默认 `3002`）。
- Tauri 进程启动时会同时拉起 Rust 后端与 Node 后端。

## 环境变量说明

为兼容现有 OpenAI 兼容配置，Rust 侧会做以下映射：

- 如果未设置 `OPENAI_API_KEY`，自动读取 `PUBLIC_OPENAI_API_KEY`。
- 如果未设置 `OPENAI_BASE_URL`，自动读取 `PUBLIC_OPENAI_BASE_URL`。

## 迁移策略

1. 先在 Rust 侧新增对应路由。
2. 验证功能后再移除 Node 侧实现。
3. 保持前端请求路径不变（均走 `/api/*`）。

## 相关文件

- `src-tauri/src/rig_server.rs`
- `src-tauri/src/main.rs`
- `src-tauri/Cargo.toml`

## 最新改动（Rust + Rig 端）

**已完成迁移的接口（10个）**：

- ✅ `/api/stream-chat` - SSE 流式对话，支持多轮工具调用
- ✅ `/api/title` - 生成对话标题和表情符号 **[已测试]**
- ✅ `/api/related-questions` - 基于对话历史生成3个相关问题 **[已测试]**
- ✅ `/api/title-and-space` - 生成标题并选择合适的 Space
- ✅ `/api/title-space-agent` - 生成标题、选择 Space 和 Agent
- ✅ `/api/agent-for-auto` - 自动选择最佳 Agent
- ✅ `/api/daily-tip` - 生成每日提示
- ✅ `/api/research-plan` - 生成研究计划（支持 general 和 academic）
- ✅ `/api/research-plan-stream` - SSE 流式输出研究计划
- ✅ `/api/tools` - 返回可用工具列表

**工具支持**：
- 目前仅保留本地工具：`calculator` + `Tavily_web_search` + `Tavily_academic_search`
- 其他工具暂不暴露

**代理机制**：
- 其他尚未迁移的 `/api/*` 继续反向代理到旧 Node 后端，保持兼容

## 仍未迁移的接口（仍走 Node 后端）

- `/api/stream-deep-research` - 深度研究（复杂的多步骤流程）
- `/api/mcp-tools/*` - MCP 工具相关接口

**迁移进度**: 10/12 (83%)

## 启动步骤

1. 设置环境变量（如需搜索）：
   - `TAVILY_API_KEY` 或 `PUBLIC_TAVILY_API_KEY`
2. 一键启动（推荐）：
   - `bun run dev:tauri:oneclick`
   - 该命令会通过 Tauri 的 `beforeDevCommand` 先拉起前端/后端，再启动桌面端。
3. 仅启动后端（调试 Rust 后端时）：
   - `cargo run --manifest-path src-tauri/Cargo.toml`

## 验证方式

- `POST /api/stream-chat`：确认 SSE 有 `text`/`tool_call`/`tool_result`/`done` 事件。
- `GET /api/tools`：确认仅列出 `calculator` 与两类 Tavily 搜索工具。
