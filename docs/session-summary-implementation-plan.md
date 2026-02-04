# Agno Session Summary Implementation Plan

## 🎯 目标
使用 Agno 原生 Session Summary 功能，实现长对话的自动摘要与上下文精简，彻底解决 Token 消耗过大和上下文丢失问题。

## ✅ 最终实施方案：双轨制记忆管理 (Dual-Track Memory)

我们采用了 **"双轨制"** 策略来平衡实时对话的连贯性和长期的记忆保持。

### 1. 核心机制
*   **Track A (短期记忆)**：直接保存完整的原始消息（Message History）。
    *   **限制**：由 `num_history_runs` 控制（当前设为 2，即保留最近 2 轮问答）。
    *   **作用**：保证最近几轮对话的细节绝对精确，支持多轮表单问答的原子性。
*   **Track B (长期记忆)**：自动生成的会话摘要 (Session Summary)。
    *   **触发**：每轮对话结束后，后端自动启动独立任务生成摘要。
    *   **作用**：当 Track A 的原始消息超限被丢弃时，System Prompt 会自动注入最新的 Summary，让 AI "回想起" 之前的对话要点。

### 2. 关键配置
*   **后端模型**：
    *   主对话模型：由前端 `model` 参数指定（如 GPT-4）。
    *   摘要模型：由 `.env` 中的 `MEMORY_LITE_MODEL` 指定（推荐 GLM-4-Flash 等轻量模型，速度快成本低）。
*   **数据库**：
    *   使用 Supabase Postgres 的 `ai.agno_sessions` 表存储 Session 数据。
    *   连接方式：**Supabase Pooler (Port 6543)**，确保高并发下的连接稳定性。

### 3. 已解决的技术难点
*   **History Duplication (历史重复)**：
    *   **问题**：前端传入全量消息 + Agno 自动加载数据库历史 = AI 看到双份消息。
    *   **解决**：在 `stream_chat.py` 中增加逻辑，仅将 **【System Prompts (时间/工具) + 最后一条用户消息】** 传给 Agent，其余历史交由 Agno 自动从数据库加载。
*   **DB Connection Stability (数据库不稳)**：
    *   **问题**：直连 5432 端口频繁断开 (`server closed unexpectedly`)。
    *   **解决**：切换至 Supabase Transaction Pooler (6543端口) 并移除冗余的 eager initialization 逻辑。
*   **GLM JSON Parsing (GLM 解析错误)**：
    *   **问题**：GLM-4 不支持 OpenAI 格式的 `native_structured_outputs`。
    *   **解决**：在 `agent_registry.py` 中针对摘要模型强制禁用 `supports_native_structured_outputs`。

## 📝 环境变量 (.env)
```bash
# 必须配置 Memory Lite Model 用于生成摘要
MEMORY_LITE_PROVIDER=glm
MEMORY_LITE_MODEL=glm-4-flash
MEMORY_AGENT_API_KEY=your-glm-key
MEMORY_LITE_BASE_URL=https://open.bigmodel.cn/api/paas/v4
```

## 🚀 验证方法
1. 发起多轮对话（超过 `num_history_runs` 设置的轮数）。
2. 询问 AI：“我第一轮问了什么？”。
3. 如果 AI 能准确回答，且数据库 `agno_sessions` 表中的 `session_data` 字段有更新 summary，即验证成功。

## 🔮 未来优化方向 (Future Optimizations)

### 1. 摘要质量调优 (Prompt Engineering)
当前的摘要逻辑追求“短小精悍”。若需要保存更多对话细节（如代码片段、具体数值），可以通过 `session_summary_prompt` 定制指令：
```python
# 示例：要求更详尽的摘要
session_summary_manager = SessionSummaryManager(
    model=summary_model,
    session_summary_prompt="""
    Analyze the conversation and generate a DETAILED summary.
    - Preserve key technical decisions and code snippets concepts.
    - Track user preferences specifically.
    - Maintain a timeline of key events.
    """
)
```

### 2. 前端动态控制 (Frontend Integration)
*   **上下文长度**：开放 `context_message_limit` 设置，允许用户在前端滑动调整（对应后端 `num_history_runs`）。
*   **摘要模型选择**：允许用户在前端设置中切换不同的摘要模型（如 GLM-4-Flash vs GPT-4o-mini），以平衡成本与质量。

### 3. 混合检索增强 (Hybrid Search)
*   未来可以将生成的 Summary 进行向量化 (Embeddings)。
*   在超长对话中，除了注入最新的 Summary，还可以检索历史 Summary，实现跨越数千轮对话的记忆召回。
