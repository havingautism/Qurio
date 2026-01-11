# 会话发送时的文档上下文绑定流程

## 1. 文档选择与上下文准备（`ChatInterface.jsx`）
- 通过 `spaceDocuments` + `selectedDocumentIds` 维护当前会话绑定的文档列表，`selectedDocuments` 由 `useMemo` 过滤得到。
- 每次发送请求前，先用 `buildDocumentSources` 统计文档标题/类型/摘要，用于后续展示（「文档来源」按钮）和基础 fallback。
- 如果当前问题不空且已有选中的文档，会调用 `fetchRelevantDocumentSources`（`documentRetrievalService.js`）对输入文本做向量检索，查询 `document_chunks` 中余弦相似度最高的几个 chunk，并将结果按得分排序，返回 `context` + `sources`。
- 将检索结果转换为“High/Medium/Low relevance”描述的英文段落（`formatDocumentAppendText`），准备拼接到本次 user 文本后部，同时决定要传给后端保存的 `documentSources`（如果检索失败就用 fallback 的 `buildDocumentSources` 结果）。

## 2. 构造发送 payload（`ChatInterface.jsx` + `chatStore.js`）
-  `ChatInterface` 通过 `sendMessage` 传递 `documentSources` 和 `documentContextAppend`，但只把结构化的摘要拼进要发给 LLM 的 user 文本（`buildUserMessage` 中拼接 `documentContextAppend`），前端 UI 仍只显示用户原文。
- `documentSources` 仍会被保存到消息对象中，供「文档来源」按钮和后续刷新使用。
- `prepareAIPlaceholder` 删除了原来的 system-prompt 插入路径，只保留真实的 conversation history，而文档附带内容只在 payload 中体现，不污染 system 层级。

## 3. 向量/数据库支持
- `documentRetrievalService` 负责通过 `fetchEmbeddingVector` 取得查询向量，并从 `document_chunks` 中拉出 chunk、计算 cosine similarity，返回 top chunks 的文本摘要和 metadata。
- ?? Supabase RPC `match_document_chunks` ?????? cosine similarity ?? top chunks????? limit ???????
- ?????? `taskType: RETRIEVAL_QUERY`???????????? taskType?
- ??? `chunkLimit` ?????????????? 2000????????????????
- 新增字段 `conversation_messages.document_sources`（`supabase/init.sql` & 迁移）用于持久化 document sources，便于刷新后继续展示。
- 余弦函数抽象在 `vectorUtils.js` 中，以便复用；chunk 数据持久化在 `documentIndexService.js`，采集在上传/embedding 流里。

## 4. 目标效果
- 用户问的问题只显示原始文字，下方的文档来源按钮独立显示相关 chunk；实际发送给模型的内容在问题后附带“以下文档片段……”的英文注释，方便保留上下文但不干扰 UI 展示。
