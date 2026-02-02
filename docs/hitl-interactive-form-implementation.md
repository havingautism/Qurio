# HITL Interactive Form Implementation

## 背景

### 当前实现的痛点

之前的 `interactive_form` 实现存在以下问题：

1. **多消息合并复杂**：需要手动合并多个 AI 消息 + 隐藏的用户表单提交消息
2. **消息链断裂**：跨越两个独立的 `agent.run()` 调用，导致：
   - 必须手动构造 `tool_result:pending` 消息
   - 必须注入 `dummy assistant` 消息以满足 OpenAI 格式要求
3. **前端合并逻辑复杂**：`textIndex` 偏移计算、虚拟工具标记注入等
4. **上下文污染**：`[Form Submission]` 格式化字符串占用 token

### 目标

使用 **Agno HITL (Human-in-the-Loop)** 机制重构交互式表单，实现：

- ✅ 单个 `run` 内完成表单交互（无需多消息合并）
- ✅ 消除 `tool_result:pending` 和 `dummy assistant` 消息
- ✅ 保留现有 `interactive_form` 工具定义（前端无需改动）
- ✅ 简化前端渲染逻辑
- ✅ 完整保留工具调用、思考过程、搜索来源等中间状态

---

## Agno HITL 模式选择

### 官方提供的 4 种 HITL 模式

| 模式 | 适用场景 | 是否适合 |
|------|---------|---------| | **User Confirmation** | 危险操作需要用户批准 | ❌ 我们需要收集信息，不是确认操作 |
| **User Input** | 字段固定、提前定义的表单 | ⚠️ 需要重新定义工具签名 |
| **Dynamic User Input** | LLM 自己决定需要哪些字段 | ⚠️ 需要废弃现有工具 |
| **External Execution** | 工具在外部环境执行 | ✅ 保留现有工具，优雅集成 |

### 最终方案：**External Execution**

**核心思路：**
- 保留现有 `interactive_form` 工具定义（参数：`id`, `title`, `fields`）
- 在工具定义时标记 `external_execution=True`，让 Agno 自动暂停 run
- 将表单提交数据通过 `set_external_execution_result()` 传递给工具
- 利用 `agent.acontinue_run()` 恢复执行，Agno 处理所有中间状态

**优势：**
- ✅ 保留现有工具定义，前端无需改动
- ✅ Agno 官方推荐模式，框架原生支持
- ✅ 自动保留所有中间事件（tool calls, thoughts, sources）
- ✅ 单个 run 内完成，无需手动合并消息
- ✅ 代码简洁，无需手动构造 dummy assistant

---

## 实现方案

### 核心流程

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant Backend
    participant Supabase
    participant Agno

    User->>Frontend: 发送消息："帮我预订餐厅"
    Frontend->>Backend: POST /api/stream-chat
    Backend->>Agno: agent.arun(stream=True, stream_events=True)
    Agno-->>Backend: content_delta: "好的，我来帮你..."
    Backend-->>Frontend: SSE: {type: "text"}
    
    Agno-->>Backend: tool_call_started: interactive_form
    Backend-->>Frontend: SSE: {type: "tool_calls"}
    
    Agno-->>Backend: RunPausedEvent (needs_external_execution=True)
    Backend->>Backend: 提取 requirements
    Backend->>Supabase: 保存 run_id + requirements
    Backend-->>Frontend: SSE: {type: "form_request"}
    
    Frontend->>User: 渲染表单
    User->>Frontend: 填写并提交表单
    Frontend->>Backend: POST /api/stream-chat (run_id + field_values)
    Backend->>Supabase: 读取 requirements
    Backend->>Backend: 调用 req.set_external_execution_result(json.dumps(field_values))
    Backend->>Agno: agent.acontinue_run(run_id, requirements, stream_events=True)
    Agno-->>Backend: content_delta: "收到！已为你..."
    Backend-->>Frontend: SSE: {type: "text"}
    Backend->>Supabase: 删除 pending_forms 记录
```

### 关键技术点

#### 1. 工具定义（External Execution）

在 `src/services/custom_tools.py` 中定义工具时标记 `external_execution=True`：

```python
from agno.tools.function import Function

interactive_form_tool = Function(
    name="interactive_form",
    description="Create an interactive form to collect information from the user",
    parameters={
        "type": "object",
        "properties": {
            "id": {"type": "string", "description": "Unique identifier for the form"},
            "title": {"type": "string", "description": "Form title"},
            "fields": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "type": {"type": "string"},
                        "label": {"type": "string"},
                        # ... other field properties
                    }
                }
            }
        },
        "required": ["id", "title", "fields"]
    },
    external_execution=True,  # 关键：标记为外部执行
)
```

#### 2. 检测暂停并保存状态

在 `stream_chat.py` 中监听 `RunPausedEvent`：

```python
async for run_event in agent.arun(stream=True, stream_events=True):
    # 检测 HITL 暂停
    if hasattr(run_event, 'is_paused') and run_event.is_paused:
        requirements = getattr(run_event, 'requirements', None)
        
        # 保存到 Supabase
        await hitl_storage.save_pending_run(
            run_id=run_event.run_id,
            conversation_id=request.conversation_id,
            requirements=requirements
        )
        
        # 提取表单字段并通知前端
        form_fields = extract_form_fields_from_requirements(requirements)
        yield FormRequestEvent(
            run_id=run_event.run_id,
            fields=form_fields
        ).model_dump()
        return
```

#### 3. 恢复执行并填充结果

在用户提交表单后调用 `acontinue_run`：

```python
async def _continue_hitl_run(request: StreamChatRequest):
    # 从 Supabase 恢复
    requirements = await hitl_storage.get_pending_run(request.run_id)
    
    # 填充外部执行结果
    for req in requirements:
        if hasattr(req, 'needs_external_execution') and req.needs_external_execution:
            # 将表单数据序列化为 JSON 字符串
            req.set_external_execution_result(json.dumps(field_values))
    
    # 继续同一个 run，启用事件流
    stream = agent.acontinue_run(
        run_id=request.run_id,
        session_id=request.conversation_id,
        requirements=requirements,
        stream=True,
        stream_events=True,  # 关键：确保中间事件被emit
    )
    
    # 处理恢复后的事件流（与主流程完全一致）
    async for run_event in stream:
        # ... 处理 tool_call_started, tool_call_completed, content_delta 等事件
```

#### 4. 状态存储（Supabase）

**数据库表设计：**

```sql
CREATE TABLE pending_form_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id TEXT UNIQUE NOT NULL,
    conversation_id UUID,
    
    -- 序列化的 requirements 对象
    requirements_data JSONB NOT NULL,
    
    -- 状态管理
    status TEXT DEFAULT 'pending',
    
    -- 元数据
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 minutes'),
    
    -- 索引
    INDEX idx_run_id (run_id),
    INDEX idx_conversation_id (conversation_id),
    INDEX idx_expires_at (expires_at),
    INDEX idx_status_expires (status, expires_at)
);
```

**序列化/反序列化实现：**

参考 `backend-python/src/services/hitl_serializer.py`，核心逻辑：

```python
def serialize_requirements(requirements: list) -> list[dict]:
    return [
        {
            "needs_external_execution": getattr(req, 'needs_external_execution', False),
            "tool_execution": {
                "tool_name": req.tool_execution.tool_name,
                "tool_args": req.tool_execution.tool_args,
                "tool_call_id": req.tool_execution.tool_call_id,
            } if hasattr(req, 'tool_execution') and req.tool_execution else None,
            # ... 其他字段
        }
        for req in requirements
    ]

def deserialize_requirements(data: list[dict]) -> list:
    from agno.run.requirement import Requirement, ToolExecution
    
    return [
        Requirement(
            needs_external_execution=item['needs_external_execution'],
            tool_execution=ToolExecution(**item['tool_execution']) if item['tool_execution'] else None,
        )
        for item in data
    ]
```

#### 5. 路由复用

**关键：复用现有的 `/stream-chat` 路由，通过 `run_id` 区分首次请求和恢复请求**

```python
@router.post("/stream-chat")
async def stream_chat(request: StreamChatRequest):
    service = StreamChatService()
    
    # 检测是否是 HITL 恢复请求
    if request.run_id and request.field_values:
        # 恢复模式
        return EventSourceResponse(
            service.stream_chat(request)  # 内部路由到 _continue_hitl_run
        )
    else:
        # 正常模式
        return EventSourceResponse(
            service.stream_chat(request)
        )
```

**前端调用示例：**

```javascript
// 首次请求
POST /api/stream-chat {
    provider: "glm",
    messages: [...],
    conversation_id: "uuid",
    ...
}

// 提交表单后（恢复请求）
POST /api/stream-chat {
    run_id: "xxx-xxx-xxx",
    conversation_id: "uuid",
    field_values: {
        date: "2026-02-03",
        time: "19:00",
        party_size: 2
    }
}
```

---

## 数据流对比

### 旧方案（手动合并）

```
1. user: "帮我预订餐厅"
2. assistant: "好的..." + tool_call(interactive_form)
3. tool_result: {status: "pending"}  ← 污染上下文
4. [stream 暂停]
5. user(hidden): "[Form Submission]\ndate: 2026-02-03\n..."  ← 格式化字符串
6. assistant: "收到！..."

消息数：6 条
需要合并：✅ 是
dummy assistant：✅ 需要
中间状态：❌ 丢失（工具调用、思考过程等）
```

### 新方案（External Execution + HITL）

```
1. user: "帮我预订餐厅"
2. assistant: "好的..." + [表单交互] + "收到！..."
   ↑ 单个 run，中途暂停等待外部执行，恢复后继续
   ↑ 所有中间事件（tool_calls, thoughts, sources）完整保留

消息数：2 条
需要合并：❌ 否
dummy assistant：❌ 不需要
中间状态：✅ 完整保留（Agno 自动处理）
```

---

## 配置要求

### 环境变量 (.env)

```bash
# Supabase 配置（HITL 状态存储）
SUPABASE_PROJECT_NAME=your-project-name  # 例如：otcwmjimcftovpnnzweb
SUPABASE_PASSWORD=your-database-password

# Supabase 连接自动构造为：
# postgresql://postgres:{password}@db.{project_name}.supabase.co:5432/postgres
```

### Python 依赖

已在 `pyproject.toml` 中包含：

```toml
[tool.uv.dependencies]
agno = "^0.1.0"  # 包含 HITL 支持
supabase = "^2.0.0"  # Supabase 客户端（用于存储）
```

### Supabase 配置

1. **创建项目**：在 [Supabase Dashboard](https://supabase.com/dashboard) 创建项目
2. **获取数据库密码**：Settings → Database → Database Password
3. **运行 SQL 脚本**：SQL Editor 中执行上述 `pending_form_runs` 表创建语句
4. **配置 RLS**（可选）：如果需要行级安全策略，参考 Supabase 文档

---

## 实现细节

### 已实现的功能

#### ✅ 后端核心

- **工具定义**：`src/services/custom_tools.py` - `interactive_form` 工具标记 `external_execution=True`
- **事件检测**：`src/services/stream_chat.py` - 检测 `RunPausedEvent` 并保存状态
- **状态管理**：`src/services/hitl_storage.py` - Supabase CRUD 操作
- **序列化**：`src/services/hitl_serializer.py` - Requirements 序列化/反序列化
- **恢复逻辑**：`src/services/stream_chat.py:_continue_hitl_run()` - 调用 `acontinue_run` 并填充结果
- **事件流**：`acontinue_run(stream_events=True)` - 确保工具调用、思考、来源等事件完整emit

#### ✅ 前端集成

- **表单渲染**：`src/components/chat/InteractiveFormCard.jsx` - 渲染 `form_request` 事件
- **提交处理**：`src/lib/chat/aiService.js` - 调用 `/stream-chat` 传入 `run_id` 和 `field_values`
- **消息复用**：HITL 恢复时复用已有消息气泡，不创建新消息
- **数据合并**：`finalizeMessage` 使用 `updateMessageById` 更新而非插入新记录

#### ✅ 数据持久化

- **单条消息**：UI 和数据库中仅保留一条完整的助手回复
- **工具调用合并**：前后工具调用正确accumulate，无重复或覆盖
- **内容追加**：AI 文本内容完整追加，无丢失

---

## 测试指南

### 单轮表单测试

```javascript
// 用户输入："帮我计划一次上海旅行"
// 预期流程：
1. AI 触发 interactive_form（标题、日期、预算等字段）
2. 用户填写并提交
3. AI 基于表单数据继续生成方案（可能调用搜索工具）
4. 最终只有 2 条消息：user + assistant（包含完整中间过程）
```

### 验证清单

- [ ] 表单正确渲染（字段、标题、描述）
- [ ] 提交后 AI 恢复执行（无报错）
- [ ] 工具调用卡片显示（搜索、API调用等）
- [ ] 思考过程显示（如果模型支持）
- [ ] 搜索来源正确收集和展示
- [ ] 相关问题正确生成（基于完整上下文）
- [ ] 数据库只有 2 条消息（user + assistant）
- [ ] 刷新页面后状态正确恢复

---

## 潜在风险与解决方案

| 风险 | 影响 | 解决方案 |
|------|------|---------| | Supabase 连接失败 | 无法保存状态 | 降级为内存缓存（开发环境） |
| 序列化失败 | 恢复时报错 | 添加详细日志，捕获异常 |
| run_id 冲突 | 状态被覆盖 | Agno 自动生成 UUID，风险极低 |
| 过期记录堆积 | 占用存储空间 | 定时清理 + `expires_at` 索引 |
| 用户重复提交 | 重复恢复 run | 幂等性保护（检查 `status` 字段） |
| stream_events 丢失 | UI 缺少中间过程 | 确保 `acontinue_run(stream_events=True)` |

---

## 参考文档

- [Agno HITL Overview](https://docs.agno.com/hitl/overview)
- [External Execution](https://docs.agno.com/hitl/external-execution)
- [Agent.acontinue_run API](https://docs.agno.com/api-reference/agent#acontinue_run)
- [Supabase Python Client](https://supabase.com/docs/reference/python/introduction)

---

## 未来优化

1. **支持 Dynamic User Input**：允许 Agent 自己决定表单字段（完全自主）
2. **多轮表单链**：自动检测和管理连续多个表单（目前会报错）
3. **表单预填充**：基于对话上下文智能预填某些字段
4. **离线降级**：Supabase 不可用时使用 Redis/内存缓存
5. **表单版本控制**：schema 变更时的兼容性处理
