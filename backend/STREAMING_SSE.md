# SSE Streaming Guide (Backend)

This backend uses Server-Sent Events (SSE) for streaming responses. A shared helper provides
buffering, heartbeats, and consistent headers so all streaming routes behave the same.

## What was added

- Shared SSE helper: `backend/src/utils/sse.js`
  - Sends SSE headers
  - Optional buffered flush (default 50ms)
  - Heartbeats (default 15s)
  - Safe close/flush
- Streaming route integration example: `backend/src/routes/streamChat.js`
- Configurable SSE settings via env:
  - `SSE_FLUSH_MS`
  - `SSE_HEARTBEAT_MS`
- Backend env loading from `backend/.env` and `backend/.env.local`
- Multi-origin CORS support:
  - `FRONTEND_URL` (single)
  - `FRONTEND_URLS` (comma-separated list)

## Environment configuration

Add these in `backend/.env` or `backend/.env.local`:

```
HOST=198.18.0.1
PORT=3001
FRONTEND_URL=http://localhost:3000
FRONTEND_URLS=http://198.18.0.1:3000
SSE_FLUSH_MS=50
SSE_HEARTBEAT_MS=15000
```

Notes:
- `SSE_FLUSH_MS=0` disables buffering and flushes immediately.
- Set `SSE_HEARTBEAT_MS=0` to disable heartbeats.

## How to use in a streaming route

Use the helper to handle headers, buffering, and heartbeats:

```
import { createSseStream, getSseConfig } from '../utils/sse.js'

const sse = createSseStream(res, getSseConfig())
sse.writeComment('ok') // send initial comment so client sees first byte

for await (const chunk of streamChat(...)) {
  sse.sendEvent(chunk)
}

sse.close()
```

## Recommended UX settings

- Keep `SSE_FLUSH_MS` small (e.g., 50ms) for fast "typing" feedback.
- Increase `SSE_FLUSH_MS` if you need fewer packets and lower CPU/network overhead.
- Keep heartbeats at 15-30s to prevent proxy timeouts.

## Troubleshooting

- If streaming never starts:
  - Verify provider supports streaming.
  - Confirm client reads from `response.body`.
- If the connection drops early:
  - Check browser Network tab for "canceled".
  - Ensure CORS allows your front-end origin.
  - Verify `.env.local` is loaded from the backend directory.

---

# SSE 流式传输指南（后端）

本后端使用 SSE 实现流式返回。通过统一的工具方法提供缓冲、心跳和标准响应头。

## 新增内容一览

- 通用 SSE 工具：`backend/src/utils/sse.js`
  - 统一设置 SSE 响应头
  - 可选分批刷新（默认 50ms）
  - 心跳（默认 15s）
  - 安全关闭与 flush
- 流式路由接入示例：`backend/src/routes/streamChat.js`
- SSE 配置项环境变量：
  - `SSE_FLUSH_MS`
  - `SSE_HEARTBEAT_MS`
- 后端从 `backend/.env` 与 `backend/.env.local` 读取环境变量
- CORS 支持多来源：
  - `FRONTEND_URL`（单个）
  - `FRONTEND_URLS`（逗号分隔）

## 环境变量配置

在 `backend/.env` 或 `backend/.env.local` 中添加：

```
HOST=198.18.0.1
PORT=3001
FRONTEND_URL=http://localhost:3000
FRONTEND_URLS=http://198.18.0.1:3000
SSE_FLUSH_MS=50
SSE_HEARTBEAT_MS=15000
```

说明：
- `SSE_FLUSH_MS=0` 表示不缓冲，立即输出。
- `SSE_HEARTBEAT_MS=0` 表示关闭心跳。

## 在流式路由中使用

```
import { createSseStream, getSseConfig } from '../utils/sse.js'

const sse = createSseStream(res, getSseConfig())
sse.writeComment('ok') // 发送首包，确保客户端立即收到字节

for await (const chunk of streamChat(...)) {
  sse.sendEvent(chunk)
}

sse.close()
```

## 之前“流式传输失效”的修复说明

本次修复包含两部分，解决“连接建立后立即断开/无返回”：

1) **后端 env 读取路径修复**
   - 之前从进程工作目录读取 `.env`，导致 `backend/.env.local` 不生效。
   - 现在固定从 `backend/` 目录读取 `.env` 和 `.env.local`，确保 CORS 和 SSE 配置生效。

2) **SSE 连接与缓冲处理**
   - 统一发送首包注释（`:ok`），防止客户端一直等首字节。
   - 增加心跳，避免中间层或浏览器关闭空闲连接。
   - 使用可配置缓冲窗口，减少过多小包导致的卡顿或提前断开。

## 推荐参数（UX 优先）

- `SSE_FLUSH_MS=50`：保持“打字感”，同时减少包数。
- `SSE_HEARTBEAT_MS=15000`：避免连接空闲超时。

## 排查要点

- 前端 Network 中查看是否出现 `canceled` 或长时间无响应。
- 确认浏览器可以读到 `response.body` 并持续消费。
- 检查 CORS 是否允许当前前端 origin。
