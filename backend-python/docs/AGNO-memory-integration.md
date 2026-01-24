# AGNO 长期记忆集成说明

## 目标
- 终结当前自建的长期记忆逻辑，改用 AGNO 官方 memory 路径（参考 https://docs.agno.com/context/memory/overview 和 https://docs.agno.com/context/memory/working-with-memories/overview）。
- UX 端保留“长期记忆”开关，控制 `enableLongTermMemory` 参数，后台只有在这个标记及 `enable_long_term_memory` 为 true 时才读写记忆。
- 目前仅使用 Supabase 作为数据源，但保留 provider 等级的结构以便未来扩展。
- 后端位于 `backend-python`，由它调用 AGNO memory manager 与 Supabase 同步。

## 现行逻辑概要
1. 设置页的开关同步到 `chatStore.memoryEnabled`，并在 `/api/stream-chat` 请求中附带 `enableLongTermMemory`；后端只有这个字段为 true（与 `enable_long_term_memory` 相等）且请求包含合法 `userId` 时才会启动记忆读写。
2. 记忆写入/读取走 AGNO memory manager，所有流量都到 `backend-python` 的 agent（主 agent 或 lite agent）；前端只负责传 Supabase 配置与开关状态。
3. Supabase 参数由前端通过 `databaseProvider`/`databaseConfig` 传递，后端在 `agent_registry._build_memory_kwargs` 中识别 provider 为 `supabase` 才创建 `PostgresDb` 连接并设置 `update_memory_on_run=True`。
4. 多 agent 共用同一 Supabase 数据库且启用 `update_memory_on_run`，任何一个 agent 写入的记忆都对其他 agent 可见。

## 数据库/表结构说明
- AGNO memory 会在 Supabase 内部自动建表（通过 `postgresql://postgres:<service-role>@db.<project>.supabase.co:5432/postgres?sslmode=require`），无需手动创建。
- 未来新增 provider 只需在 UI/配置里增加选项，并在 `agent_registry.build_memory_agent` 中传入 provider/model 即可。

## 需要注意
- Supabase 变更时同步前端的 database 配置与 `backend-python/.env`（比如 `DATABASE_PROVIDER`）。
- “长期记忆”开关与 `enable_long_term_memory` 必须一致：开关决定前端是否传参，后端才有开关值可读。
- 记忆数据不再存到 local storage 或临时会话，只存在 AGNO + Supabase。

## 记忆优化与多 agent 共享
- 记忆优化通过 `agent.memory_manager.optimize_memories(..., strategy=MemoryOptimizationStrategyType.SUMMARIZE)` 压缩 token，默认以当前 agent 的 lite 模型为标准。
- 多 agent 共享只要统一指向 Supabase 并打开 `update_memory_on_run`，任何一个 agent 写入的记忆都对其它 agent 可见。
- `memory_service.optimize_user_memories` 允许传 `provider/model/base_url/api_key`，方便手动调度时传 agent lite metadata。

## 自动优化策略
- `StreamChatService` 完成 run 后检查 `request.enable_long_term_memory`、`user_id` 与 lite agent memory_manager；满足条件才继续。
- 若记忆数 ≥ 50 且距上次优化 ≥ 12 小时，后台自动执行 `memory_manager.optimize_memories(..., strategy=SUMMARIZE, apply=True)`，以 `asyncio.to_thread` 在后台运行，避免每次会话都跑。
- 这个流程遵循 AGNO “batch memories should auto-summarize” 最佳实践，并只在 `enable_long_term_memory` 为 true 时有效。

## 常见 WARN：Supabase credentials missing
- 看到 `Supabase credentials are missing; cannot initialize AGNO memory store.` 或 `Memory requested but Supabase memory store is unavailable.` 时说明 ENV 里缺 `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`（service-role key，必须在 Supabase 控制台拿）。
- 只有在 `enable_long_term_memory`（即开关）为 true 的情况下才会触发该逻辑；关闭开关或让前端传 `enableLongTermMemory: false` 就不会触发 WARN。
- 准备好 credentials 后再打开放记忆功能，AGNO 会自动在 Supabase 建表，警告也会消失。

## 备选 Agent 与 lite 模型兜底
- 记忆 API 使用当前上下文的 lite 配置：前端在 `/api/stream-chat` 中附加 `memoryProvider/memoryModel/memoryBaseUrl/memoryApiKey`（优先取当前 agent 的 lite 设置，否则 fallback 到默认 agent）。
- 主 agent 即便用高质量模型，记忆读写/优化也始终沿用 lite 配置，既避免高 token 成本，又保留未来切 provider 的弹性。
- 无论主 agent 还是 lite fallback，只要 `enable_long_term_memory` 关闭、请求少了 `userId` 或 memory_manager 无效，就不会做记忆操作。
