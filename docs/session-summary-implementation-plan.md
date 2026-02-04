# Session Summary Implementation Plan

## Objective
利用 Agno 原生 Session Summary 功能实现单对话内的长上下文管理，自动降低 Token 成本并防止上下文丢失。

## Architecture Overview

采用 **Agno 原生管理** 架构，完全由后端自动处理 Session 存储和摘要生成。

### 核心原理
1. **自动存储**：Agno Agent 自动将对话历史存储到 `agno_sessions` 表
2. **智能裁切**：通过 `num_history_runs` 参数控制上下文窗口大小
3. **自动摘要**：当历史超过限制时，Agno 自动生成摘要并注入上下文
4. **前端透明**：前端无需任何修改，继续使用 `conversations` 和 `conversation_messages` 表

---

## Data Architecture

```
数据库架构：

1. 前端数据表（保持不变）
   conversations
   ├── id, title, space_id, agent_id, ...
   └── 用于对话列表和元数据管理
   
   conversation_messages
   ├── id, conversation_id, role, content, ...
   └── 用于前端 UI 显示完整对话历史

2. Agno 数据表（自动管理）
   agno_sessions (Agno 自动创建)
   ├── session_id (= conversation_id)
   ├── runs (完整对话历史，含工具调用)
   ├── summary (自动生成的摘要)
   └── 用于 AI 上下文管理和摘要生成
```

**关键映射关系：**
- `session_id` = `conversation_id`（1对1映射）
- 前端表用于 UI 显示
- Agno 表用于 AI 上下文管理

---

## Implementation Details

### 1. Backend Configuration

在 `agent_registry.py` 的 Agent 初始化中添加配置：

```python
from agno.agent import Agent
from agno.db.postgres import PostgresDb

agent = Agent(
    model=your_model,
    
    # ===== Session Storage =====
    db=PostgresDb(
        db_url="你的数据库连接字符串",
        session_table="agno_sessions"  # Agno 会自动创建此表
    ),
    
    # ===== Chat History Management =====
    add_history_to_context=True,      # 启用历史加载
    num_history_runs=5,                # 加载最近 5 轮对话
    # 或者用消息数量控制：
    # num_history_messages=20,         # 最多加载 20 条消息
    
    # ===== Session Summary =====
    enable_session_summaries=True,           # 启用自动摘要
    add_session_summary_to_context=True,     # 自动注入摘要到上下文
    
)

# 调用示例
response = agent.run(
    input=messages,
    session_id=conversation_id,  # 传递 conversation_id 作为 session_id
    user_id=user_id,
)
```

**参数说明：**

| 参数 | 说明 | 推荐值 |
|------|------|--------|
| `num_history_runs` | 加载最近 N 轮对话 | `3-10`（平衡性能和上下文） |
| `num_history_messages` | 加载最多 N 条消息 | `20-50`（可与 `num_history_runs` 同时使用） |
| `enable_session_summaries` | 启用自动摘要 | `True` |
| `add_session_summary_to_context` | 自动注入摘要 | `True` |

---

### 2. Summary Model Selection Strategy

**自动使用 lite_model 生成摘要（降低成本）：**

```python
from agno.session.summary_manager import SessionSummaryManager

# 获取摘要模型（按优先级 Fallback）
def get_summary_model(request):
    """
    优先级：
    1. 当前对话 Agent 的 lite_model
    2. 空间默认 Agent 的 lite_model  
    3. 全局默认 Agent 的 lite_model
    """
    current_agent = get_agent_for_provider(request)
    
    # 优先使用当前 agent 的 lite_model
    if current_agent and current_agent.lite_model:
        return current_agent.lite_model
    
    # Fallback 到空间默认 agent
    if request.space_id:
        space_default_agent = get_space_default_agent(request.space_id)
        if space_default_agent and space_default_agent.lite_model:
            return space_default_agent.lite_model
    
    # 最后 fallback 到全局默认
    global_default_agent = get_global_default_agent()
    return global_default_agent.lite_model if global_default_agent else None

# 创建 Agent 时使用
lite_model = get_summary_model(request)
agent = Agent(
    model=your_model,
    db=db,
    enable_session_summaries=True,
    add_session_summary_to_context=True,
    num_history_runs=5,
    session_summary_manager=SessionSummaryManager(model=lite_model) if lite_model else None,
)
```

**优势：**
- ✅ 自动选择，用户无感知
- ✅ 使用 lite_model 降低摘要生成成本
- ✅ 保持语义一致性（同 agent 体系）
- ✅ 多层 fallback 保证可用性

---

### 3. Context Window Strategy

**推荐配置：**

```python
# 推荐配置（平衡性能与准确性）
num_history_runs=5           # 加载最近 5 轮对话
num_history_messages=30       # 最多 30 条消息（双重保险）
enable_session_summaries=True # 启用自动摘要
```

**工作原理示例：**

```
第 1-45 轮对话：全部存储到 agno_sessions
第 46 轮对话：Agno 检测到历史超过 num_history_runs=5
             ↓
          自动生成摘要："用户之前讨论了 A、B、C..."
             ↓
第 47 轮对话的上下文：
  [Summary] + [第 42-46 轮完整对话] + [第 47 轮新消息]
```

---

### 4. 移除手动 Context Limit 逻辑

需要移除 `stream_chat.py` 中的手动裁切代码：

**Before (删除):**
```python
def _apply_context_limit(self, messages, limit):
    if not limit or len(messages) <= limit:
        return messages
    # 手动裁切逻辑
    return messages[-limit:]
```

**After (由 Agno 自动处理):**
```python
# 不再需要手动裁切
# Agno 通过 num_history_runs 自动管理
messages = self._inject_local_time_context(messages, request, pre_events)
```

---

### 5. 多轮表单兼容性

**✅ 完全兼容！**

当前的多轮表单实现方式与 Agno Session Summary 完美适配：

**表单数据流：**
1. Agent 调用 `interactive_form` 工具并暂停
2. 前端提交表单数据 (`field_values`)
3. 后端通过 `req.set_external_execution_result(json.dumps(field_values))` 设置结果
4. `agent.acontinue_run(requirements=requirements)` 继续执行
5. **Agno 自动记录**工具调用和结果到 `agno_sessions` 表

**摘要处理：**
- 表单交互作为一个完整的语义单元被摘要
- 摘要示例："用户通过表单提供了旅行需求：2人，7-10天，中高端预算，自然风光"
- 不会丢失表单信息

**存储分离：**
```
前端 (conversation_messages.tool_call_history):
  - 用于 UI 显示表单交互细节
  - 手动拼接的 JSON 数据

后端 (agno_sessions.runs):
  - 用于 AI 上下文和摘要生成
  - Agno 自动记录的完整工具调用历史
```

---

## Implementation Roadmap

### Phase 1: Backend Configuration
- [ ] 在 `agent_registry.py` 中配置 `db=PostgresDb(...)`
- [ ] 实现 `get_summary_model()` 函数（lite_model 自动选择）
- [ ] 添加 `enable_session_summaries=True`
- [ ] 设置 `num_history_runs=5`（推荐值）
- [ ] 配置 `session_summary_manager=SessionSummaryManager(model=lite_model)`
- [ ] 验证数据库连接和表创建权限

### Phase 2: Code Cleanup
- [ ] 移除 `stream_chat.py` 中的 `_apply_context_limit` 逻辑
- [ ] 移除相关的 `context_message_limit` 参数传递
- [ ] 确认 `session_id=conversation_id` 正确传递

### Phase 3: Testing & Validation
- [ ] 测试短对话（< 5 轮）：验证正常加载历史
- [ ] 测试长对话（> 10 轮）：验证摘要生成和注入
- [ ] 测试多轮表单：验证表单数据不丢失
- [ ] 性能测试：对比 Token 使用量

---

## Key Benefits

| 对比项 | 原方案（手动） | 新方案（Agno 原生） |
|--------|----------------|---------------------|
| **代码复杂度** | 高（需手动管理） | 低（3 个参数配置） |
| **前端改动** | 需要存储 `session_summary` | ❌ 无需改动 |
| **SSE 事件** | 需要 `SummaryEvent` | ❌ 无需额外事件 |
| **数据同步** | 前后端手动同步 | ✅ Agno 自动管理 |
| **摘要模型** | 手动选择和调用 | ✅ 自动使用配置的模型 |
| **多轮表单** | 需要特殊处理 | ✅ 原生支持 |
| **维护成本** | 高 | 低 |

---

## Notes

1. **数据表权限**
   - 确保数据库用户有创建表的权限（Agno 会自动创建 `agno_sessions` 表）
   - 如果权限受限，可以手动创建表（参考 Agno 文档）

2. **前端不受影响**
   - `conversations` 和 `conversation_messages` 表继续正常使用
   - UI 显示所有消息历史，用户体验无变化

3. **摘要模型选择**
   - 自动使用当前 Agent 的 `lite_model`（成本优化）
   - 多层 fallback 机制确保可用性
   - 用户无需配置，完全自动化

4. **性能优化**
   - `num_history_runs=5` 可减少约 60-80% 的上下文 Token
   - 摘要生成是异步的，不阻塞对话流程
   - 首次摘要生成后，后续摘要是增量更新

---

## Migration Checklist

- [ ] 阅读理解本文档
- [ ] 确认数据库连接可用
- [ ] 配置 Agent 参数（Phase 1）
- [ ] 移除手动裁切逻辑（Phase 2）
- [ ] 全面测试验证（Phase 3）
- [ ] 监控 Token 使用量变化
- [ ] 更新相关文档和注释
