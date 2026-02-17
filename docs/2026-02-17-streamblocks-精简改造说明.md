# StreamBlocks 精简改造说明（2026-02-17）

## 1. 背景与目标

本轮改造的目标是统一消息渲染协议，减少历史兼容分支带来的复杂度与不稳定性。  
核心原则：

- 前端尽量只按 `streamBlocks` 渲染（文本/思考/工具）。
- 不再依赖模型输出中的自定义标签进行拆分。
- 专家模式与普通会话尽量共用渲染链路。
- 出现回归时做最小恢复（只恢复必要字段，不恢复整套旧逻辑）。

---

## 2. 后端侧精简

### 2.1 去除标签注入/依赖

在流式输出链路中，去掉了思考分块标记注入（例如 `<|thought_block_break|>` 一类标记），避免标签泄漏到正文。

相关文件：

- `backend-python/src/services/stream_chat.py`
- `backend-python/src/services/generation.py`

### 2.2 结构化输出问题修复（related questions）

针对 `Invalid grammar request with cache hit` 的 400 问题，调整为不强制传入不稳定 schema，避免触发缓存键冲突。

---

## 3. 前端渲染链路改造

### 3.1 统一按 streamBlocks 渲染

`MessageBubble` 只从 `streamBlocks` 解析 interleave 内容：

- `text` -> 正文
- `thought/reasoning` -> 深度思考
- `tool/tool_call/tool_result` -> 工具卡片
- `workflow_text` -> 专家计划

相关文件：

- `src/components/MessageBubble.jsx`
- `src/lib/chat/aiService.js`
- `src/lib/chatStore.js`

### 3.2 实时流式修复

在 streaming 过程中，持续重建/更新 `streamBlocks`，保证思考内容与工具调用是“边到边渲染”，避免结束后才一次性显示。

---

## 4. 专家模式改造

### 4.1 专家计划显式化

专家计划改为显式 `workflow_text` block，不再通过启发式识别“某段 thought 看起来像计划”。

### 4.2 展示位置与规则

- 专家计划独立面板显示。
- 放在消息顶部（便于先看任务分解）。
- 不折叠。
- 不显示数量（按单计划处理，展示第一条有效 `workflow_text`）。
- 思考折叠区只显示 `thought/reasoning`。

### 4.3 专家模式刷新恢复

修复“当次显示正常，刷新后错乱”问题：  
从 `thinking_process` 恢复专家态字段：

- `expertMode`
- `expertPlan`
- `expertResponses`
- `expertActiveAgentId`

并对 `expertResponses[].streamBlocks` 做标准化，保证刷新后依然按 streamBlocks 渲染。

相关文件：

- `src/hooks/chat/useChatHistory.js`

---

## 5. Deep Research 影响与修复

Deep Research 的计划不走 `workflow_text`，仍走 `researchPlan + researchSteps`。  
本轮精简中出现过“刷新后研究计划丢失”，根因是历史映射把 `researchPlan` 置空。

已修复：

- 优先读取 `research_plan`
- fallback 读取 `thinking_process.plan`
- `deepResearch` 判定改为 `hasResearchSteps || Boolean(researchPlan)`

相关文件：

- `src/hooks/chat/useChatHistory.js`
- `src/components/MessageBubble.jsx`

---

## 6. 已修复的前端告警

修复专家模式工具流重复 key 告警：

> Encountered two children with the same key ...

原因：`tool_call` 与 `tool_result` 可能复用同一 `tool_call_id`。  
修复：工具节点 key 改为包含 `type + tool_call_id + seq`，保证唯一。

相关文件：

- `src/components/MessageBubble.jsx`

---

## 7. 当前策略总结

- 运行期：严格按 `streamBlocks` 渲染。
- 历史恢复：仅恢复必要的 Deep Research / 专家模式关键字段。
- 旧标签兼容：默认不继续扩展，避免维护成本继续上升。

如果后续需要进一步收敛，可考虑：

1. 将 `thinking_process` 中专家态也逐步迁移到独立列或标准结构字段。
2. 给 `stream_blocks` 增加 schema version 演进文档与自动迁移脚本。

