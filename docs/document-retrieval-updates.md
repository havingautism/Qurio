# Document Retrieval Updates / 文档检索更新

## 中文
本次更新聚焦在不推翻现有结构的前提下提升召回稳定性与可解释性：

- **chunk 元数据更完整**：`document_chunks` 新增 `title_path` 字段，保留标题层级路径，便于回填上下文与调试。
- **embedding 输入改为仅内容**：不再把标题拼进向量输入，避免模板化标题拉偏语义；标题仍可用于 FTS/展示。
- **FTS 吃标题**：全文索引改为 `title_path + content + source_hint`，关键词召回更稳。
- **混合检索增加相似度阈值**：Hybrid 结果要求 `similarity >= 0.2`，避免仅关键词命中但语义无关的片段。
- **邻居扩展（同 section）**：仅在同一 `section_id` 内补齐 `chunk_index` 相邻段落（默认 ±1），减少答案落在边界的遗漏。
- **Section 多样性约束**：同一 `section_id` 最多保留 4 条，避免单一章节霸榜。

涉及文件：
- `supabase/migrations/20260116090000_add_document_chunks_title_path.sql`
- `supabase/init.sql`
- `src/lib/documentIndexService.js`
- `src/views/SpaceView.jsx`
- `src/lib/documentRetrievalService.js`

## English
This update improves retrieval quality without changing the overall architecture:

- **Richer chunk metadata**: added `title_path` to `document_chunks` for heading context and easier debugging.
- **Content-only embeddings**: embeddings now use only chunk content (no title concatenation) to reduce title bias.
- **FTS includes titles**: full-text index now uses `title_path + content + source_hint` for steadier keyword recall.
- **Hybrid similarity threshold**: hybrid results require `similarity >= 0.2` to prevent keyword-only false positives.
- **Neighbor expansion (same section)**: only include neighbors within the same `section_id` (default ±1) to avoid cross-section noise.
- **Section diversity constraint**: keep at most 4 chunks per `section_id` to reduce single-section dominance.

Files touched:
- `supabase/migrations/20260116090000_add_document_chunks_title_path.sql`
- `supabase/init.sql`
- `src/lib/documentIndexService.js`
- `src/views/SpaceView.jsx`
- `src/lib/documentRetrievalService.js`
