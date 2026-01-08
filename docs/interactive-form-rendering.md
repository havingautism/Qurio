# Interactive Form Rendering Notes
# 交互式表单渲染说明

This document summarizes how interactive forms are rendered inside assistant messages
and how follow-up content is merged and displayed.

本文档总结了交互式表单在助手消息中的渲染方式，以及后续拼接正文的合并与展示逻辑。

## Data Flow Overview
## 数据流概览

- Form requests come from tool calls in `toolCallHistory` with `name === 'interactive_form'`.
- User submissions are sent as a user message whose content starts with
  `[Form Submission]`.
- The assistant response that follows a submission may be a continuation message.
  These continuation messages are merged into the original assistant message.

- 表单请求来自 `toolCallHistory` 中 `name === 'interactive_form'` 的工具调用。
- 用户提交会以 user 消息的形式发送，内容以 `[Form Submission]` 开头。
- 提交后的助手响应可能是续正文消息，会与原始助手消息进行合并展示。

## Merge Logic (MessageBubble.jsx)
## 合并逻辑（MessageBubble.jsx）

The component merges a form message with its subsequent submission + continuation
messages into a single `mergedMessage`:

- Start from the current AI message.
- Scan forward in the `messages` array:
  - If the next message is a user `[Form Submission]`, mark current form tools as submitted,
    parse submitted values, and check the AI message after it.
  - If an AI continuation exists, merge:
    - Content (append with `\n\n`)
    - Tool calls (with `textIndex` offset adjusted)
    - Sources, related questions, and loading state
  - Track whether a continuation is still pending (`_isContinuationLoading`).

- 从当前 AI 消息开始。
- 向后扫描 `messages`：
  - 如果下一个是 user 的 `[Form Submission]`，标记当前表单工具为已提交，
    解析提交字段和值，并检查其后的 AI 消息。
  - 如果存在 AI 续正文，则合并：
    - 正文内容（用 `\n\n` 追加）
    - 工具调用（`textIndex` 会根据当前正文长度偏移）
    - 引用来源、相关问题与加载状态
  - 同时记录是否仍在等待续正文（`_isContinuationLoading`）。

Important fields added on the merged message:

- `_formSubmitted`: true once a submission was found.
- `_formSubmittedValues`: parsed field/value pairs from submissions.
- `_isContinuationLoading`: true when a submission exists but no AI continuation yet.

- `_formSubmitted`：发现提交后为 true。
- `_formSubmittedValues`：表单提交解析出的字段和值。
- `_isContinuationLoading`：存在提交但尚无 AI 续正文时为 true。

## Rendering Pipeline (Interleaving Text + Tools)
## 渲染管线（正文 + 工具穿插）

The message content is broken into interleaved parts based on `toolCallHistory`:

- `interleavedContent` is a list of:
  - `{ type: 'text', content: string }`
  - `{ type: 'tools', items: tool[] }`
- Tool `textIndex` determines where the tool block is inserted into text.
  - `interactive_form` defaults to end of content when `textIndex` is missing.

- `interleavedContent` 是一个列表：
  - `{ type: 'text', content: string }`
  - `{ type: 'tools', items: tool[] }`
- 工具的 `textIndex` 决定其插入正文的位置。
  - 若 `interactive_form` 缺少 `textIndex`，默认插在正文末尾。

## Interactive Form Rendering
## 交互式表单渲染

Inside a `tools` block:

- Split items into:
  - `formTools` (interactive form tool calls)
  - `regularTools` (other tool calls)
- Render regular tools as the tool list card.
- Render each interactive form:
  - Try to parse tool `arguments` or `output` as JSON.
  - If parse succeeds, render `<InteractiveForm />`.
  - If parsing fails and tool is still streaming or not done, show a skeleton.
  - If parsing fails and the tool is done, show a small error block.

- 工具项会拆分为：
  - `formTools`（交互式表单工具）
  - `regularTools`（其他工具）
- 先渲染普通工具列表卡片。
- 再渲染每个交互式表单：
  - 尝试从 `arguments` 或 `output` 解析 JSON。
  - 解析成功则渲染 `<InteractiveForm />`。
  - 解析失败但仍在流式/未完成时显示骨架屏。
  - 解析失败且已完成则显示错误提示。

## Status Badges (Waiting + Submitted)
## 状态标记（等待中 / 已提交）

There are two statuses:

- "正在等待用户输入..." (waiting)
  - Rendered at the end of the main content block
    when a form exists but has not been submitted.
- "用户已输入" (submitted)
  - Implemented with a virtual tool marker.
  - A tool item `{ name: 'form_submission_status', textIndex: X }` is injected
    when the continuation content is merged.
  - During rendering, if a tools block includes this marker, the next text block
    will insert a "用户已输入" badge before that text.

- “正在等待用户输入...”：
  - 有表单但未提交时，显示在正文尾部。
- “用户已输入”：
  - 通过虚拟工具标记实现。
  - 合并续正文时插入 `{ name: 'form_submission_status', textIndex: X }`。
  - 渲染时如果工具块包含该标记，会在下一个文本块前插入“用户已输入”。

This ensures "用户已输入" aligns with the start of the continuation text rather than
appearing at the end of the form itself.

这样可保证“用户已输入”对齐到续正文开头，而不是出现在表单末尾。

## Continuation Loading UX
## 续正文加载体验

When `_isContinuationLoading` is true:

- The existing interleaved content is still rendered.
- A "用户已输入" badge is shown at the end of the main content.
- A skeleton block is appended to indicate the pending continuation response.

- 仍渲染已生成的正文和工具内容。
- 在正文末尾展示“用户已输入”。
- 追加一段骨架屏提示续正文正在生成。

This keeps context visible while signaling that more content is coming.

这样既保留上下文，又能提示后续内容正在加载。

## Timeline Filtering (QuestionTimelineController.jsx)
## 时间轴过滤（QuestionTimelineController.jsx）

The question timeline ignores form submission messages:

- Any user message with content starting `[Form Submission]` is filtered out.
- Active item tracking skips these messages when resolving the current question.

- 任何以 `[Form Submission]` 开头的 user 消息都会被过滤掉。
- 当前激活项的计算会跳过这类提交消息。
