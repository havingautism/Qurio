# 2026-02-24 修改总结

**日期：** 2026-02-24

---

## 一、HITL 续跑正文重复 Bug 修复

**文件：** `backend-python/src/services/stream_chat.py`  
**位置：** `StreamChatService._continue_hitl_run()` → 内部函数 `_stream_events()`



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

---

## 二、Scrapbook 随手记功能改动

### 1. 核心设计：Title 与 Summary 拆分生成

**为什么要拆分？**

保存链接时，最理想的体验是**立刻跳转到详情页**，而不是等 AI 把标题和总结都生成完再跳。如果两者同步生成，用户需要等待 10–60 秒，体验极差。

因此拆分为**快慢两条路径**：

| | Title（标题） | Summary（总结） |
|---|---|---|
| 生成时机 | 保存时，同步 | 进入详情页后，异步 |
| 生成方式 | 优先从网页 `<title>` 读取，极少数才用 AI | 始终由 AI 流式生成 |
| 速度 | 几乎即时（< 1 秒） | 10–60 秒（流式渐进展示） |
| 用户感知 | 保存后立刻跳转 + 看到标题 | 进入详情页后开始实时流出文字 |

---

**Title 获取逻辑（后端 `create_scrapbook_entry`，优先级从高到低）：**

1. **网页自带 `<title>`**：x-reader 或 Jina.ai 抓取时直接读取，无需 AI，零延迟
2. **AI 快速生成（兜底）**：仅当读不到网页标题时，截取 800 字文章片段调用 AI 快速生成
3. **URL 地址 / "Untitled"**：最终兜底

---

**Summary 生成逻辑（前端 `handleGenerateDeepSummary`）：**

进入详情页后，`useEffect` 检测 `entry.summary` 为空时自动触发：
- 用 `hasTriggeredRef` 防止热重载/重渲染导致重复触发
- 组装 System Prompt（严格限定角色和输出行为）+ User Prompt（完整文章内容）
- 调用 `streamChatViaBackend` 发起 SSE 流式请求，`onChunk` 逐 token 更新 `streamedSummary`，Markdown 实时渲染
- `onFinish` 回调通过 `PATCH /api/scrapbook/{id}` 将完整摘要写入数据库，并更新本地 `entry.summary` 状态，防止再次进入时重复生成

**根因修复（values vs payload）：** `_update()` 读取 `req.payload`，原代码传的是 `values=body` 导致 update 为空操作，现改为 `payload=body`。


### 2. Prompt 优化

- 拆分为 **System Prompt**（角色约束 + 禁止废话 + 禁止输出思考过程）和 **User Prompt**（文章内容）两层，防止注意力稀释。
- `onChunk` 中双重过滤思考内容：
  - 跳过 `chunkObj.type === 'thought'` 的原生思维链 chunk（Gemini Thinking、Claude 3.7 等）
  - 流式过滤 `<think>...</think>` 标签（DeepSeek 等非原生思考模型输出的明文标签）
- 参数：`temperature: 0.3, top_p: 0.9, thinking: false`

### 3. 后端新增 PATCH 接口

**文件：** `backend-python/src/routes/scrapbook.py`

新增 `PATCH /api/scrapbook/{entry_id}` 路由，接受任意字段 JSON body，更新数据库中对应条目（如 `summary`）。

### 4. 后端 URL 平台识别

新增 `_detect_platform_from_url(url)` 函数，通过 URL 关键词识别平台：

| URL 特征 | 平台 |
|---|---|
| `youtube.com` / `youtu.be` | `youtube` |
| `bilibili.com` / `b23.tv` | `bilibili` |
| `xiaohongshu.com` / `xhslink.com` | `xhs` |
| `mp.weixin.qq.com` | `wechat` |
| `twitter.com` / `x.com` | `twitter` |
| `t.me` | `telegram` |

Jina.ai 兜底路径原先写死返回 `platform: 'unknown'`，现在调用此函数完成识别。

### 5. 卡片 UI 修复

- **日期与删除图标重叠：** 将删除按钮从 `absolute top-3 right-3` 改为内联在 header `flex` 行中（平台标签 + 日期 + 删除按钮同行）。
- **删除确认弹窗：** 接入 `showConfirmation()`，点击删除图标弹出确认 modal，不再直接删除。

### 6. Sidebar Scrapbook 图标行为

**文件：** `src/components/Sidebar.jsx`

将 Scrapbook 的 `onMouseEnter` 从 `setHoveredTab(item.id)` 中排除，`onClick` 直接调用 `onNavigate('scrapbook')`，使其作为直接导航按钮而非展开侧边栏历史面板。

### 7. 详情页底部重新生成按钮

**文件：** `src/views/ScrapbookDetailView.jsx`

在摘要卡片下方添加「↺ 重新生成总结」按钮：清空当前 summary/streamedSummary 状态后重新调用 `handleGenerateDeepSummary()`。生成中按钮隐藏，防止重复触发。
