# Agno 后端详细说明（给同事）

本文是 Qurio Python 后端当前 **Agno 逻辑** 的详细说明，重点覆盖：模型路由、流式事件、工具体系、接口约定与关键文件职责。

---

## 1. 总体架构

**目标**：让前端无感切换（Node.js → Python），保持协议与字段一致，同时内部完全基于 Agno SDK。

```
前端 (SSE/REST)
   │
   ▼
FastAPI 路由层 (routes/*)
   │
   ▼
服务层 (services/*)
   │   ├─ agent_registry.py (模型与工具装配)
   │   └─ stream_chat.py (Agno 事件 → SSE)
   ▼
Agno Agent / Toolkit / Model
```

---

## 2. 模型与 Provider 路由策略

**当前策略（2026-01-22）**：
- `provider == gemini` → `agno.models.google.Gemini`
- **其余全部走 OpenAI‑compatible** → `agno.models.openai.OpenAILike`

**原因**：
- 让 `developer` 等新角色原样透传（避免部分 provider 解析失败）
- 所有非 Gemini 模型统一使用 OpenAI‑compatible 协议

**实现位置**：
- `backend-python/src/services/agent_registry.py` → `_build_model()`

---

## 3. 消息与角色处理

- **不做角色映射**（`developer` 会原样透传）。
- 由 OpenAI‑like 协议处理所有非 Gemini provider。
- 如将来遇到特定 provider 不支持的 role，可在 `agent_registry.py` 单独切换该 provider 为 Gemini 之外的特殊实现。

---

## 4. 流式 SSE 事件（前端兼容）

后端输出统一为 **JSON SSE**，事件类型与 Node.js 保持一致：

```
text / thought / tool_call / tool_result / done / error
```

示例：
```json
{"type":"text","content":"你好"}
{"type":"thought","content":"让我想一想…"}
{"type":"tool_call","id":"xxx","name":"calculator","arguments":"{\"expression\":\"2+2\"}"}
{"type":"tool_result","id":"xxx","name":"calculator","status":"done","output":{"result":4}}
{"type":"done","content":"最终答案","thought":"…","sources":[...]}
```

**实现位置**：
- `backend-python/src/services/stream_chat.py`

---

## 5. 工具体系（分层、分组）

### 5.1 本地工具（Local）
- 由 `QurioLocalTools` 提供
- 包含：
  - `calculator`
  - `local_time`
  - `summarize_text`
  - `extract_text`
  - `json_repair`
  - `interactive_form`
  - `webpage_reader`
  - `Tavily_web_search`
  - `Tavily_academic_search`

**实现位置**：
- `backend-python/src/services/custom_tools.py`
- `backend-python/src/services/tools.py`

### 5.2 Agno 内置工具（Agno）
按勾选动态加载 Toolkit：
- `TavilyTools`：`web_search_using_tavily` / `web_search_with_tavily` / `extract_url_content`
- `WebSearchTools`：`web_search` / `search_news`（支持后端：auto/duckduckgo/google/bing/brave/yandex/yahoo）
- `ArxivTools`：`search_arxiv_and_return_articles` / `read_arxiv_papers`
- `WikipediaTools`：`search_wikipedia`
- `YFinanceTools`：`get_current_stock_price` / `get_company_info` / `get_stock_fundamentals` / …

**实现位置**：
- `backend-python/src/services/agent_registry.py` → `_build_agno_toolkits()`
- 工具列表：`backend-python/src/services/tool_registry.py`

### 5.3 用户工具（Custom）
- HTTP 工具 & MCP 工具
- 支持模板参数替换（`{{var}}`）、域名白名单、响应大小限制、超时配置

**实现位置**：
- `backend-python/src/services/user_tools.py`

### 5.4 搜索后端选择（前后端联动）
**目的**：网络搜索不再依赖“工具别名/供应商开关”，而是由输入框选择“搜索后端”，并让工具调用展示/详情可见后端信息。

**前端 UI 行为**
- 会话输入框与首页输入框：下拉菜单分成三段  
  1) 网络搜索（后端单选）  
  2) 学术搜索（arXiv / Wikipedia 多选）  
  3) 关闭（清空网络搜索后端）  
- “关闭”统一放在最底部，避免被误认为后端选项。  
- 展示标签：`网络搜索 · Google` / `网络搜索 · DuckDuckGo` 等。

**前端状态与请求**
- 选择的后端存到 `searchBackend`（字符串或 null）。  
- 发起聊天请求时，`searchBackend` 会随请求体发送到后端。
- 学术搜索仍作为独立工具勾选，不与网络搜索后端耦合。

**后端接收与工具装配**
- `searchBackend` → `request.search_backend`  
- `_build_agno_toolkits()` 中 `WebSearchTools(backend=...)` 读取该值  
- 支持：`auto | duckduckgo | google | bing | brave | yandex | yahoo`

**工具调用展示修复**
- Agno 的 `web_search/search_news` 默认参数不包含 `backend`，刷新后容易丢失显示。
- 前端在流式 `tool_call` 事件时**注入 backend**到 `toolCallHistory.arguments`（仅 web_search/search_news）。  
- `MessageBubble` 会从 `message.searchBackend` 或 `toolCallHistory.arguments.backend` 反推后端，保证刷新后仍能显示 `网络搜索 · Google`。
- 工具详情“入参 JSON”会补全 `backend` 字段，避免误解。

**涉及文件**
- 前端请求与状态  
  - `src/components/ChatInterface.jsx`（维护 searchBackend、传入 ChatInputBar）
  - `src/views/HomeView.jsx`（首页搜索下拉 + searchBackend）
  - `src/lib/backendClient.js` / `src/lib/chatStore.js`（请求体携带 searchBackend）
- 前端展示  
  - `src/components/chat/ChatInputBar.jsx`（下拉菜单结构 + 标签显示）
  - `src/components/MessageBubble.jsx`（工具名/详情显示 backend）
- 后端工具装配  
  - `backend-python/src/services/agent_registry.py`（WebSearchTools backend 选择）
  - `backend-python/src/models/stream_chat.py` / `backend-python/src/routes/stream_chat.py`
  - `backend-python/src/services/tool_registry.py`（工具描述）

**注意事项**
- 当前 `conversation_messages` 表没有 `search_backend` 字段，刷新后依赖 `toolCallHistory.arguments.backend` 还原显示。
- 若后续要持久化后端选择，可新增字段并在持久化时写入（前端 + DB schema 需同步调整）。

---

## 6. 重要配置（.env）

```
HOST=198.18.0.1
PORT=3002
FRONTEND_URLS=http://localhost:3000,http://198.18.0.1:3000

OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini

GEMINI_MODEL=gemini-2.0-flash-exp

TAVILY_API_KEY=...
```

> 其他 provider 的 base_url/model 可继续保留，OpenAI‑like 会按 `provider` 自动使用对应默认值。

---

## 7. 关键文件用途（明细）

### 应用入口
- `src/main.py`
  - AgentOS 应用入口，返回 FastAPI app

### 配置
- `src/config.py`
  - Pydantic Settings
  - CORS、SSE、Tavily 等配置读取

### AgentOS 组装
- `src/services/agent_os_app.py`
  - 注册路由
  - CORS 中间件 + 兜底 CORS header
  - 初始化 AgentOS 实例

### 模型与工具装配
- `src/services/agent_registry.py`
  - `_build_model()`：Gemini / OpenAI‑like
  - `_build_tools()`：Local / Agno / Custom 工具组合

### 流式服务
- `src/services/stream_chat.py`
  - Agno RunEvent → SSE JSON
  - pre-events（tool_call / tool_result）
  - 本地时间注入、工具提示等

### 生成服务
- `src/services/generation.py`
  - title / related‑questions / agent‑for‑auto / research‑plan

### 工具注册
- `src/services/tool_registry.py`
  - `LOCAL_TOOLS` / `AGNO_TOOLS` / `ALL_TOOLS`

### 工具执行
- `src/services/tools.py`
  - 本地工具执行（非 Agno）

### 用户工具
- `src/services/user_tools.py`
  - HTTP/MCP 工具封装

### 路由
- `src/routes/*.py`
  - stream_chat / title / related_questions / research_plan / deep_research 等

---

## 8. API 约定与前端无感切换

- **接口路径不变**
- **SSE 数据结构不变**
- **工具 ID / toolIds / toolChoice 保持兼容**

前端通过 `/api/tools` 获取工具清单，按 `category` 分组：
- `custom` → 用户自定义工具
- `agno` → Agno 内置工具
- 其他 → 本地工具类别（math/time/text/web/search）

---

## 9. 常见问题（FAQ）

### Q1: 为什么出现 `developer` 角色？
- 部分 SDK/前端会使用 `developer` 作为系统指令角色
- OpenAI‑like 支持该角色，其他 provider 会报错
- 因此除 Gemini 外统一走 OpenAI‑like

### Q2: 为什么不用 Agno DB？
- 目前存储由前端直接写 Supabase
- Agno DB 暂停使用（减少后端复杂度）

### Q3: 工具为什么要分开？
- Local 工具：本地实现，稳定可控
- Agno 工具：官方生态工具（依赖外部包）
- Custom 工具：用户自定义，来源不可控

---

## 10. 对应 Agno 文档
- OpenAI‑like: https://docs.agno.com/integrations/models/openai-like
