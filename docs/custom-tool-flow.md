# Custom Tool Flow Documentation
# 自定义工具流程文档

This document explains the complete lifecycle of user-defined HTTP tools, from creation to runtime execution.

本文档解释了用户自定义 HTTP 工具的完整生命周期，从创建到运行时执行。

---

## Overview
## 概览

User-defined custom tools allow users to integrate any HTTP API into the AI assistant without writing code. The system automatically:

- Extracts parameters from URL and query string templates
- Generates JSON schemas for the AI model
- Executes requests securely with domain validation and size limits
- Returns results to the AI for natural language responses

用户自定义工具允许用户无需编写代码即可将任何 HTTP API 集成到 AI 助手中。系统会自动：

- 从 URL 和查询字符串模板中提取参数
- 为 AI 模型生成 JSON 架构
- 通过域名验证和大小限制安全地执行请求
- 将结果返回给 AI 以生成自然语言响应

---

## Part 1: Tool Creation
## 第一部分：工具创建

### User Input (ToolsModal.jsx)
### 用户输入（ToolsModal.jsx）

Users fill out a form with the following fields:

用户填写包含以下字段的表单：

**Basic Information 基本信息:**
- `name`: Tool identifier (e.g., `weather_forecast`)  
  工具标识符（例如 `weather_forecast`）
- `description`: What the tool does (shown to AI)  
  工具功能描述（展示给 AI）
- `method`: HTTP method (GET, POST, PUT, DELETE)  
  HTTP 方法（GET、POST、PUT、DELETE）

**API Configuration API 配置:**
- `url`: Endpoint URL with path parameters  
  端点 URL，包含路径参数  
  Example 示例: `https://api.weather.com/forecast/{{city}}`
  
- `params`: Query parameters as JSON object  
  查询参数（JSON 对象）  
  Example 示例: `{"days": "{{duration}}", "units": "metric"}`

**Security Settings 安全设置:**
- `allowedDomains`: Whitelist of allowed domains  
  允许的域名白名单
- `maxResponseSize`: Maximum response size in bytes  
  最大响应大小（字节）
- `timeout`: Request timeout in milliseconds  
  请求超时时间（毫秒）

### Automatic Schema Generation
### 自动生成 Schema

When saving, the system extracts all `{{variable}}` patterns from both URL and params:

保存时，系统会从 URL 和 params 中提取所有 `{{变量}}` 模式：

```javascript
// Example 示例:
// URL: https://api.weather.com/forecast/{{city}}
// Params: {"days": "{{duration}}", "units": "metric"}
//
// System extracts 系统提取: ["city", "duration"]
//
// Generated input_schema 生成的 input_schema:
{
  type: "object",
  properties: {
    city: {
      type: "string",
      description: "Parameter: city"
    },
    duration: {
      type: "string",
      description: "Parameter: duration"
    }
  },
  required: []
}
```

**Code location 代码位置:** `src/components/ToolsModal.jsx` lines 136-164

### Data Storage
### 数据存储

The complete tool configuration is saved to the `user_tools` table:

完整的工具配置保存到 `user_tools` 表：

```javascript
{
  id: "uuid-abc123",              // Auto-generated UUID 自动生成的 UUID
  user_id: "user-xyz",            // Current user 当前用户
  name: "weather_forecast",       // Tool name 工具名称
  description: "Get weather...",  // AI-visible description AI 可见的描述
  type: "http",                   // Tool type 工具类型
  config: {                       // Execution config 执行配置
    url: "https://api.weather.com/forecast/{{city}}",
    method: "GET",
    params: {"days": "{{duration}}", "units": "metric"},
    security: {
      allowedDomains: ["api.weather.com"],
      maxResponseSize: 100000,
      timeout: 10000
    }
  },
  input_schema: { /* as above */ }  // AI-visible schema AI 可见的 Schema
}
```

---

## Part 2: Tool Assignment to Agent
## 第二部分：为 Agent 分配工具

### Tool Loading (AgentModal.jsx)
### 工具加载（AgentModal.jsx）

When AgentModal opens, it loads tools from two sources:

AgentModal 打开时，会从两个来源加载工具：

1. **System Tools 系统工具**: Retrieved via `listToolsViaBackend()`  
   通过 `listToolsViaBackend()` 获取
   - Example 示例: `Tavily_web_search`, `calculator`

2. **Custom Tools 自定义工具**: Retrieved via `getUserTools()`  
   通过 `getUserTools()` 获取
   - Forced category 强制分类: `custom`
   - ID converted to string ID 转换为字符串

**Code location 代码位置:** `src/components/AgentModal.jsx` lines 230-252

### Tool Categorization
### 工具分类

Tools are grouped by category for display:

工具按分类分组显示：

```javascript
{
  "web_search": [
    { id: "Tavily_web_search", name: "Web Search", ... }
  ],
  "custom": [
    { id: "uuid-abc123", name: "weather_forecast", ... }
  ]
}
```

**Code location 代码位置:** `src/components/AgentModal.jsx` lines 220-228

### Saving Tool Selection
### 保存工具选择

User selects tools by checking boxes. Selected tool IDs (both system and custom) are saved to the agent's configuration:

用户通过勾选框选择工具。选择的工具 ID（系统和自定义）保存到 Agent 的配置中：

```javascript
// Example agent configuration 示例 Agent 配置
{
  name: "Weather Bot",
  toolIds: [
    "Tavily_web_search",  // System tool ID 系统工具 ID
    "uuid-abc123"         // Custom tool UUID 自定义工具 UUID
  ]
}
```

**Code location 代码位置:** `src/components/AgentModal.jsx` line 520

---

## Part 3: Runtime Execution
## 第三部分：运行时执行

### Tool Definition Preparation (streamChatService.js)
### 工具定义准备（streamChatService.js）

When a chat starts, the backend prepares tool definitions for the AI model:

聊天开始时，后端为 AI 模型准备工具定义：

**Step 1: Load custom tools 加载自定义工具**  
Custom tools are passed via `params.userTools` and indexed by name:

自定义工具通过 `params.userTools` 传递，并按名称索引：

```javascript
let userToolsMap = new Map()
userTools.forEach(tool => {
  userToolsMap.set(tool.name, tool)
})
```

**Code location 代码位置:** `backend/src/services/streamChatService.js` lines 363-369

**Step 2: Convert to AI format 转换为 AI 格式**  
Custom tools are converted to function definitions:

自定义工具转换为函数定义：

```javascript
const userToolDefinitions = userTools.map(tool => ({
  type: 'function',
  function: {
    name: tool.name,
    description: tool.description,
    parameters: tool.input_schema  // From Part 1 来自第一部分
  }
}))
```

**Code location 代码位置:** `backend/src/services/streamChatService.js` lines 373-380

**Step 3: Merge with system tools 与系统工具合并**  
All tools are combined into a single array:

所有工具合并为一个数组：

```javascript
const combinedTools = [
  ...agentToolDefinitions,  // System tools 系统工具
  ...userToolDefinitions    // Custom tools 自定义工具
]
```

**Code location 代码位置:** `backend/src/services/streamChatService.js` lines 385-389

### AI Decision
### AI 决策

The AI model sees the tool definition and decides to call it:

AI 模型看到工具定义并决定调用：

```json
{
  "name": "weather_forecast",
  "arguments": "{\"city\": \"Tokyo\", \"duration\": \"3\"}"
}
```

### Tool Execution Routing
### 工具执行路由

When the backend receives a tool call, it determines whether it's a custom or system tool:

后端接收到工具调用时，判断是自定义工具还是系统工具：

```javascript
const toolName = toolCall.function.name
const isCustomTool = userToolsMap.has(toolName)

if (isCustomTool) {
  const customTool = userToolsMap.get(toolName)
  result = await executeCustomTool(customTool, parsedArgs)
} else {
  result = await executeToolByName(toolName, parsedArgs, toolConfig)
}
```

**Code location 代码位置:** `backend/src/services/streamChatService.js` lines 552-577

### Custom Tool Execution (executeHttpTool)
### 自定义工具执行（executeHttpTool）

**Code location 代码位置:** `backend/src/services/customToolExecutor.js` lines 85-161

**Step 1: Replace params variables 替换 params 变量**

```javascript
// Original 原始: {"days": "{{duration}}", "units": "metric"}
// Args 参数: {duration: "3"}
// Result 结果: {"days": "3", "units": "metric"}

const finalParams = replaceTemplates(params, args)
```

**Step 2: Build final URL 构建最终 URL**

```javascript
// Original 原始: https://api.weather.com/forecast/{{city}}
// After path replacement 路径替换后: https://api.weather.com/forecast/Tokyo
// After query string 查询字符串后: https://api.weather.com/forecast/Tokyo?days=3&units=metric

let processedUrl = replaceTemplate(url, args)
const finalUrl = buildUrl(processedUrl, finalParams)  // GET only
```

**Step 3: Security validation 安全验证**

```javascript
validateDomain(finalUrl, allowedDomains)
// Throws error if domain not in whitelist
// 如果域名不在白名单中则抛出错误
```

**Step 4: Execute HTTP request 执行 HTTP 请求**

```javascript
const controller = new AbortController()
setTimeout(() => controller.abort(), timeout)

const response = await fetch(finalUrl, {
  method,
  headers: {'Content-Type': 'application/json', ...headers},
  body: method !== 'GET' ? JSON.stringify(finalParams) : undefined,
  signal: controller.signal
})
```

**Step 5: Response handling 响应处理**

```javascript
const text = await response.text()

// Enforce size limit 强制大小限制
if (text.length > maxResponseSize) {
  throw new Error(`Response too large`)
}

// Parse as JSON or return as text
// 解析为 JSON 或作为文本返回
try {
  return JSON.parse(text)
} catch {
  return { data: text }
}
```

### Result Flow
### 结果流程

1. API response is returned to the AI model  
   API 响应返回给 AI 模型
2. AI processes the data and generates a natural language answer  
   AI 处理数据并生成自然语言回答
3. User sees the final response in the chat  
   用户在聊天中看到最终响应

---

## Key Design Decisions
## 关键设计决策

### Tool Identification
### 工具识别

- **System tools 系统工具**: Identified by string constants (e.g., `Tavily_web_search`)  
  通过字符串常量识别（例如 `Tavily_web_search`）
- **Custom tools 自定义工具**: Identified by UUID from database  
  通过数据库中的 UUID 识别
- **Mixed storage 混合存储**: Both types stored together in `agent.tool_ids` array  
  两种类型一起存储在 `agent.tool_ids` 数组中

### Security Model
### 安全模型

Custom tools must define:

自定义工具必须定义：

1. **Domain whitelist 域名白名单**: Prevents SSRF attacks  
   防止 SSRF 攻击
2. **Response size limit 响应大小限制**: Prevents memory exhaustion  
   防止内存耗尽
3. **Timeout 超时**: Prevents hanging requests  
   防止请求挂起

### Schema Auto-Generation
### Schema 自动生成

The system uses regex to extract all `{{variable}}` patterns from:

系统使用正则表达式从以下位置提取所有 `{{变量}}` 模式：

- URL path (e.g., `/users/{{userId}}`)  
  URL 路径（例如 `/users/{{userId}}`）
- Query parameter values (e.g., `{"limit": "{{count}}"}`)  
  查询参数值（例如 `{"limit": "{{count}}"}`)

This ensures the AI knows all required parameters without manual schema definition.

这确保 AI 知道所有必需的参数，无需手动定义 Schema。

---

## File Reference
## 文件参考

### Frontend 前端
- `src/components/ToolsModal.jsx` - Tool creation UI and schema generation  
  工具创建 UI 和 Schema 生成
- `src/components/AgentModal.jsx` - Tool assignment UI  
  工具分配 UI
- `src/lib/userToolsService.js` - CRUD operations for custom tools  
  自定义工具的 CRUD 操作

### Backend 后端
- `backend/src/services/streamChatService.js` - Tool loading and routing  
  工具加载和路由
- `backend/src/services/customToolExecutor.js` - HTTP tool execution engine  
  HTTP 工具执行引擎
- `backend/src/routes/tools.js` - API endpoints for tool management  
  工具管理的 API 端点
