# 2026-02-07：上下文轮数与 Session Summary 逻辑简化

## 背景
- 之前有两套并行语义：
  - `contextMessageLimit`（按消息条数）
  - `contextTurns`（按轮数，一问一答为一轮）
- 同时还保留了“旧轮次编辑/重生”的兼容分支，导致 Session Summary 注入条件复杂、排查成本高。

## 本次最终策略
- 交互策略：只允许“最新一轮”编辑和重生。
- 上下文策略：统一按 `contextTurns` 控制上下文窗口。
- 摘要策略：仅在用户轮数超过 `contextTurns` 时，注入 `session_summary`。

## 代码层面的简化
### 1) 前端只允许最新轮可编辑/重生
- 在消息列表层计算“最新可操作 user/ai 索引”，只给该消息透传编辑/重生回调。
- 非最新消息不再显示编辑/重生按钮。
- 在 `ChatInterface` handler 层增加二次校验，防止绕过 UI 触发旧消息操作。

### 2) 移除 `isEditingExisting` 链路
- 前端 `callAIAPI` 不再传 `isEditingExisting`。
- 后端 `StreamChatRequest` 不再定义 `isEditingExisting`。
- Session Summary 注入逻辑不再区分“编辑旧轮次”分支。

### 3) Session Summary 注入条件收敛
- 保留逻辑：
  - 轮数未超过窗口：不注入摘要。
  - 轮数超过窗口：注入摘要 + 最近 `contextTurns` 原始消息。
  - 单轮请求（常见于最新轮重生）：触发“重建模式”，避免旧摘要回流。
- 移除逻辑：
  - “编辑/重生旧轮次”特判分支。

### 4) 接口字段统一
- 聊天流接口文档和参数统一使用 `contextTurns`。
- 不再在主聊天链路继续透传 `contextMessageLimit`。

## 结果
- 上下文与摘要策略更稳定，行为更可预测。
- 代码路径更短，调试点更少。
- 与“仅最新轮可编辑/重生”产品约束一致，避免历史摘要污染问题反复出现。
