# Qurio 后端 - Python (FastAPI + Agno)

这是 Qurio 后端的 Python 实现，使用 FastAPI 和 Agno AI 框架。它与现有的 Node.js 后端完全兼容，同时利用了 Agno 强大的多 Agent 能力。

## 特性

- **多 Provider 支持**: OpenAI、Gemini、SiliconFlow、GLM、Kimi、Nvidia NIM、MiniMax、ModelScope
- **SSE 流式传输**: 服务端推送事件实现实时响应流
- **工具调用**: 内置工具、自定义 HTTP 工具、MCP (Model Context Protocol) 工具
- **思考模式**: 支持推理/思考内容与响应一起返回
- **上下文管理**: 自动上下文限制处理，保留系统消息

## 项目结构

```
backend-python/
├── src/
│   ├── main.py              # FastAPI 应用入口
│   ├── config.py            # 配置管理 (Pydantic Settings)
│   ├── models/              # Pydantic 数据模型
│   │   └── stream_chat.py   # 请求/响应模式
│   ├── providers/           # 使用 Agno 的 AI provider 适配器
│   │   ├── base.py          # 基础适配器接口
│   │   ├── openai.py        # OpenAI 适配器
│   │   ├── other_providers.py # 其他 provider 适配器
│   │   └── factory.py       # Provider 工厂
│   ├── services/            # 业务逻辑
│   │   ├── stream_chat.py   # 主流聊天服务
│   │   └── tools.py         # 本地工具实现
│   ├── routes/              # API 端点
│   │   └── stream_chat.py   # /api/stream-chat 端点
│   └── utils/               # 工具函数
│       └── sse.py           # SSE 流式工具
├── pyproject.toml           # 项目依赖
├── .env.example             # 环境变量模板
└── run.py                   # 运行脚本
```

## 安装

```bash
cd backend-python

# 创建虚拟环境
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 安装依赖
pip install -e .
```

## 配置

复制 `.env.example` 到 `.env` 并配置：

```bash
# 服务器
HOST=198.18.0.1
PORT=3002

# CORS
FRONTEND_URL=http://localhost:3000
FRONTEND_URLS=http://localhost:3000,http://198.18.0.1:3000

# SSE
SSE_FLUSH_MS=50
SSE_HEARTBEAT_MS=15000

# Tavily 搜索
TAVILY_API_KEY=your_tavily_api_key

# 调试
DEBUG_STREAM=0
DEBUG_TOOLS=0
DEBUG_SOURCES=0
```

## 运行

```bash
# 开发模式（自动重载）
python run.py

# 或直接使用 uvicorn
uvicorn src.main:app --host 198.18.0.1 --port 3002 --reload
```

## API 端点

### POST /api/stream-chat

流式聊天补全（SSE）。

**请求：**
```json
{
  "provider": "openai",
  "apiKey": "sk-...",
  "model": "gpt-4o",
  "messages": [
    {"role": "user", "content": "你好！"}
  ],
  "tools": [...],
  "toolIds": ["calculator", "local_time"],
  "temperature": 0.7,
  "stream": true
}
```

**SSE 事件：**
```javascript
// 文本内容
data: {"type":"text","content":"你好"}

// 思考/推理
data: {"type":"thought","content":"让我思考一下..."}

// 工具调用
data: {"type":"tool_call","name":"calculator","arguments":"{\"expression\":\"2+2\"}"}

// 工具结果
data: {"type":"tool_result","name":"calculator","status":"done","output":{"result":4}}

// 完成
data: {"type":"done","content":"答案是 4。","thought":"...","sources":[...]}

// 错误
data: {"type":"error","error":"出现错误"}
```

## 支持的 Provider

| Provider | ID | 基础 URL | 默认模型 |
|----------|-----|----------|----------|
| OpenAI | `openai` | https://api.openai.com/v1 | gpt-4o |
| Gemini | `gemini` | https://generativelanguage.googleapis.com/v1beta | gemini-2.0-flash-exp |
| SiliconFlow | `siliconflow` | https://api.siliconflow.cn/v1 | deepseek-ai/DeepSeek-V3 |
| GLM | `glm` | https://open.bigmodel.cn/api/paas/v4 | glm-4-plus |
| Kimi | `kimi` | https://api.moonshot.cn/v1 | moonshot-v1-128k |
| Nvidia NIM | `nvidia` | https://integrate.api.nvidia.com/v1 | meta/llama-3.1-405b-instruct |
| MiniMax | `minimax` | https://api.minimax.chat/v1 | abab6.5s-chat |
| ModelScope | `modelscope` | https://api.modelscope.cn/v1 | qwen-plus |

## 内置工具

| 工具 ID | 类别 | 描述 |
|---------|------|------|
| `calculator` | 数学 | 安全计算数学表达式 |
| `local_time` | 时间 | 获取时区的当前本地时间 |
| `summarize_text` | 文本 | 通过提取句子总结文本 |
| `extract_text` | 文本 | 按关键词提取句子 |
| `json_repair` | JSON | 验证和修复 JSON |
| `webpage_reader` | 网页 | 通过 Jina AI 获取网页内容 |
| `Tavily_web_search` | 搜索 | 通过 Tavily API 进行网络搜索 |
| `Tavily_academic_search` | 搜索 | 学术论文搜索 |
| `interactive_form` | 交互 | 显示用户输入表单 |

## Agno 框架集成

此实现利用了 Agno 的强大功能：

- **Agent 框架**: 基于 Agno 的 Agent 抽象
- **模型管理**: 使用 Agno 的 model providers 实现 API 一致性
- **工具支持**: 兼容 Agno 的工具生态系统
- **存储就绪**: 设计为与 Agno 的存储后端一起工作

### 外部工具执行 (External Execution)

使用 Agno 的 `external_execution=True` 模式实现工具调用：

```python
from agno.tools.function import Function

def _create_tool_function(tool_name: str, tool_def: dict):
    """创建标记为外部执行的 Agno 工具函数"""
    agno_func = Function(
        name=tool_name,
        description=description,
        parameters=parameters,
        external_execution=True,  # 关键：告诉 Agno 暂停等待外部执行
    )
    return agno_func
```

执行流程：
1. Agent 决定调用工具 → Agno 发出 `RunPausedEvent`
2. 提取工具信息 (`tool_name`, `tool_args`)
3. 在后端执行工具 (如 Tavily 搜索)
4. 将结果作为 `tool_result` 事件发出
5. 创建新的 Agent 运行，将工具结果注入消息

### Agno 核心优势

1. **模型无关**: 易于添加新 providers
2. **类型安全**: 完整的 Pydantic 集成
3. **异步优先**: 原生 async/await 支持
4. **生产就绪**: 为可扩展性而构建

## 迁移状态

### 已迁移

| API 端点 | 状态 | 说明 |
|----------|------|------|
| `POST /api/stream-chat` | ✅ 完成 | 流式聊天补全，支持工具调用 |

### 未迁移

| API 端点 | 说明 |
|----------|------|
| `POST /api/related-questions` | 获取相关问题 |
| `GET/POST /api/tools` | 工具定义管理 |
| `POST /api/research-plan` | 研究计划生成 |
| `POST /api/title-space-agent` | 标题空间 Agent |
| `POST /api/agent-for-auto` | 自动 Agent |
| `POST /api/title` | 标题生成 |
| `GET /api/mcp-tools` | MCP 工具列表 |
| `POST /api/title-and-space` | 标题和空间生成 |
| `POST /api/deep-research-chat` | 深度研究对话 |
| `GET /api/daily-tip` | 每日提示 |

### 当前实现

此实现目前是 Node.js stream-chat 的 Agno 包装版本：

- **已迁移**: `/api/stream-chat` 端点
- **未迁移**: 其他 API 端点

### Agno 使用程度

当前仅使用了 Agno 的基础功能：

| 特性 | 状态 | 说明 |
|------|------|------|
| Agent 模型包装 | ✓ | 用于统一多 Provider API |
| 流式事件处理 | ✓ | RunEvent、RunContentEvent |
| external_execution | ✓ | 暂停 Agent 执行外部工具 |
| Agent Teams | ✗ | 未使用 |
| 内置工具库 | ✗ | 未使用（仍用自定义工具） |
| 记忆/存储 | ✗ | 未使用 |
| Structured Output | ✗ | 未使用 |

### 技术债务

- 工具仍通过 `external_execution=True` 手动执行，未完全利用 Agno 工具生态
- stream_chat.py 保留了 Node.js 风格的循环和消息处理逻辑
- 未使用 Agno 的多 Agent 协作能力

后续可逐步重构以充分利用 Agno 的全部功能。

此 Python 后端与 Node.js 后端 API 兼容，可以渐进式迁移。

### 快速切换

| 后端 | 端口 | 启动命令 |
|------|------|----------|
| Node.js | 3001 | `cd backend-node && node run.js` |
| Python | 3002 | `python run.py` |

### 架构差异

| 方面 | Node.js | Python (Agno) |
|------|---------|---------------|
| Web 框架 | Express | FastAPI |
| AI 框架 | Direct API | Agno Agent |
| 工具执行 | 内部实现 | `external_execution=True` |

### 迁移文档

详细迁移指南请参考 [后端迁移文档](../../docs/backend-migration-python.md)，包含：
- 项目结构对比
- Provider 适配器模式
- 工具调用机制
- 调试技巧
- 常见问题解决方案

### API 兼容性

- 相同的 `/api/stream-chat` 端点
- 相同的 SSE 事件格式
- 相同的工具定义结构
- 相同的 provider 配置

## 开发

```bash
# 运行测试
pytest

# 类型检查
mypy src/

# 代码检查
ruff check src/

# 格式化代码
ruff format src/
```

## 许可证

与父 Qurio 项目相同。
