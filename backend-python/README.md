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

### Agno 核心优势

1. **模型无关**: 易于添加新 providers
2. **类型安全**: 完整的 Pydantic 集成
3. **异步优先**: 原生 async/await 支持
4. **生产就绪**: 为可扩展性而构建

## 从 Node.js 迁移

此 Python 后端与 Node.js 后端 API 兼容：

- 相同的 `/api/stream-chat` 端点
- 相同的 SSE 事件格式
- 相同的工具定义
- 相同的 provider 配置

你可以通过更改端口在后端之间切换：
- Node.js: 端口 3001
- Python: 端口 3002

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
