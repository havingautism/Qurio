# 2026-02-07：上下文轮数与 Session Summary 改造总结

## 背景
- 之前设置项使用 `contextMessageLimit`（按“消息条数”），用户感知不直观。
- `session_summary` 在重生/编辑场景可能把旧回答重新带回上下文，造成“历史污染”。

## 改造目标
- 将上下文控制从“消息数”统一为“轮数”（`contextTurns`，一问一答为一轮）。
- 让 `session_summary` 只在需要时注入（超出轮数窗口时），避免低轮次噪声。
- 修复重生/编辑时的摘要污染问题。

## 核心变更

### 1) 设置项统一为 `contextTurns`
- 前端设置页改为“上下文轮数”，内部状态与保存字段都改为 `contextTurns`。
- 中英文文案同步更新：
  - `Context Turns`
  - `上下文轮数（1 轮 = 一问一答）`

### 2) 前后端协议兼容升级
- 请求新增 `contextTurns` 字段。
- 仍保留 `contextMessageLimit` 兼容老版本调用（回退读取），但新逻辑以 `contextTurns` 为主。

### 3) 后端上下文窗口改为“按轮切片”
- 由固定窗口改为动态窗口：保留最近 `contextTurns` 个 user turn（并包含其 assistant/tool）。
- 不再固定写死 2 轮。

### 4) Session Summary 注入策略优化
- 仅当“总轮数 > contextTurns”时才注入 `session_summary`。
- 低轮次会话直接用原始消息，不强行注入摘要。

### 5) 重生/编辑场景防污染
- 前端请求带 `isEditingExisting` 标记。
- 后端在编辑/重生时：
  - 不注入旧 `session_summary`；
  - 摘要更新走“重建模式”（基于当前请求上下文 + 新回答），避免旧错误答案继续污染。

### 6) 远端/本地设置迁移
- 本地：
  - 读取优先 `contextTurns`，旧 `contextMessageLimit` 仅回退。
  - 保存只写 `contextTurns`，并清理本地旧键。
- 远端 `user_settings`：
  - 同步新增 `contextTurns`。
  - 读取时对旧键做 fallback 映射。
  - 保存后清理远端旧键 `contextMessageLimit`。

## 影响与收益
- 用户理解成本更低：设置和实际行为都以“轮数”为单位。
- 低轮次对话更干净：减少摘要噪声干扰。
- 重生/编辑更稳定：避免旧回答通过摘要“回流”。
- 兼容性可控：老字段仍可被读取，不会立即破坏旧客户端。

## 验证
- 已完成前端关键文件语法检查（`node --check` 针对 `.js` 文件）。
- 已完成后端 Python 语法检查（`py_compile`）。
- 关键链路已覆盖：
  - 设置读写与迁移；
  - 请求参数透传；
  - 后端上下文裁剪与摘要注入；
  - 重生/编辑分支的摘要重建。
