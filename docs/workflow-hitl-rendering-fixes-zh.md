# 工作流 / HITL 渲染问题修复说明（中文）

## 背景
近期在消息渲染中出现了多类体验问题，主要集中在「工作流折叠区」「交互式表单（HITL）」「流式输出」三者的组合场景：

1. 多次深度思考与工具调用时，消息区域过于冗长。
2. HITL 提交后，第二轮思考/工具调用插入到中间，而不是追加到末尾。
3. 正文与交互式表单顺序不稳定，刷新前后表现不一致。
4. 工具耗时与思考状态在流式阶段有误导（例如看起来耗时异常、思考状态未及时结束）。
5. 偶发乱码字符（`�`/`ï¿½`）出现在正文首句或切换工作流瞬间。

本文档汇总这批问题的根因与代码改动，便于协作排查和后续维护。

---

## 根因总结

## 1) 渲染顺序不一致（运行时 vs 刷新后）
- 运行时使用的是 `interleavedContent`（基于当前流式状态）。
- 刷新后更多依赖持久化后的 `stream_blocks` + 重组逻辑。
- 之前存在“把工具前正文注入工作流”的二次重排，导致刷新后正文被挪到工作流内。

## 2) HITL 第二轮插入位置错误
- 表单提交后新一轮事件可能从较小 `textIndex` 重新开始。
- 如果不做高水位（high-water mark）约束，后续 thought/tool 会被插入消息中间。

## 3) 乱码字符出现
- 一类是上游流式字节解码残留（`U+FFFD`、BOM、mojibake）。
- 另一类是按 `textIndex` 切片时切在 Unicode 代理对中间（尤其 emoji），导致渲染成 `�`。

---

## 主要改动

## A. 工作流结构与展示
- 将深度思考和工具调用统一收敛到单一可折叠工作流区域。
- 工作流头在流式阶段显示“思考中”或“某工具调用中”。
- 工作流内深度思考内容保持展开（不再单独折叠）。

涉及文件：
- `src/components/MessageBubble.jsx`
- `src/locales/zh-CN.json`
- `src/locales/en.json`

---

## B. 正文 / 表单 / 工作流顺序统一为“自然位置”
- 工作流仅渲染：
  - `thought`
  - 非 `interactive_form` 的工具调用
- 正文与交互式表单按 `interleavedContent` 原始顺序渲染，不再二次搬运。
- 删除“工具前正文自动注入工作流”的规则，解决刷新后正文跑回工作流的问题。

涉及文件：
- `src/components/MessageBubble.jsx`

---

## C. HITL 第二轮索引稳定化（防中间插入）
- 在流式阶段新增索引归一化：
  - 维护 `maxObservedEventTextIndex`（高水位）
  - 检测回跳并自动重锚定（`streamTextIndexOffset`）
  - 保证事件索引单调不回退
- 应用于：
  - `tool_call`
  - `tool_result`（含 fallback 分支）
  - `thought`
  - `form_request`

涉及文件：
- `src/lib/chat/aiService.js`

---

## D. 乱码治理（根因 + 兜底）

### 1) 源头清洗（流式与持久化前）
- 清理：
  - `\uFFFD`
  - `\uFEFF`
  - `ï¿½`
  - `ï»¿`
- 统一在文本归一化函数中处理，覆盖 chunk、result、持久化前内容。

### 2) Unicode 安全切分（根因修复）
- 新增切分边界保护：切片时若命中 surrogate pair 中间，回退 1 位到合法边界。
- 同时应用于：
  - `MessageBubble` 的事件切分
  - `aiService` 的 `buildStreamBlocks` 切分

### 3) 渲染层兜底
- Streamdown 前再做一次轻量清洗，避免历史脏数据在 UI 短暂暴露。

涉及文件：
- `src/lib/chat/aiService.js`
- `src/components/MessageBubble.jsx`

---

## E. 工具耗时与状态修复
- 本地记录工具开始时间，按工具实例计算耗时。
- 当后端返回疑似累计时长时，优先使用本地单次耗时。
- 正文出现后，思考中状态自动结束，避免“已出正文但仍显示思考中”。

涉及文件：
- `src/lib/chat/aiService.js`
- `src/components/MessageBubble.jsx`

---

## F. 稳定性改进

## 1) OPENAI_API_KEY 缺失导致自动代理 500
- 缺失 key 时跳过 auto-agent 预选逻辑，回退默认路径。
- 后端路由增加容错，返回可恢复结果而非直接 500。

涉及文件：
- `src/lib/chatStore.js`
- `backend-python/src/routes/agent_for_auto.py`

## 2) `webpage_reader` 超时导致会话卡死
- 捕获 `httpx.ReadTimeout` 与 `httpx.HTTPError`，返回结构化错误，不抛出致命异常。
- 去除重复工具注册，补齐参数与超时处理。

涉及文件：
- `backend-python/src/services/custom_tools.py`

---

## 回归验证建议

1. 普通工具流：
- 连续多次 thought/tool 后，工作流默认折叠，展开可见完整过程。

2. HITL 场景：
- 表单前正文应在主正文区域。
- 表单显示在自然调用位置（不在最顶部/最底部漂移）。
- 提交表单后第二轮 thought/tool 应追加到工作流末尾，不插入中间。

3. 刷新一致性：
- 刷新前后正文/表单/工作流相对位置保持一致。

4. 乱码回归：
- 包含 emoji 与中英文混排时，不应出现 `�` 或 `ï¿½`。

5. 状态与耗时：
- 本地时间等轻量工具不再出现离谱耗时。
- 正文开始渲染后，思考状态应结束。

---

## 备注
- 构建校验已通过：`bun run build`。
- 当前构建输出中的 scrollbar CSS warning 为既有问题，与本次修复无直接关系。
