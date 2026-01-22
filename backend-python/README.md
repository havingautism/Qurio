# Qurio Python 后端（FastAPI + Agno）

本后端以 Agno SDK 为核心，实现与前端 **无感切换** 的对话与工具能力。

## 关键逻辑（当前 Agno 架构）

1) **模型选择**
- `provider == gemini`：使用 Agno 的 `Gemini` 模型类。
- **除 Gemini 外全部走 OpenAI‑compatible**：统一使用 `OpenAILike`（参见 Agno OpenAI‑like 文档）。
- 模型与 base_url 以请求参数为主，未传则用环境变量默认值。

2) **消息与流式**
- 不做角色映射（`developer` 会原样透传）。
- 流式输出通过 `Agent.run(stream=True, stream_events=True)` 转成 SSE JSON 事件：
  - `text / thought / tool_call / tool_result / done / error`

3) **工具体系（前端可选）**
- **本地自定义工具（local）**：`QurioLocalTools`（calculator / local_time / summarize_text / extract_text / json_repair / webpage_reader / interactive_form / Tavily_* 等）。
- **Agno 内置工具（agno）**：按勾选加载 Toolkit：
  - TavilyTools / DuckDuckGoTools / ArxivTools / WikipediaTools / YFinanceTools
- **用户工具（custom）**：HTTP/MCP 工具通过 `build_user_tools_toolkit` 统一封装。

4) **存储**
- 当前 **不启用 Agno DB**（前端自行写入 Supabase）。

5) **CORS**
- 由 `AgentOS(cors_allowed_origins=...)` 与兜底中间件同时保证浏览器可访问。

---

## 主要文件用途（backend-python/src）

- `main.py`
  - FastAPI 应用入口，启动 AgentOS。

- `config.py`
  - 读取环境变量（HOST/PORT/CORS/DEBUG 等）。

- `services/agent_os_app.py`
  - 组装 FastAPI + AgentOS，注册路由，设置 CORS 与兜底响应。

- `services/agent_registry.py`
  - **核心模型/工具装配**：
    - 选择 `Gemini` 或 `OpenAILike`
    - 注入本地工具、Agno 工具、用户工具
    - 处理工具选择策略（`tool_choice`）

- `services/stream_chat.py`
  - **流式对话主服务**，将 Agno 事件转为 SSE JSON。
  - 支持本地时间自动注入与工具提示。

- `services/tool_registry.py`
  - 工具清单与分类：`LOCAL_TOOLS / AGNO_TOOLS / ALL_TOOLS`。

- `services/custom_tools.py`
  - 本地工具实现（安全计算、时间、摘要、网页读取、Tavily 搜索等）。

- `services/user_tools.py`
  - 用户工具封装（HTTP/MCP），支持参数模板、域名白名单、超时与大小限制。

- `services/tools.py`
  - 兼容旧逻辑的本地工具执行入口（仅认 local tools）。

- `services/generation.py`
  - 标题、相关问题、自动 agent 选择、research plan 等非流式生成。

- `routes/*.py`
  - 具体 API 端点（stream-chat / title / related-questions / research-plan / deep-research 等）。

---

## 相关配置（backend-python/.env）

- `HOST` / `PORT`
- `FRONTEND_URLS`（逗号分隔）
- `OPENAI_BASE_URL` / `OPENAI_MODEL`
- 其他 provider 的 base_url / model（如 siliconflow、glm、minimax 等）
- `TAVILY_API_KEY`

---

## 与前端约定

- SSE 数据格式不变（前端无感）。
- 工具列表通过 `/api/tools` 返回，按 `category` 分组：
  - `custom` = 自定义工具
  - `agno` = Agno 内置工具
  - 其他 = 本地工具分类（math/time/text/web/search...）
