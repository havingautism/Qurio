# 知识库分层切分设计 / Hierarchical Chunking Design

## 1. 目标 / Goals
- **中文**：提升 Retrieval 精度、增强引用溯源、支持长文档与多文档的增量更新，核心思路是先构建标题结构树，再在每个标题下做子块 embedding。
- **English**: Improve retrieval relevance, make citations traceable, and support long/multi-document incremental re-indexing by building a hierarchical document tree and chunking within each section.

## 2. 结构树输出 / Structural AST Output
### 2.1 Tree model
- 每份文档先映射为一个 `doc` 节点，字段包括 `doc_id`, `source`, `hash`, `updated_at`。
- `doc.nodes` 由 `section` 节点组成，依照 H1/H2/H3 或其他标题层级形式组织。
- 每个 `section` 带有：
  - `title_path`: `["部署", "Nginx", "CORS"]`
  - `level`: 1~6（标题层级）
  - `blocks`: 按内容类型区分的数组（`paragraph`, `code`, `table`, `list`）
  - `loc`: 页码/段落/字符区间信息
  - `summary?`: 小模型生成的可选摘要

### 2.2 Block schema
```json
{
  "type": "paragraph|code|table|list",
  "text": "...",
  "meta": {
    "lang": "nginx",
    "refer_line": 42,
    "source": "file.pdf",
    "token_count": 320
  },
  "loc": { "page": 5, "offset": 1042 }
}
```

## 2.3 Document parsing / heading source
- `.docx` 文件通过 `mammoth.convertToMarkdown` 转为 Markdown，Markdown 本身含 `#/#/##` 结构，PDF 优先读取 TOC/bookmarks。这样 chunker 拥有真实的 H1/H2/H3，并把 `title_path` 存下；embedding prompt 仅用清洗后的 heading（去掉 HTML、anchor、方括号、换行）做 `passage:` label，正文 chunk 也同样 sanitized 后再送 embedding。

## 3. Parent / Section 层（文档聚合单元）
- `sections` 表或对象保存 `parent_id`、`doc_id`、`title_path`、`loc`、可选 `section_summary` 和 `level`。
- Section 主要用于导航与上下文窗口选择，仍可借助简化模型生成摘要做 rerank/UI 展示，但真正的 evidence 仍来自 child chunk。

## 4. Child / Chunk 层（实际 embedding 单元）
- 每个 `section` 内按字符/Token 长度（建议中文 400~1200 字）与 overlap（10~20%）切子块；代码、表格、FAQ 等优先单独 chunk。
- Chunk metadata：
  - `chunk_id`, `parent_id`, `doc_id`
  - `title_path`, `chunk_index`, `content_type`
  - `text`, `token_count`
  - `loc`（页码/段落/字符）
  - `hash`（Normalized text sha256）
  - `embedding`
  - `source_hint`（如 `[Code] nginx snippet`）
- Chunk text 建议加 `[TitlePath]` / `[SectionHint]` 前缀，打造语义锚点。
- 每次 ingest 前先比较 hash，不变则跳过 embedding，确保增量更新。

## 5. 存储/表结构参考 / Storage schema concept
1. `documents`（主表）：`doc_id`, `source`, `hash`, `updated_at`
2. `sections`（parent）：`section_id`, `doc_id`, `title_path`, `level`, `loc`, `summary`
3. `chunks`（child）：`chunk_id`, `doc_id`, `parent_id`, `title_path`, `chunk_index`, `content_type`, `text`, `token_count`, `loc`, `hash`, `embedding`

在 Supabase 中我们实现了对应的 `document_sections` 与 `document_chunks` 表（`document_chunks` 还在 `(document_id, chunk_hash)` 上建了唯一索引），保证 chunk 元数据可以 `upsert`，也方便在空间文档上传/删除时顺便同步向量数据。

## 6. LangChain 对齐 / LangChain-inspired approach
- **中文**：借鉴 LangChain 的 `RecursiveCharacterTextSplitter`，我们在 `src/lib/documentStructure.js` 里实现了一个 LangChain-style 的 hierarchical chunker。先对原始文本提取 Section 树，再在每个 Section 内按长度/overlap 切 chunk，同时把 `[TitlePath]` 贴为前缀，并把 `title_path`、`loc`、`content_type` 作为 metadata 传给 vector store，完全对应 LangChain `Document.metadata` 的理念。
- **English**: Inspired by LangChain's `RecursiveCharacterTextSplitter`, `src/lib/documentStructure.js` implements a hierarchical chunker. It turns raw text into heading-aware sections and then runs length-controlled chunking inside each section, prefixing chunk text with `[TitlePath]` and emitting metadata (`title_path`, `loc`, `content_type`) so LangChain-style vector stores can consume the results directly.

## 7. 检索 & 引用策略 / Retrieval & citation
- 默认走 Hybrid（BM25 + vector）检索。
- 检索到 child chunk 后，可扩展同 parent 的邻近 chunk（±1）为上下文，提高稳定性。
- 生成回答时用 chunk 的 `title_path` + `loc` 构造引用，确保可追溯。

## 8. 下一步实现方向 / Next implementation steps
1. 在 `documentParser`/上传流程里输出结构树(AST + block metadata)。
2. 把 AST 内容转换为 `sections` + `chunks`，为 chunk 计算 hash 并决定是否需要重新 embedding。
3. 拓展 Supabase（或本地存储）schema，保存 `sections`、`chunks` 与 hash 信息，支撑增量更新。
4. 在 Settings 的 demo 中展示新字段、调用新的 LangChain-style chunker，并验证 embedding test & retrieval。
