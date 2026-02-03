# Session Summary Implementation Plan

## Objective
利用 Agno 的 `SessionSummaryManager` 机制实现“无状态”的会话摘要功能。该方案旨在显著降低长对话的 Token 成本并防止上下文丢失，同时严格遵循前端存储原则，不在后端维护独立的数据库连接。

## Architecture
该方案采用 **“前端持久化 + 后端按需计算”** 的分布式架构。

### 核心逻辑
1. **触发机制**：当后端检测到对话消息数超过系统预设阈值（Context Limit）时。
2. **摘要生成**：后端将待裁切的消息片段封装进内存 `AgentSession`，调用 `SessionSummaryManager` 生成摘要。
3. **数据流转**：后端通过 SSE (Server-Sent Events) 将新生成的摘要实时推送到前端。
4. **前端持久化**：前端接收到摘要后，更新 Zustand Store 并将其保存到 `conversations` 表的 `session_summary` 字段。
5. **下次请求**：前端在后续请求中携带该摘要，后端将其注入上下文。

---

## Technical Details

### 1. Database Schema
在 `conversations` 表中添加一个新字段：
```sql
ALTER TABLE conversations ADD COLUMN session_summary TEXT;
```

### 2. Frontend Changes

#### `conversationsService.js` [UPDATE]
- 在所有的 `select()` 查询中增加 `session_summary` 字段。
- 确保 `updateConversation` 接口能正常处理该字段。

#### `chatStore.js` [UPDATE]
- **State**: 增加 `sessionSummary` 状态。
- **Action**: 增加 `setSessionSummary` 方法。
- **Logic**:
    - 在进入对话时（`loadConversationMessages` 流程中），从对话对象中提取 `session_summary` 并存入 Store。
    - 在 `sendMessage` 工具流中，捕获 SSE 返回的 `SummaryEvent` (type: `summary`)。
    - 一旦捕获到新摘要，立即调用 `updateConversation` 进行持久化。

#### `aiService.js` [UPDATE]
- 在 `callAIAPI` 的请求 Payload 中增加 `sessionSummary` 参数。

---

### 3. Backend Changes

#### `StreamChatRequest` (Pydantic Model) [UPDATE]
- 增加 `session_summary` 可选字段。

#### `stream_chat.py` [UPDATE]
- **智能裁切逻辑 (`_apply_context_limit`)**:
    1. 计算当前消息总数。
    2. 如果消息数 > Limit:
        - **识别历史片段**：识别出需要裁切的消息。
        - **构造 AgentSession**：
            ```python
            from agno.session.agent import AgentSession
            from agno.utils.run_response import RunResponse
            
            # 手动填充旧对话，模拟 Agno 内部数据结构
            session = AgentSession(
                session_id=request.conversation_id,
                # 将被裁切的消息封装为 RunResponse 列表
                runs=[RunResponse(content=m["content"], role=m["role"]) for m in trimmed_messages]
            )
            ```
        - **使用 SummaryManager**：
            ```python
            from agno.session.summary_manager import SessionSummaryManager
            
            manager = SessionSummaryManager(model=summarizer_model)
            # 异步调用 (非阻塞)
            summary_obj = await manager.acreate_session_summary(session)
            ```
        - **模型选择策略**:
            - 手动模式：使用当前选中 Agent 的 `lite_model`。
            - Auto 模式：Fallback 到当前空间（Space）默认 Agent 的 `lite_model`。
        - **推送 SummaryEvent**:
            ```json
            {
              "type": "summary",
              "summary": "...",
              "topics": ["topic1", "topic2"],
              "updated_at": "..."
            }
            ```
- **摘要注入**:
    - 如果请求中包含 `session_summary`，则在消息流起始位置插入一条 System 消息：`"Current Conversation Summary: {summary}"`。

---

## Model Selection Strategy

| 对话模式 | 摘要模型 (Summarizer Model) | 依据 |
| :--- | :--- | :--- |
| **手动模式 (Manual)** | 选中 Agent 的 `lite_model` | 尊重用户选择的智能体配置 |
| **全自动模式 (Auto)** | 空间默认 Agent 的 `lite_model` | 空间定义了业务领域，默认 Agent 是最佳兜底 |

---

## Implementation Roadmap

### Phase 1: Infrastructure
- [ ] 执行数据库迁移 (SQL)。
- [ ] 更新 `conversationsService.js` 和 `StreamChatRequest` 模型。

### Phase 2: Backend Logic
- [ ] 在 `stream_chat.py` 中实现内存 `AgentSession` 的构造。
- [ ] 集成 `SessionSummaryManager`。
- [ ] 实现摘要注入逻辑。

### Phase 3: Frontend & SSE
- [ ] 在 `chatStore.js` 中捕获并持久化 `SummaryEvent`。
- [ ] 验证全流程：长对话触发 -> 后端生成摘要 -> 前端保存 -> 刷新页面 -> 摘要恢复。
