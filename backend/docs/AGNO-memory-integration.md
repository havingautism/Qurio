# AGNO 长期记忆集成说明

## 目标
- 终结当前自建的长期记忆逻辑，改用 AGNO 官方 memory 路径（参考 https://docs.agno.com/context/memory/overview 和 https://docs.agno.com/context/memory/working-with-memories/overview）。
- UX 端保留“长期记忆”开关，控制 `enableLongTermMemory` 参数，后台只有在这个标记及 `enable_long_term_memory` 为 true 时才读写记忆。
- 目前仅使用 Supabase 作为数据源，但保留 provider 等级的结构以便未来扩展。
- 后端位于 `backend-python`，由它调用 AGNO memory manager 与 Supabase 同步。

## 现行逻辑概要
1. 设置页的开关会同步到 `chatStore.memoryEnabled`，并在 `/api/stream-chat` 请求中附带 `enableLongTermMemory` 字段；后端只有这个字段为 true（与 `enable_long_term_memory` 相等）且请求含合法 `userId` 时才会启动记忆读写。
2. 记忆写入/读取走 AGNO memory manager，所有流量都进入 `backend-python` 的 Agent（会话 agent 或 lite agent），前端只负责传 Supabase 配置与开关状态。
3. Supabase 连接参数由前端传入 `databaseProvider`/`databaseConfig`，后端在 `agent_registry._build_memory_kwargs` 中识别 provider 为 `supabase` 才创建 `PostgresDb` 连接并设置 `update_memory_on_run=True`。
4. 多 Agent 共用同一 Supabase DB，打开 `update_memory_on_run` 后任何一个写入的记忆都能被其他 Agent 读取。

## 数据库/表结构说明
- AGNO memory 会在 Supabase 中创建自身需要的表（通过 `postgresql://postgres:<service-role>...` 连接），我们无需手动建表。
- 未来新增 provider 只需在 UI/配置中新增选项，并在 `agent_registry.build_memory_agent` 中传入 provider/model 即可。

## 需要注意的协作点
- Supabase 改动时同步前端 database 配置和 `backend-python/.env`（如 `DATABASE_PROVIDER`）。
- 长期记忆开关与 `enable_long_term_memory` 保持一致：开关决定前端是否传参，后端才有开关可读。
- 记忆数据不再存到 local storage、临时会话或用户描述，只存在 AGNO+Supabase。

## 记忆优化与多 Agent 共享
- 记忆优化通过 `agent.memory_manager.optimize_memories(..., strategy=MemoryOptimizationStrategyType.SUMMARIZE)` 压缩 token，默认走当前 Agent 的 lite 模型。
- 多 Agent 共享只需统一指向 Supabase DB 且开 `update_memory_on_run`，任何一个写入的记忆都对其它 Agent 可见。
- `memory_service.optimize_user_memories` 允许传递 `provider/model/base_url/api_key`，方便手动调度时用当前 lite metadata。

## 自动优化策略
- `StreamChatService` 在 run 完成后检查 `request.enable_long_term_memory`、`user_id` 及 lite agent 的 `memory_manager`；只有满足条件才继续。
- 如果记忆数量 >= 50 且距上次优化超过 12 小时，后台自动执行 `memory_manager.optimize_memories(..., strategy=SUMMARIZE, apply=True)` 并记录在 `_last_memory_optimization`，以后台线程 (`asyncio.to_thread`) 运行，避免每次会话都重跑。
- 这个流程遵循 AGNO 最佳实践：“大批记忆要自动压缩”（https://docs.agno.com/context/memory/best-practices）并只在 `enable_long_term_memory` 为 true 时才生效。

## 备选 Agent 与 lite 模型兜底
- 记忆相关的 API 都使用当前上下文的 lite 模型：前端在 `/api/stream-chat` 中附加 `memoryProvider/memoryModel/memoryBaseUrl/memoryApiKey`（优先取当前 Agent 的 lite 配置，如无则使用默认 Agent 的 lite），后端据此构造 lite 记忆 Agent。
- 主 Agent 可继续用高质量模型，记忆读写/优化始终走 lite 配置，避免 token 过高且保留未来更换 provider 的灵活性。
- 无论是主 Agent 还是 lite fallback，只要 `enable_long_term_memory` 关闭、请求缺少 `userId` 或 memory manager 不可用，就不会执行任何记忆操作。
