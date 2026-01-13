# Qurio 用户自定义 MCP 工具完整流程

## 一、架构概览

```
┌─────────────────────────────────────────────────────────────────────┐
│                           数据流向                                  │
└─────────────────────────────────────────────────────────────────────┘

【添加 MCP 工具】
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│   前端      │─────▶│   后端      │─────▶│  MCP 服务器  │
│  (React)    │      │  (Node.js)  │      │ (ModelScope) │
└─────────────┘      └─────────────┘      └─────────────┘
       │
       │ 获取工具列表后
       ▼
┌─────────────┐
│  Supabase   │  保存工具定义 (serverName, serverUrl, input_schema)
└─────────────┘

【AI 调用 MCP 工具】
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│   前端      │─────▶│   后端      │─────▶│  MCP 服务器  │
│             │      │  (Node.js)  │      │ (ModelScope) │
└─────────────┘      └─────────────┘      └─────────────┘
       ▲
       │ 1. 从 Supabase 获取用户工具列表
       │ 2. 将工具配置 (serverUrl, input_schema) 传给后端
┌─────────────┐
│  Supabase   │  只存储工具配置，不参与执行
└─────────────┘

【更新服务器 URL】
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│   前端      │─────▶│   后端      │─────▶│  MCP 服务器  │
│             │      │  (Node.js)  │      │ (ModelScope) │
└─────────────┘      └─────────────┘      └─────────────┘
       │                                            │
       │ 1. 用临时连接获取最新工具列表                 │
       │ 2. 同步更新到数据库                         │
       ▼                                            │
┌─────────────┐                                     │
│  Supabase   │  更新工具的 serverUrl               │
└─────────────┘                                     │
       │                                            │
       └────────────────────────────────────────────┘

关键点：
- 后端不直接访问数据库
- 前端负责从 Supabase 获取工具配置，传给后端
- 后端只负责 MCP 连接和工具执行
```

---

## 二、添加 MCP 工具流程

### Step 1: 用户打开工具管理界面

**文件**: [src/components/ToolsModal.jsx](../src/components/ToolsModal.jsx)

用户点击"我的工具" → 点击"新建工具" → 选择 "MCP 工具" 类型

### Step 2: 填写 MCP 服务器信息

```javascript
// 用户填写：
{
  serverName: "12306-mcp",           // 服务器名称（用作分组）
  serverUrl: "https://xxx.modelscope.cn/mcp/..."  // SSE URL
}
```

### Step 3: 连接 MCP 服务器获取工具列表

**前端** ([ToolsModal.jsx:682-689](../src/components/ToolsModal.jsx)):
```javascript
const loadMcpTools = async () => {
  // 调用后端 API 获取工具列表
  const result = await fetchMcpToolsViaBackend(formData.serverName, formData.serverUrl)
  setMcpToolsList(result.tools)
}
```

**后端** ([backend/src/routes/mcpTools.js:92-149](../backend/src/routes/mcpTools.js)):
```javascript
// POST /api/mcp-tools/load
router.post('/load', async (req, res) => {
  const { name, url } = req.body

  // 1. 使用 mcpToolManager 加载 MCP 服务器
  const tools = await mcpToolManager.loadMcpServer(name, url)

  // 2. 返回转换后的工具列表
  res.json({ success: true, tools })
})
```

**MCP Manager** ([backend/src/services/mcpToolManager.js:146-176](../backend/src/services/mcpToolManager.js)):
```javascript
async loadMcpServer(name, sseUrl) {
  // 1. 创建 SSE 传输连接
  const transport = new SSEClientTransport(new URL(sseUrl))

  // 2. 创建 MCP 客户端
  const client = new Client({ name: `qurio-mcp-${name}` }, { capabilities })

  // 3. 连接到服务器
  await client.connect(transport)

  // 4. 获取工具列表
  const tools = await client.listTools()

  // 5. 转换为 Qurio 格式
  const qurioTools = tools.map(tool => this.convertToQurioTool(name, tool))

  // 6. 存储到内存缓存
  for (const tool of qurioTools) {
    this.mcpTools.set(tool.id, tool)
  }

  return qurioTools
}
```

### Step 4: 转换 MCP 工具格式

**MCP 原始格式** → **Qurio 格式**:

```javascript
// MCP 返回的原始工具
{
  name: "get-station-code",
  description: "获取城市站点代码",
  inputSchema: {
    type: "object",
    properties: {
      citys: {
        type: "string",
        description: "城市名称"
      }
    },
    required: ["citys"]
  }
}

// 转换后的 Qurio 格式
{
  id: "mcp_12306-mcp_get-station-code",
  name: "get-station-code",
  type: "mcp",
  description: "[MCP] 获取城市站点代码",
  parameters: {
    type: "object",
    properties: {
      citys: {
        type: "string",
        description: "城市名称"
      }
    },
    required: ["citys"]
  },
  config: {
    mcpServer: "12306-mcp",
    toolName: "get-station-code"
  }
}
```

### Step 5: 用户选择要保存的工具

前端显示工具列表，用户勾选需要的工具 → 点击"保存"

### Step 6: 保存到数据库

**文件**: [src/lib/userToolsService.js:31-55](../src/lib/userToolsService.js)

```javascript
export const createUserTool = async (toolData) => {
  const supabase = getSupabaseClient()

  // 为每个选中的工具创建记录
  await supabase.from('user_tools').insert({
    user_id: userId,
    name: tool.name,                    // 工具名称
    description: tool.description,       // 工具描述
    type: 'mcp',                        // 工具类型
    config: {                           // MCP 配置
      serverName: "12306-mcp",
      serverUrl: "https://...",
      toolId: "mcp_12306-mcp_get-station-code",
      toolName: "get-station-code"
    },
    input_schema: tool.parameters        // JSON Schema 参数定义
  })
}
```

**数据库表结构** (`user_tools`):

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| user_id | UUID | 用户 ID |
| name | string | 工具名称 |
| description | text | 工具描述 |
| type | string | 'mcp' 或 'http' |
| config | jsonb | MCP 服务器配置 |
| input_schema | jsonb | 参数 JSON Schema |

---

## 三、AI 调用 MCP 工具流程

### Step 1: 用户发起对话

用户在聊天界面输入: "帮我查一下上海到北京的火车票"

### Step 2: 后端加载工具定义

**文件**: [backend/src/services/streamChatService.js:363-424](../backend/src/services/streamChatService.js)

```javascript
export const streamChat = async function* (params) {
  const { userTools } = params  // 从数据库加载的用户工具

  // 1. 过滤出 MCP 工具
  const mcpTools = userTools.filter(tool => tool.type === 'mcp')

  // 2. 动态加载 MCP 服务器连接
  if (mcpTools.length > 0) {
    const { mcpToolManager } = await import('./mcpToolManager.js')

    // 按服务器分组，避免重复连接
    const serversToLoad = new Map()
    for (const tool of mcpTools) {
      const serverName = tool.config?.serverName
      const serverUrl = tool.config?.serverUrl

      // 检查是否已加载
      if (!status.loadedServers.includes(serverName)) {
        serversToLoad.set(serverName, serverUrl)
      }

      // 注册工具到 mcpToolManager
      if (!mcpToolManager.getMcpTool(tool.id)) {
        mcpToolManager.mcpTools.set(tool.id, {
          id: tool.id,
          name: tool.name,
          parameters: tool.input_schema,  // 从 input_schema 获取参数
          config: {
            mcpServer: serverName,
            toolName: tool.config.toolName
          }
        })
      }
    }

    // 3. 加载所有 MCP 服务器
    for (const [serverName, serverUrl] of serversToLoad.entries()) {
      await mcpToolManager.loadMcpServer(serverName, serverUrl)
    }
  }
}
```

**关键修复** (line 427-443):
```javascript
// 之前的问题：MCP 工具的参数在 input_schema，但代码读取 tool.parameters
const userToolDefinitions = userTools.map(tool => {
  // 修复：优先使用 tool.parameters，否则回退到 input_schema
  const parameters = tool.type === 'mcp'
    ? (tool.parameters || tool.input_schema)
    : tool.input_schema

  // 调试日志
  if (tool.type === 'mcp') {
    console.log(`[streamChat] MCP Tool "${tool.name}" parameters:`,
      JSON.stringify(parameters, null, 2))
  }

  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters  // 正确传递 JSON Schema 给 AI
    }
  }
})
```

### Step 3: AI 模型接收工具定义

后端将工具定义发送给 AI 模型 (OpenAI/Anthropic/Gemini 等):

```javascript
// 发送给 AI 的请求
{
  model: "gpt-4",
  messages: [...],
  tools: [
    {
      type: "function",
      function: {
        name: "get-station-code",
        description: "[MCP] 获取城市站点代码",
        parameters: {
          type: "object",
          properties: {
            citys: {
              type: "string",
              description: "城市名称"
            }
          },
          required: ["citys"]
        }
      }
    }
  ]
}
```

### Step 4: AI 决定调用工具

AI 分析用户意图，返回工具调用:

```javascript
// AI 响应
{
  tool_calls: [
    {
      id: "call_123",
      function: {
        name: "get-station-code",
        arguments: '{"citys": "上海"}'  // AI 提供的参数
      }
    }
  ]
}
```

### Step 5: 后端执行 MCP 工具

**文件**: [backend/src/services/customToolExecutor.js:167-205](../backend/src/services/customToolExecutor.js)

```javascript
export async function executeMcpTool(tool, args) {
  // 1. 获取 mcpToolManager 实例
  const { mcpToolManager } = await import('./mcpToolManager.js')

  console.log(`[MCP Tool] Executing ${tool.id} with args:`, args)

  // 2. 调用 MCP 工具
  const result = await mcpToolManager.executeMcpTool(tool.id, args)
}
```

**MCP Manager 执行** ([backend/src/services/mcpToolManager.js:257-273](../backend/src/services/mcpToolManager.js)):

```javascript
async executeMcpTool(toolId, args = {}) {
  // 1. 从缓存获取工具定义
  const tool = this.getMcpTool(toolId)
  if (!tool) {
    throw new Error(`MCP tool not found: ${toolId}`)
  }

  // 2. 获取 MCP 服务器连接
  const connection = this.connections.get(tool.config.mcpServer)

  // 3. 调用远程 MCP 工具
  const response = await connection.client.callTool({
    name: tool.config.toolName,
    arguments: args  // { citys: "上海" }
  })

  // 4. 返回结果
  return response
}
```

### Step 6: 返回结果给 AI

```javascript
// MCP 工具返回
{
  content: [
    {
      type: "text",
      text: '{"SHH": "上海", "BXP": "北京"}'
    }
  ]
}

// 转换为 AI 格式
{
  role: "tool",
  tool_call_id: "call_123",
  name: "get-station-code",
  content: '{"data": {"SHH": "上海", "BXP": "北京"}}'
}
```

### Step 7: AI 生成最终回复

AI 基于工具结果生成用户友好的回复:
> "我已经帮您查询了上海到北京的火车信息。上海站代码是 SHH，北京站代码是 BXP..."

---

## 四、更新 MCP 服务器 URL 流程（同步功能）

### 场景：MCP 服务器 URL 变更

当 ModelScope 更新了 MCP 服务器的 SSE URL，用户需要更新所有工具的 URL。

### Step 1: 用户点击服务器配置按钮

**文件**: [src/components/ToolsModal.jsx:326-333](../src/components/ToolsModal.jsx)

在工具列表中，每个 MCP 服务器组右侧有一个设置图标 ⚙️

```javascript
const handleEditServerUrl = (serverName) => {
  const serverTools = tools.filter(t =>
    t.type === 'mcp' && t.config?.serverName === serverName
  )
  setEditingServerUrl(serverName)
  setNewServerUrl(serverTools[0].config?.serverUrl || '')
  setIsEditingServerUrl(true)
}
```

### Step 2: 输入新的 URL 并保存

**文件**: [src/components/ToolsModal.jsx:335-378](../src/components/ToolsModal.jsx)

```javascript
const handleUpdateServerUrl = async () => {
  // Step 1: 使用临时连接从新 URL 获取最新工具列表
  const fetchResult = await fetchMcpToolsViaBackend(editingServerUrl, newServerUrl)

  // Step 2: 智能同步到数据库
  const syncResult = await syncMcpTools(editingServerUrl, newServerUrl, fetchResult.tools)

  // Step 3: 重新加载工具列表
  await loadTools()
}
```

### Step 3: 后端获取最新工具列表

**API**: `POST /api/mcp-tools/fetch`

**文件**: [backend/src/routes/mcpTools.js:193-224](../backend/src/routes/mcpTools.js)

```javascript
router.post('/fetch', async (req, res) => {
  const { name, url } = req.body

  // 使用临时连接获取工具（不存储）
  const tools = await mcpToolManager.fetchToolsFromServerUrl(name, url)

  res.json({
    success: true,
    server: name,
    tools: tools.map(tool => ({
      id: tool.id,
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters
    })),
    total: tools.length
  })
})
```

**临时连接实现** ([backend/src/services/mcpToolManager.js:304-356](../backend/src/services/mcpToolManager.js)):

```javascript
async fetchToolsFromServerUrl(serverName, sseUrl) {
  let tempClient = null
  let tempTransport = null

  try {
    // 1. 创建临时 SSE 传输
    tempTransport = new SSEClientTransport(new URL(sseUrl))

    // 2. 创建临时 MCP 客户端
    tempClient = new Client({
      name: `qurio-mcp-temp-${serverName}`,
      version: '1.0.0'
    }, { capabilities })

    // 3. 连接并获取工具
    await tempClient.connect(tempTransport)
    const response = await tempClient.listTools()
    const tools = response.tools || []

    // 4. 转换格式
    const qurioTools = tools.map(tool => this.convertToQurioTool(serverName, tool))

    return qurioTools
  } finally {
    // 5. 清理临时连接
    if (tempClient) {
      await tempClient.close()
    }
  }
}
```

### Step 4: 智能同步到数据库

**文件**: [src/lib/userToolsService.js:94-186](../src/lib/userToolsService.js)

```javascript
export const syncMcpTools = async (serverName, serverUrl, newTools) => {
  // 1. 获取数据库中该服务器的现有工具
  const { data: existingTools } = await supabase
    .from('user_tools')
    .select('*')
    .eq('type', 'mcp')

  const serverTools = existingTools.filter(t => t.config?.serverName === serverName)

  // 2. 创建 Map 用于高效对比
  const existingToolMap = new Map()
  for (const tool of serverTools) {
    existingToolMap.set(tool.name, tool)  // 用工具名称作为 key
  }

  const newToolMap = new Map()
  for (const tool of newTools) {
    newToolMap.set(tool.name, tool)
  }

  const stats = { updated: 0, added: 0, deleted: 0 }

  // 3. 遍历新工具列表
  for (const [toolName, newTool] of newToolMap) {
    const existingTool = existingToolMap.get(toolName)

    if (existingTool) {
      // 情况 A: 工具已存在 → 更新 URL 和配置
      await supabase.from('user_tools').update({
        description: newTool.description,
        config: {
          ...existingTool.config,
          serverUrl: serverUrl,  // 更新为新 URL
          toolId: newTool.id
        },
        input_schema: newTool.parameters
      }).eq('id', existingTool.id)

      stats.updated++
    } else {
      // 情况 B: 新工具 → 添加到数据库
      await supabase.from('user_tools').insert({
        user_id: userId,
        name: newTool.name,
        description: newTool.description,
        type: 'mcp',
        config: {
          serverName: serverName,
          serverUrl: serverUrl,
          toolId: newTool.id,
          toolName: newTool.name
        },
        input_schema: newTool.parameters
      })

      stats.added++
    }
  }

  // 注意: 不删除旧工具，用户可能需要保留

  return {
    success: true,
    serverName,
    ...stats  // { updated: 5, added: 2 }
  }
}
```

### Step 5: 显示同步结果

前端显示详细统计:
```
✅ 同步完成！
服务器: 12306-mcp
• 更新: 5 个工具  (现有工具的 URL 已更新)
• 新增: 2 个工具  (服务器上新加的工具)
• 总计: 7 个工具
```

---

## 五、关键技术点

### 1. SSE (Server-Sent Events) 传输

```javascript
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'

const transport = new SSEClientTransport(new URL(sseUrl))
const client = new Client({ name, version }, { capabilities })
await client.connect(transport)
```

### 2. JSON Schema 转换

MCP 使用标准 JSON Schema，需要转换为 AI 模型可用的格式:

```javascript
convertParameters(inputSchema) {
  return {
    type: inputSchema.type || 'object',
    properties: inputSchema.properties || {},
    required: inputSchema.required || []
  }
}
```

### 3. 参数传递修复

**问题**: 数据库存储在 `input_schema`，代码读取 `tool.parameters`

**解决**:
```javascript
parameters: tool.type === 'mcp'
  ? (tool.parameters || tool.input_schema)  // 优先 parameters，回退到 input_schema
  : tool.input_schema
```

### 4. 内存缓存机制

```javascript
// mcpToolManager 单例
class MCPToolManager {
  constructor() {
    this.mcpTools = new Map()      // 工具定义缓存
    this.connections = new Map()    // MCP 连接缓存
    this.loadedServers = new Set()  // 已加载服务器
  }
}
```

### 5. 临时连接模式

用于预览工具，不污染缓存:
```javascript
try {
  tempClient = new Client(...)
  await tempClient.connect(tempTransport)
  // 获取工具...
} finally {
  await tempClient.close()  // 必须清理
}
```

---

## 六、核心文件

| 文件 | 作用 |
|------|------|
| [backend/src/services/mcpToolManager.js](../backend/src/services/mcpToolManager.js) | MCP 连接管理、工具转换、执行 |
| [backend/src/routes/mcpTools.js](../backend/src/routes/mcpTools.js) | MCP 相关 API 路由 |
| [backend/src/services/customToolExecutor.js](../backend/src/services/customToolExecutor.js) | 工具执行分发器 |
| [backend/src/services/streamChatService.js](../backend/src/services/streamChatService.js) | 聊天服务，加载和调用工具 |
| [src/lib/userToolsService.js](../src/lib/userToolsService.js) | 数据库操作 (CRUD + 同步) |
| [src/lib/backendClient.js](../src/lib/backendClient.js) | 前端 API 客户端 |
| [src/components/ToolsModal.jsx](../src/components/ToolsModal.jsx) | 工具管理界面 |

---

## 七、核心特性

1. ✅ **SSE 传输**: 使用 `@modelcontextprotocol/sdk` 的 SSE 客户端
2. ✅ **智能同步**: 更新 URL 时自动获取最新工具，智能合并新旧工具
3. ✅ **参数修复**: 正确处理 `input_schema` 到 AI 模型的参数传递
4. ✅ **临时连接**: 预览工具时不污染缓存
5. ✅ **内存缓存**: mcpToolManager 单例管理连接和工具定义
