# 专家模式 Team 集成计划 (Expert Mode Team Integration Plan)

## 目标 (Objective)
重构当前的专家模式，移除前端复杂且脆弱的多路并发流控机制。全面采用 Agno 原生内置的 Team（团队）功能（包括 `coordinate`（协调）、`route`（路由）、`broadcast`（广播）和 `tasks`（任务拆分）四种模式）在后端进行处理。

## 设计思路 (Rationale)
目前的专家模式完全由前端手动编排：
1. 前端向后端的“精简 (lite)”模型请求生成研究计划。
2. 前端解析计划，将子任务分配给激活的 Agent 们。
3. 前端同时向多个 Agent 发起并发的 Stream (流式) 请求。

然而，Agno 框架的 `Team` 对象原生并且更优地处理了这些通信和协调。在重构过程中，当前空间 (Space) 下原有的 Agent 资产（专属提示词、特定模型、独有工具和技能配置）将 100% 继承并被注入给 Team 的 Members（团队成员）。Team Leader（团队掌控者）只负责按指定的策略委派任务和汇总结果。

## 变更实施 (Proposed Changes)

### 1. 前端修改 (Frontend Changes)

#### `src/components/ChatInterface.jsx`
- 当激活“专家模式”时，新增一个 UI 切换控件（如下拉菜单或 Toggle），用来让用户选择团队执行模式：`coordinate`、`route`、`broadcast` 或 `tasks`。
- 将用户选择的 `teamMode` 变量存入并随着发送消息的 `sendMessage` 传递。

#### `src/lib/chatStore.js`
- **简化发送逻辑：** 在 `sendMessage` 方法中，删除用来获取并解析 `generateResearchPlan` 计划以及分发子任务请求的多余代码。
- **合并请求：** 只要把 `expertMode: true`、`teamMode: selectedMode` 以及包含涉及专家的数组 `teamAgentIds: expertAgents.map(a => a.id)` 的 Payload，发送给后端原本单一路口的 `/stream-chat` 即可。
- **流事件解析路由：** 读取经过后端封装后的 unified stream（统一事件流）。
- **Tab 结果渲染：** 识别传输分块 (chunk) 内的专属 `agent_id` 或 `agent_name`（来源于后端注入），用来判断这一段输出/工具调用是来自 Team Leader 还是某一个被委派任务的 Member。将其路由到前端 UI 对应的各专家专门的 Tab 栏下。最后总括内容显示在主响应视图或专门的 Leader 结果 Tab。

### 2. 后端修改 (Backend Changes)

#### `backend-python/src/models/stream_chat.py`
- 更新 `StreamChatRequest` 模型类，接受新的参数：
  - `expert_mode` (布尔类型)
  - `team_mode` (字符串)
  - `team_agent_ids` (字符串列表)

#### `backend-python/src/services/agent_registry.py`
- 新增或优化用于组装 Team 的内部函数（例如：`build_team_agent`）。
- **继承 Members 属性：** 如果参数带有 `expert_mode=True`，遍历传入的 `team_agent_ids`。调用现有的获取 Agent 的逻辑（或是连表 DB 查询），完整的实例化每一个 Member Agent。确保其原始的高级配置（System Prompt, Models, API Tools, Local Skills）完全独立保留不受污染。
- **初始化 Team Leader：** 实例化负责协调的主控 `Team` 对象。配置其 `members=[...]`（上一步装配出的子 Agents），并按照传入的 `team_mode` 设置协作模式（例如：`mode=TeamMode.route`）。为了保持精准路由特性，Leader 自身尽量不挂载额外的复杂执行 Tool。

#### `backend-python/src/services/stream_chat.py`
- 修改 `stream_chat` 流处理服务，如果判断是 `expert_mode`，则获取的是 Team 类型对象，而不是普通单 Agent。
- **流分发关键机制 (CRITICAL)：** 使用 `team.run(stream=True, stream_member_events=True)` 或者遍历 `RunOutputEvent`。由于 Agno 对于 Team 包含了子成员事件，我们可以读到这个过程中的详细信息。提取 `event.run_response.agent_id`（或者名）。
- 将该发送人的 `agent_id` 附加追加到返回前端的 JSON 响应体会中 `{"event": event.event, "content": event.content, "agent_id": ...}`。

## 验收与测试计划 (Verification & Testing)
1. **Frontend 视觉及控件测试：** 确认新加的下拉/切换在触发专家模式时可见，并发出的请求体附带正确。
2. **Backend SDK 调用验证：** 启动拥有多技能 Agents 的空间进行专家会话。在后台通过打点查看 Team 是否成功实例化并激活内部路由成员。
3. **Stream 解析测试：** 核对前端解析：确认那些属于中间过程探索（Member's tool/reasoning chunk）能正确投放到专属成员 Tab 内容里，而最后经过 Leader 汇总（Leader chunk）的一大段文字保留在核心对话窗口/响应框中。不会造成对话历史数据的重叠和崩溃。
