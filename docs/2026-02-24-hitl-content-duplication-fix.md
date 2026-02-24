# HITL 续跑正文重复 Bug 修复

**日期：** 2026-02-24  
**文件：** `backend-python/src/services/stream_chat.py`  
**位置：** `StreamChatService._continue_hitl_run()` → 内部函数 `_stream_events()`，约第 1581 行

---

## 现象

用户提交 HITL（Human-In-The-Loop）表单后，AI 的续跑回答内容会出现**完整重复**——整段正文被渲染了两遍。如截图所示，天气预报等完整答案在 UI 上连续出现两次。

---

## 根本原因

### Agno SDK 的 `yield_run_output=True` 行为

`_continue_hitl_run()` 调用 `agent.continue_run(...)` 时，设置了 `yield_run_output=True`：

```python
stream = agent.continue_run(
    run_response=restored_run_output,
    stream=True,
    stream_events=True,
    yield_run_output=True,   # ← 关键参数
    ...
)
```

当该参数为 `True` 时，Agno SDK 的事件流行为如下：
1. 正常逐块发出 `run_content` 流式事件（每次一小段文字）→ 前端渐进渲染
2. 流结束后，**额外再 yield 一个 `RunOutput` 对象**，其 `content` 字段包含完整正文全文

### 原代码的错误处理

原代码收到 `RunOutput` 对象后，**无条件**把其 `content` 通过 `process_text()` 再次发送给前端：

```python
# ❌ 修复前（有 Bug）
if isinstance(run_event, RunOutput):
    saw_terminal_completion = True
    completed_content_fallback, _ = _extract_completed_content_and_output(...)
    text_from_output = _extract_text_from_message_content(
        getattr(run_event, "content", None)
    ).strip()
    if text_from_output:
        for e in process_text(text_from_output):
            yield e   # ← 把完整正文又发了一遍！
    continue
```

结果：前端先收到若干流式 chunk 拼出完整正文，随后又收到一次完整正文，导致内容**出现两遍**。

---

## 修复方案

加入 `if not full_content:` 守卫条件：**只有当流式事件完全没有产生任何内容时（即 `full_content` 为空），才使用 `RunOutput.content` 补发**。这样对于正常发出了流式 chunk 的情况，`RunOutput` 仅作为 `completed_content_fallback` 的更新来源，不再重复发送到前端。

```python
# ✅ 修复后
if isinstance(run_event, RunOutput):
    saw_terminal_completion = True
    completed_content_fallback, _ = _extract_completed_content_and_output(
        run_event,
        completed_content_fallback or full_content,
    )
    # 只在流式事件没有产生任何内容时才补发（稀疏事件 Provider 的兜底）
    if not full_content:
        text_from_output = _extract_text_from_message_content(
            getattr(run_event, "content", None)
        ).strip()
        if text_from_output:
            for e in process_text(text_from_output):
                yield e
    continue
```

---

## 修复效果总结

| 场景 | 修复前 | 修复后 |
|------|--------|--------|
| 正常流式 Provider（如 OpenAI、Gemini 等） | 正文出现两遍 | 正文只出现一遍 ✅ |
| 稀疏事件 Provider（无 run_content 事件） | 正常（只有 RunOutput 一次） | 正常（仍用 RunOutput 补发）✅ |
| 续跑仍是流式渲染 | 是 | 是（流式逻辑不受影响）✅ |

---

## 为什么不直接移除 `yield_run_output=True`？

`yield_run_output=True` 是必要的，因为：
1. `saw_terminal_completion` 标志依赖于 `RunOutput` 对象，用于判断流是否正常结束
2. `completed_content_fallback` 需要从 `RunOutput.content` 更新，作为稀疏 Provider 的内容兜底
3. 部分 Provider 可能不发出 `run_completed` 事件，`RunOutput` 是唯一的终止信号

因此正确做法是保留 `yield_run_output=True`，但通过 `full_content` 守卫避免重复发送内容。
