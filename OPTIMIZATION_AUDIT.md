# Qurio 前后端优化审计报告

> **最后更新**: 2026-02-19
> **状态**: 8/10 已完成 · 1/10 待处理 · 1/10 已回滚

## 概述

对 Qurio 项目前端（React / Electron）和后端（FastAPI / Python）的代码质量、性能与可维护性进行了全面审计。以下按 **影响度** 从高到低排列，每项标注当前状态。

---

## 🔴 高优先级

### 1. ⏳ 巨型单文件组件需拆分

| 文件                               | 行数   | 大小   | 状态                   |
| ---------------------------------- | ------ | ------ | ---------------------- |
| `src/components/SettingsModal.jsx` | ~3,824 | 176 KB | SQL 已外置，整体未拆   |
| `src/components/MessageBubble.jsx` | ~4,015 | 161 KB | 引用已稳定化，整体未拆 |
| `src/lib/chatStore.js`             | 2,616  | 112 KB | 未处理                 |
| `src/lib/backendProvider.js`       | 2,519  | 80 KB  | 未处理                 |
| `src/components/ChatInterface.jsx` | 2,289  | 79 KB  | 未处理                 |
| `src/components/Sidebar.jsx`       | 1,982  | 96 KB  | 未处理                 |
| `src/views/HomeView.jsx`           | 1,604  | 71 KB  | 未处理                 |

> **注意**: 完整拆分风险较高、工作量大，建议按需渐进式拆分。

---

### 2. ✅ 后端 `stream_chat.py` 代码重复 — **已解决**

`_extract_text_chunk()`（~73 行）和 `_extract_reasoning_chunk()`（~65 行）已提取为模块级共享函数，从 `stream_chat()` 和 `_continue_hitl_run()` 中移除了 **~280 行** 重复代码。

`_extract_reasoning_chunk` 通过 `trace_fn` 回调保留了 `[main]`/`[hitl]` 的日志标签区分。

> **注意**: `trace_stream()`、`emit_thought_part()`、`process_text()` 因使用 `nonlocal` + `yield` 闭包模式，无法简单提取。事件处理主循环的统一同样需要更大规模的重构。

---

### 3. ✅ `markdownComponents` 引用不稳定 — **已解决**

- `createHeadingComponent` 已用 `useCallback` 包裹
- `MarkdownLinkRenderer` 已用 `useMemo` 包裹并添加 `displayName`
- `markdownComponents` 的 `useMemo` 现在能有效缓存

---

## 🟡 中优先级

### 4. ✅ Bundle 依赖冗余 — **已完成（本轮可落地部分）**

```json
"@google/genai": "(已移除，未发现代码引用)",
"@google/generative-ai": "(已不在 package.json)",
"gsap": "^3.14.2",                    // 使用中（HomeView）
"framer-motion": "(已不在 package.json)",
"three": "^0.182.0",                  // 使用中（ColorBendsBackground）
"styled-components": "^6.3.9",       // 使用中（DotLoader / FancyLoader）
```

**结果与建议：**

- 保留 `three` / `styled-components` / `gsap`（已有直接代码引用）
- `@google/genai` 已移除，`build:web` 已通过
- 若需要继续瘦身，可优先对 `HomeView` 动画模块做按需加载（下阶段）

### 5. ✅ 大型组件 `React.memo` — **已解决**

`MessageBubble`、`Sidebar`、`ChatInterface`、`HomeView` 均已包裹 `React.memo`，在 props 未变化时跳过重渲染。

---

## 🟢 低优先级

### 6. ✅ SQL Schema 外置 — **已解决**

~400 行 SQL 已从 `SettingsModal.jsx` 提取到 `src/assets/init-schema.sql`，通过 Rsbuild `asset/source` 规则导入。

### 7. ✅ `eslint`/`prettier` 移到 devDependencies — **已解决**

5 个 lint/format 包（`eslint-config-prettier`、`eslint-plugin-import`、`eslint-plugin-prettier`、`eslint-plugin-react`、`prettier`）已从 `dependencies` 移到 `devDependencies`。

### 8. ✅ `import` 位置不规范 — **已解决**

`MessageBubble.jsx` 中间的 `import useSettings` 已移至文件顶部。

### 9. ✅ 后端 `bare except` 模式 — **已确认修复**

在 `backend-python/src/services/stream_chat.py` 中已未检索到 `except:`，当前均为显式异常捕获（如 `except Exception:`）。

### 10. ↩️ 外部字体加载 UX — **已取消外部字体注入（按体验反馈）**

曾尝试在 `main.jsx` 增加 `preconnect` + `preload -> stylesheet`，但实际体验反馈较差。当前已进一步移除 Maple Mono 的异步样式注入，统一回落到本地/系统字体栈。

---

## 进度总结

| #   | 优化项                    | 状态                          |
| --- | ------------------------- | ----------------------------- |
| 1   | 拆分巨型组件              | ⏳ 未处理（高风险，建议渐进） |
| 2   | `stream_chat.py` 重复代码 | ✅ 已减少 ~280 行             |
| 3   | `markdownComponents` 引用 | ✅ 已修复                     |
| 4   | 清理冗余依赖              | ✅ 已完成                     |
| 5   | 大型组件 memo 化          | ✅ 已完成                     |
| 6   | SQL 外置                  | ✅ 已完成                     |
| 7   | devDependencies 修正      | ✅ 已完成                     |
| 8   | import 位置修正           | ✅ 已完成                     |
| 9   | bare except 修正          | ✅ 已确认修复                 |
| 10  | 字体加载 UX               | ↩️ 已取消外部字体注入         |

---

## 变更记录

| 日期       | 变更内容                                                              |
| ---------- | --------------------------------------------------------------------- |
| 2026-02-19 | 初始审计；完成 Phase 1（前端快修）、Phase 2（后端去重）、组件 memo 化 |
| 2026-02-19 | 同步审计文档：确认 `bare except` 已修复；更新依赖现状；优化字体加载（preconnect + preload） |
| 2026-02-19 | 移除未使用依赖 `@google/genai` 并通过构建验证；修复 scrollbar 无效选择器，消除构建 CSS 警告 |
| 2026-02-19 | 按 UX 反馈回滚字体预加载优化，恢复原有字体加载方式 |
| 2026-02-19 | 按 UX 反馈移除 Maple Mono 外部字体异步注入逻辑 |
