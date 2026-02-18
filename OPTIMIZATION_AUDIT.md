# Qurio 前后端优化审计报告

> **最后更新**: 2026-02-19
> **状态**: 7/10 已完成 · 3/10 待处理

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

### 4. ⏳ Bundle 依赖冗余 — **未处理**

```json
"@google/genai": "^1.41.0",          // 新版 — 保留
"@google/generative-ai": "^0.24.1",  // 旧版 — 待移除
"gsap": "^3.14.2",                    // 动画库 1
"framer-motion": "^12.34.0",          // 动画库 2
"three": "^0.182.0",                  // 3D 库 — 确认是否必需
"styled-components": "^6.3.9",       // CSS-in-JS — 确认是否还在使用
```

**建议（待执行）：**

- 统一使用 `@google/genai`，移除旧版
- 选一个动画库或按需懒加载
- 验证 `styled-components` 和 `three` 是否仍在使用

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

### 9. ⏳ 后端 `bare except` 模式 — **未处理**

`stream_chat.py` 中仍存在 `except:` 而非 `except Exception:` 的模式。

### 10. ✅ 外部字体非阻塞加载 — **已确认无需修改**

`main.jsx` 使用 `document.createElement('link')` 动态创建，天然为异步非阻塞加载。

---

## 进度总结

| #   | 优化项                    | 状态                          |
| --- | ------------------------- | ----------------------------- |
| 1   | 拆分巨型组件              | ⏳ 未处理（高风险，建议渐进） |
| 2   | `stream_chat.py` 重复代码 | ✅ 已减少 ~280 行             |
| 3   | `markdownComponents` 引用 | ✅ 已修复                     |
| 4   | 清理冗余依赖              | ⏳ 未处理                     |
| 5   | 大型组件 memo 化          | ✅ 已完成                     |
| 6   | SQL 外置                  | ✅ 已完成                     |
| 7   | devDependencies 修正      | ✅ 已完成                     |
| 8   | import 位置修正           | ✅ 已完成                     |
| 9   | bare except 修正          | ⏳ 未处理                     |
| 10  | 字体非阻塞加载            | ✅ 确认无需修改               |

---

## 变更记录

| 日期       | 变更内容                                                              |
| ---------- | --------------------------------------------------------------------- |
| 2026-02-19 | 初始审计；完成 Phase 1（前端快修）、Phase 2（后端去重）、组件 memo 化 |
