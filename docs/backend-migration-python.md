# 后端迁移文档：Node.js → Python (FastAPI + Agno)

本文档记录了将 Qurio 后端从 Node.js 迁移到 Python 的过程、主要变化和技术决策。

## 迁移概览

| 方面 | Node.js | Python (新) |
|------|---------|-------------|
| Web 框架 | Express | FastAPI |
| AI 框架 | Direct API calls | Agno |
| 工具执行 | 内部实现 | Agno external_execution |
| API 格式 | REST + SSE | REST + SSE (兼容) |
| 配置管理 | dotenv | Pydantic Settings |

### 迁移进度

| API 端点 | 状态 |
|----------|------|
| `POST /api/stream-chat` | ✅ 已迁移 |
| `POST /api/related-questions` | ⏳ 待迁移 |
| `GET/POST /api/tools` | ⏳ 待迁移 |
| `POST /api/research-plan` | ⏳ 待迁移 |
| `POST /api/title-space-agent` | ⏳ 待迁移 |
| `POST /api/agent-for-auto` | ⏳ 待迁移 |
| `POST /api/title` | ⏳ 待迁移 |
| `GET /api/mcp-tools` | ⏳ 待迁移 |
| `POST /api/title-and-space` | ⏳ 待迁移 |
| `POST /api/deep-research-chat` | ⏳ 待迁移 |
| `GET /api/daily-tip` | ⏳ 待迁移 |

### 当前实现

当前实现是 Node.js stream-chat 的 Agno 包装版本，尚未完全利用 Agno 的高级特性：

| Agno 特性 | 使用状态 | 说明 |
|-----------|----------|------|
| Agent 模型包装 | ✅ 已使用 | 用于统一多 Provider API |
| 流式事件处理 | ✅ 已使用 | RunEvent、RunContentEvent |
| external_execution | ✅ 已使用 | 暂停 Agent 执行外部工具 |
| Agent Teams | ❌ 未使用 | 多 Agent 协作能力 |
| 内置工具库 | ❌ 未使用 | 仍用自定义工具 |
| 记忆/存储 | ❌ 未使用 | Agno 持久化能力 |
| Structured Output | ❌ 未使用 | Pydantic 输出验证 |

#### 技术债务

- 工具仍通过 `external_execution=True` 手动执行，未完全利用 Agno 工具生态
- stream_chat.py 保留了 Node.js 风格的循环和消息处理逻辑
- 未使用 Agno 的多 Agent 协作能力

后续可逐步重构以充分利用 Agno 的全部功能。

### 1. 项目结构

```
backend-node/                    backend-python/
├── src/                         src/
│   ├── api/                     ├── main.py              # 入口
│   │   └── stream-chat.js       ├── config.py            # 配置
│   ├── services/                ├── models/
│   │   ├── llm.js               │   └── stream_chat.py   # Pydantic 模型
│   │   ├── search.js            ├── providers/
│   │   ├── tools.js             │   ├── base.py          # 基础适配器
│   │   └── ...                  │   ├── openai.py        # OpenAI 适配器
│   └── utils/                   │   ├── other_providers.py
│       └── sse.js               │   └── factory.py
│                                ├── services/
├── routes/                      │   ├── stream_chat.py   # 主服务
│   └── stream-chat.js           │   └── tools.py         # 工具实现
│                                ├── routes/
└── run.js                       │   └── stream_chat.py
                                 └── utils/
                                     └── sse.py
```

### 2. Provider 适配器模式

**Node.js**: 直接调用各 Provider API
```javascript
// node.js/src/services/llm.js
const providers = {
  openai: new OpenAIProvider(),
  glm: new GLMProvider(),
  // ...
};
```

**Python**: 使用 Agno 框架的适配器模式
```python
# python/src/providers/openai.py
class OpenAIAdapter(BaseProviderAdapter):
    def build_model(self, api_key, model, base_url, **kwargs):
        return OpenAIChat(id=model, api_key=api_key)

    async def execute(self, context, api_key, model, base_url):
        # 使用 Agno Agent 流式执行
        async for chunk in agent.arun(**run_kwargs):
            yield chunk
```

### 3. 工具调用机制

**关键变化**: 使用 Agno 的 `external_execution=True` 实现外部工具执行

```python
# python/src/providers/openai.py
def _create_tool_function(tool_name: str, tool_def: dict):
    """创建 Agno 工具函数，标记为外部执行"""
    agno_func = Function(
        name=tool_name,
        description=description,
        parameters=parameters,
        external_execution=True,  # 关键：告诉 Agno 暂停等待外部执行
    )
    return agno_func
```

当 Agent 需要调用工具时：
1. Agno 发出 `RunPausedEvent`
2. 我们提取工具信息 (`tool_name`, `tool_args`)
3. 在后端执行工具 (如 Tavily 搜索)
4. 将结果作为 `tool_result` 事件发出
5. 创建新的 Agent 运行，将工具结果注入消息

### 4. StreamChunk 数据结构

```python
# python/src/providers/base.py
@dataclass
class StreamChunk:
    type: Literal["text", "thought", "tool_calls", "done", "error"]
    content: str = ""
    thought: str = ""
    tool_calls: list[dict] | None = None
    finish_reason: str | None = None
    error: str | None = None
```

### 5. ExecutionContext

```python
# python/src/providers/base.py
@dataclass
class ExecutionContext:
    messages: list[dict[str, Any]]
    tools: list[dict[str, Any]] | None = None
    tool_choice: Any = None
    temperature: float | None = None
    top_p: float | None = None
    thinking: dict[str, Any] | None = None
    stream: bool = True
    tavily_api_key: str | None = None  # 从前端传入
```

## SSE 事件格式 (兼容)

```json
// 文本内容
{"type": "text", "content": "你好！"}

// 思考/推理
{"type": "thought", "content": "让我思考一下..."}

// 工具调用
{"type": "tool_call", "id": "xxx", "name": "Tavily_web_search", "arguments": "{\"query\": \"NBA\"}"}

// 工具结果
{"type": "tool_result", "id": "xxx", "name": "Tavily_web_search", "status": "done", "output": {"answer": "...", "results": [...]}}

// 完成
{"type": "done", "content": "...", "thought": "...", "sources": [...]}

// 错误
{"type": "error", "error": "错误信息"}
```

## 调试技巧

### 启用 Agno 调试
```bash
DEBUG_AGNO=1 python run.py
```

### 关键日志
- `[DEBUG] Registered X tools: [...]` - 工具注册情况
- `[DEBUG] RunPausedEvent: RunPaused` - 工具调用触发
- `[DEBUG] _handle_paused_run called` - 开始处理工具
- `[DEBUG] tavily_api_key received: True` - API key 接收确认
- `[DEBUG] Tool result: {...}` - 工具执行结果

## 遇到的问题与解决方案

### 1. RunPausedEvent 未处理
**问题**: Agno 发出 `RunPausedEvent` 但代码没有处理
**解决**: 添加 `RunEvent.run_paused` 分支，捕获暂停事件

### 2. external_execution 需要数据库
**问题**: `agent.acontinue_run()` 需要数据库配置
**解决**: 改用创建新 Agent 运行的方式，手动将工具结果注入消息

### 3. 工具函数参数不匹配
**问题**: `Unexpected keyword argument` 错误
**解决**: 使用 `Function` 类并正确传递 `parameters` schema

### 4. RunRequirement 对象没有 get 方法
**问题**: `tool_info["requirement"].get("id", "")` 失败
**解决**: 改用 `getattr(requirement, "id", default)`

### 5. tool_result 事件未转发到前端
**问题**: provider yield 了 tool_result 但 stream_chat.py 没有处理
**解决**: 添加 `case "tool_result"` 分支处理

## 工具注册流程

```
前端请求 (toolIds: ["Tavily_web_search"])
    ↓
stream_chat.py: get_tool_definitions_by_ids()
    ↓
tools.py: 返回工具定义
    ↓
providers/openai.py: _register_tools()
    ↓
创建 Agno Function (external_execution=True)
    ↓
Agent 运行 → 触发工具 → RunPausedEvent
```

## API 兼容性

Python 后端完全兼容 Node.js 前端：

- 相同的请求格式
- 相同的 SSE 事件格式
- 相同的工具定义格式
- 相同的 provider 配置

## 端口切换

```bash
# Node.js (端口 3001)
cd backend-node && node run.js

# Python (端口 3002)
cd backend-python && python run.py
```

## 未来优化方向

1. **工具缓存**: 避免每次请求重复创建工具函数
2. **并行工具执行**: 同时执行多个独立工具调用
3. **工具结果流式返回**: 大型工具结果分块返回
4. **错误恢复**: 工具执行失败时自动重试
