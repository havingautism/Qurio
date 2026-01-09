# Concurrent Academic Research Logic Documentation
# 并发学术研究逻辑文档

This document explains the implementation details, execution flow, and trade-offs of the Concurrent Academic Research feature.

本文档解释了并发学术研究功能的实现细节、执行流程以及权衡考量。

---

## Overview
## 概览

Concurrent Academic Research allows the AI to execute all research steps simultaneously instead of sequentially. This significantly reduces total execution time but trades off the ability for later steps to adapt based on earlier findings.

并发学术研究允许 AI 同时执行所有研究步骤，而不是按顺序执行。这显著减少了总执行时间，但代价是后续步骤无法根据早期发现进行调整。

**Key Features 关键特性:**
- **Parallel Execution 并行执行**: All steps run at once using `Promise.all`.
- **Independent Context 独立上下文**: Steps do not share intermediate findings.
- **Ordered Aggregation 有序聚合**: Results are re-assembled in logical order for the final report.
- **Academic Exclusive 仅限学术模式**: Only available for "Academic" research type to ensure quality control.

---

## Part 1: UI Trigger (Frontend)
## 第一部分：UI 触发（前端）

### Conditional Rendering (HomeView.jsx)
### 条件渲染 (HomeView.jsx)

The concurrency toggle is strictly limited to the "Academic" research type.

并发开关严格限制为“学术”研究类型。

**Code logic 代码逻辑:**
```javascript
// src/views/HomeView.jsx

{deepResearchType === 'academic' && (
  <div className="concurrent-toggle">
    {/* Only visible when type is 'academic' */}
    {/* 仅在类型为 'academic' 时可见 */}
    <input
      type="checkbox"
      checked={deepResearchConcurrent}
      onChange={e => setDeepResearchConcurrent(e.target.checked)}
    />
    <span>{t('homeView.concurrentExecution')}</span>
  </div>
)}
```

### Parameter Transmission
### 参数传递

When starting research, the `concurrentExecution` flag is passed to the backend via `backendClient`.

开始研究时，`concurrentExecution` 标志通过 `backendClient` 传递给后端。

**Code location 代码位置:** `src/lib/backendClient.js`

---

## Part 2: Execution Engine (Backend)
## 第二部分：执行引擎（后端）

### The Branching Logic (deepResearchAgentService.js)
### 分支逻辑 (deepResearchAgentService.js)

The `streamDeepResearch` function checks the `concurrentExecution` flag to decide the execution mode.

`streamDeepResearch` 函数检查 `concurrentExecution` 标志以决定执行模式。

**Code location 代码位置:** `backend/src/services/deepResearchAgentService.js` (Lines ~750+)

### Concurrent Implementation
### 并发实现

Instead of a `for` loop with `await`, the system maps steps to an array of Promises and executes them in parallel.

系统不是使用带有 `await` 的 `for` 循环，而是将步骤映射为 Promise 数组并并行执行。

#### 1. Immediate State Emission 立即状态发射
First, the system notifies the UI that all steps are "Pending".

首先，系统通知 UI 所有步骤均为“等待中”。

```javascript
for (let i = 0; i < steps.length; i++) {
  yield { status: 'pending', stepIndex: i, ... }
}
```

#### 2. Parallel Promise Creation 并行 Promise 创建
Every step is wrapped in an async function that runs independently.

每个步骤都被包装在一个独立运行的异步函数中。

```javascript
const stepPromises = steps.map(async (step, i) => {
  // 1. Emit 'Running' event 发射“运行中”事件
  await yieldEvent({ status: 'running', ... })

  // 2. Execute Step (Note: priorFindings is empty!)
  // 2. 执行步骤（注意：priorFindings 为空！）
  const result = await runToolCallingStep({
    priorFindings: [], // Independent context 独立上下文
    ...
  })

  // 3. Emit 'Done' event 发射“完成”事件
  await yieldEvent({ status: 'done', ... })

  return { content: result, index: i }
})
```

#### 3. Awaiting Completion 等待完成
```javascript
const results = await Promise.all(stepPromises)
```

---

## Part 3: Result Aggregation
## 第三部分：结果聚合

Since steps finish in random order, they must be sorted before generating the final report.

由于步骤完成顺序是随机的，因而在生成最终报告前必须进行排序。

### Sorting & Collection
### 排序与收集

```javascript
// Sort by original index to restore logical flow
// 按原始索引排序以恢复逻辑流
const sortedFindings = results
  .sort((a, b) => a.index - b.index)
  .map(r => r.content)

// Add to findings array
// 添加到 findings 数组
findings.push(...sortedFindings)
```

### Report Generation
### 报告生成

The final report model receives the sorted findings. Even though steps were executed in parallel, the report writer sees them as a coherent list of information.

最终报告模型接收排序后的发现。即使步骤是并行执行的，报告撰写者也会将其视为连贯的信息列表。

---

## Mechanism Comparison
## 机制对比

| Feature 特性 | Sequential (Default) 串行（默认） | Concurrent (Experimental) 并发（实验性） |
| :--- | :--- | :--- |
| **Speed 速度** | Slower (Sum of all steps) <br> 较慢（所有步骤之和） | **Fast (Max of slowest step)** <br> **快（取决于最慢的步骤）** |
| **Context 上下文** | Shared (Step 2 sees Step 1) <br> 共享（步骤2可见步骤1） | **Independent (Isolated)** <br> **独立（隔离）** |
| **Adaptability 适应性** | High (Can pivot direction) <br> 高（可调整方向） | Low (Fixed plan) <br> 低（固定计划） |
| **Use Case 适用场景** | Complex, multi-stage reasoning <br> 复杂的多阶段推理 | Broad info gathering, literature reviews <br> 广泛信息收集，文献综述 |

---

## File Reference
## 文件参考

- `src/views/HomeView.jsx` - UI Trigger Switch / UI 触发开关
- `backend/src/services/deepResearchAgentService.js` - Core Logic / 核心逻辑
- `src/locales/*.json` - I18n Strings / 多语言字符串
