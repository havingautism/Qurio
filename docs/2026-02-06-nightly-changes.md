# 2026-02-06 今晚改动总结

本文记录 2026-02-06 晚上在 Qurio 前后端完成的主要改造与修复。

## 1. 长期记忆检索链路重构（从“默认注入”改为“模型按需调用”）

### 背景
- 旧逻辑是每轮默认用 lite 模型做 memory_check，并把命中摘要直接拼进上下文。
- 问题是：固定开销高、链路复杂、模型自主性低。

### 改动
- 取消前端默认 lite 记忆检索与 `memoryContextAppend` 注入。
- 改为前端仅预取 domains（`domain_key/aliases/scope/latest_summary`）并透传后端。
- 新增后端工具 `memory_retrieve`，由默认模型正文阶段按需调用。

### 关键文件
- `src/lib/chatStore.js`
- `src/lib/chat/aiService.js`
- `src/lib/backendClient.js`
- `backend-python/src/models/stream_chat.py`
- `backend-python/src/services/agent_registry.py`
- `backend-python/src/services/custom_tools.py`
- `backend-python/src/services/tool_registry.py`
- `backend-python/src/services/stream_chat.py`
- `src/lib/providers.js`

## 2. memory_retrieve 改为“两阶段检索”

### 目标
- 先看 domain 列表，再按选中的 domain 查 summary，避免一次性泄露/加载全部摘要。

### 改动
- `memory_retrieve` 新增 `action` 参数：
  - `action=list`：返回 domain 元信息（默认不带 summary）
  - `action=fetch`：按 `domain_keys` 返回 summary
- 默认 `include_summary=false`。
- 支持 `domain_keys` 两种格式：
  - 数组：`["music","sports"]`
  - 对象：`{"music": true, "sports": true}`
- `action=fetch` 但没有 key/query 时，返回 `invalid_request` 引导先 list 再 fetch。

### 同步调整
- 前端/后端工具 schema 与系统提示改为强引导两步调用。

## 3. memory_update 读取旧记忆稳定性修复

### 现象
- `existing_memory` 常为 `null`，导致 LLM 覆写旧记忆时缺乏参考。

### 原因
- 查询依赖 `maybe_single`，在某些场景下会失败回空。

### 改动（按当前单用户库假设）
- `_load_existing_memory_summary` 改为：
  - 按 `domain_key` 查询 `memory_domains`
  - `order by updated_at desc limit 1`
  - 再按 `domain_id` 查询 `memory_summaries`
  - 同样 `order by updated_at desc limit 1`

### 文件
- `backend-python/src/services/custom_tools.py`

## 4. 首轮元信息流程改造（不阻塞正文）

### 目标
- 先拿到 `space + agent` 就立即开始正文流式；
- `title + emoji` 异步生成并及时回填 UI；
- 正文先落库，关联问题后补更新，避免关联问题失败导致正文不保存。

### 改动
- 新增仅选 `space+agent` 的流程：
  - `preselectSpaceAndAgentForAuto(...)`
- 标题改异步后台生成并更新会话。
- `finalizeMessage` 增加 `deferTitleGeneration`，避免末尾再次同步等标题。
- 关联问题改为后台异步任务，不阻塞正文完成与正文落库。

### 文件
- `src/lib/chat/conversationSetup.js`
- `src/lib/chatStore.js`
- `src/lib/chat/aiService.js`

## 5. 新增后端接口 `/api/space-agent`

### 目标
- 真正拆分 `space+agent` 与 `title+space+agent`，避免仍调用老的三合一接口。

### 改动
- 新增 `generate_space_and_agent(...)` 服务函数。
- 新增路由 `/api/space-agent`。
- 前端新增 `generateSpaceAndAgentViaBackend(...)` 并在自动预选优先使用。

### 文件
- `backend-python/src/services/generation.py`
- `backend-python/src/routes/space_agent.py`
- `backend-python/src/services/agent_os_app.py`
- `src/lib/backendClient.js`
- `src/lib/backendProviderForBackend.js`
- `src/lib/chat/conversationSetup.js`

## 6. 思考/正文分流修复（标签跨 chunk 导致正文进 thought）

### 现象
- 某些 thinking 模型下，部分正文被归到“思考过程”。

### 原因
- `<think>/<thought>` 标签流式分片时，解析器在跨 chunk 场景会卡在 thought 模式。

### 改动
- `TaggedTextHandler` 增加跨 chunk 缓冲。
- 流结束时执行 parser final flush，确保尾部文本正确归类。

### 文件
- `backend-python/src/services/stream_chat.py`

## 7. 相关问题渲染兼容修复

### 现象
- 接口已返回 related questions，但 UI 未渲染。

### 原因
- 返回结构不稳定（`questions` / `related_questions` / `relatedQuestions`），渲染侧只认 `message.related` 数组。

### 改动
- 生成侧统一 normalize。
- 消息对象同时写入 `related` 与 `related_questions`。
- 渲染侧兼容读取：
  - `related`
  - `related_questions`
  - `relatedQuestions`
  - 字符串 JSON 解析结果

### 文件
- `src/lib/chat/aiService.js`
- `src/components/MessageBubble.jsx`

## 8. 其他本晚已完成的优化（同批次）

- 部分数据库调用改为异步线程 offload，降低事件循环阻塞风险。
- SQLite 连接参数与索引做了针对 memory/session 的性能优化。
- 注入统一时间上下文到系统提示，减少“模型说不知道今天日期”的情况。
- `memory_update` 工具参数/提示增强（add/upsert/delete 语义、错误回执、重试提示）。

---

如需，我可以下一步补一份“回归测试清单”（按功能点列出手工验证步骤与预期），用于你们团队今晚改动的验收。

