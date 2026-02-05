# Custom Session Summary Implementation Plan

## 🎯 目标
移除 Agno 原生 Session Summary（因其强依赖 DB 且同步阻塞导致高延迟），改为**应用层纯手动实现的 "Rolling Summary" 机制**。
目标是实现**零延迟**的主对话体验，同时保持 Agno Session Summary 的核心能力（长期记忆+短期细节）。

## ✅ 最终实施方案：异步滚动摘要 (Async Rolling Summary)

我们不再依赖 Agent 内部的 Storage 或 Memory 模块，而是将摘要逻辑剥离为独立的**后台服务**。

### 1. 核心架构
*   **读取路径 (Fast Path)**：
    *   User Request -> Backend
    *   后端并行读取：
        1.  `conversations.session_summary` (长期记忆)
        2.  `messages` (最近 N 轮，短期记忆)
    *   **Prompt 组装**：`System(Summary) + Messages(History)`
    *   调用 LLM -> 流式返回
*   **写入路径 (Slow Path / Async)**：
    *   LLM 响应结束 -> 触发后台任务 (Fire-and-forget)
    *   输入：`Old Summary` + `New User/AI Messages`
    *   模型：**Lite Model** (如 GLM-4-Flash, GPT-4o-mini)
    *   输出：`New Summary`
    *   动作：`UPDATE conversations SET session_summary = ...`

### 2. 详细逻辑设计

#### A. 数据库变更
在 `conversations` 表中新增字段：
```sql
ALTER TABLE conversations ADD COLUMN session_summary JSONB DEFAULT NULL;
```
结构：
```json
{
  "summary": "Full text summary...",
  "topics": ["topic1", "topic2"],
  "last_run_id": "uuid..."
}
```

#### B. 上下文构建策略 (Overlap Strategy)
*   **System Prompt**: 只要 `session_summary` 不为空，永远注入到 System Message 顶部。
*   **Message Window**: 永远保留最近 `num_history_runs` (例如 2-4 轮)。
    *   **关键点**：Summary 和 History 是**并行存在**的，不是互斥的。Summary 提供背景，History 提供细节和原有措辞。

#### C. 工具调用处理
*   **Main Context**: 必须完整保留 `ToolCall` 和 `ToolResult`，否则模型会报错。
*   **Summary Generation**: 丢弃中间步骤，只取 **User Input** 和 **Final AI Response** 进行摘要。

### 3. 代码改造点

#### 后端 (`backend-python`)
1.  **`stream_chat.py` (API Endpoint)**
    *   移除 Agent 初始化的 `storage`, `db`, `add_session_summary_to_context` 参数。
    *   手动查询 `conversations` 表获取摘要。
    *   手动查询 `messages` 表获取历史。
    *   手动将摘要拼接到 `instructions`。
    *   响应结束后调用 `update_session_summary`。

2.  **`agent_registry.py`**
    *   移除 `SessionSummaryManager` 相关初始化代码。
    *   保留 `get_summary_model` 供后台任务使用。

3.  **新增 `services/summary_service.py`**
    *   实现 `update_session_summary(conversation_id, old_summary, new_messages)`。
    *   使用 Lite Model 生成 JSON。

### 4. 环境变量
沿用现有的 Lite Model 配置：
```bash
MEMORY_LITE_PROVIDER=glm
MEMORY_LITE_MODEL=glm-4-flash
MEMORY_AGENT_API_KEY=...
```

## 🚀 验证计划 (已完成 ✅)
1.  **性能测试**：对比改造前后的 TTFT (Time to First Token) 和 Total Latency。预期主对话延迟应大幅下降。
    - **结果**：主对话响应即时，摘要生成在后台异步进行 (<50ms trigger overhead)，不阻塞用户。
2.  **功能验证**：
    -   长对话测试：进行 10+ 轮对话。
    -   检查 DB：`conversations.session_summary` 是否在后台更新。
    -   检查 Context：下一轮对话是否正确带入了 Summary。
    -   **结果**：所有功能验证通过。

## 🛡️ 架构鲁棒性与已修复问题
- **数据一致性 (Data Integrity)**: 已在 `summary_service.py` 实现 "Re-fetch before Update" 模式。即使前台请求并发发生，后台任务也会在生成前一刻拉取最新的数据库摘要进行合并，防止了竞争条件下的数据覆盖。
- **工具调用隔离 (Tool Call Safety)**: `stream_chat.py` 显式过滤了 Tool Call 和中间步骤，只向 Summary Agent 传递 User 和 Assistant 文本，确保摘要生成不受复杂工具链的影响。
- **架构解耦**: 彻底移除了 Agno 原生 Storage 依赖，采用了纯手动控制的 `db_adapters` 和异步任务队列。
- **Prompt 优化**: 修复了 f-string 格式错误，并增强了 Prompt 指令以强制输出 JSON Schema 和高层级 Topic。
