# 知识库数据结构完整说明

> 本文档详细说明知识库系统中所有数据结构的字段来源、用途和数据流转过程。

---

## 📋 目录

1. [数据流概览](#数据流概览)
2. [数据库表结构](#数据库表结构)
3. [JavaScript对象结构](#javascript对象结构)
4. [数据流转过程](#数据流转过程)
5. [向量检索流程](#向量检索流程)
6. [快速参考](#快速参考)

---

## 数据流概览

```
用户上传文件
    ↓
[documentParser.js] 提取原始文本
    ↓
[documentStructure.js] 解析 Sections + Chunks
    ↓
[embeddingService.js] 生成向量
    ↓
[documentIndexService.js] 持久化到数据库
    ↓
存储在 Supabase (space_documents, document_sections, document_chunks)
    ↓
[documentRetrievalService.js] 向量检索
    ↓
[ChatInterface.jsx] 传递给 LLM
```

---

## 数据库表结构

### 1. `space_documents` 表

**用途**: 存储文档的基本信息和原始文本

| 字段 | 类型 | 来源 | 说明 |
|------|------|------|------|
| `id` | UUID | Supabase 自动生成 | 主键 |
| `space_id` | UUID | 用户选择的 Space | 外键关联 `spaces.id` |
| `name` | TEXT | 文件名 | 例: `"机器学习入门.pdf"` |
| `file_type` | TEXT | 文件扩展名 | 例: `"pdf"`, `"docx"`, `"md"` |
| `content_text` | TEXT | `documentParser.extractTextFromFile()` | 提取的完整文本 |
| `embedding_provider` | TEXT | `settings.embeddingProvider` | 例: `"gemini"`, `"openai_compatibility"` |
| `embedding_model` | TEXT | `settings.embeddingModel` | 例: `"text-embedding-004"` |
| `created_at` | TIMESTAMPTZ | Supabase 自动生成 | 创建时间 |
| `updated_at` | TIMESTAMPTZ | Supabase 触发器维护 | 更新时间 |

**SQL 定义**: `supabase/init.sql` Line 182-192

---

### 2. `document_sections` 表

**用途**: 存储文档的层级结构（标题树）

| 字段 | 类型 | 来源 | 说明 |
|------|------|------|------|
| `id` | UUID | Supabase 自动生成 | 主键 |
| `document_id` | UUID | 关联的文档 | 外键关联 `space_documents.id` |
| `external_section_id` | INT | `section.id` (JavaScript) | 对应 JS 对象中的 section.id (0, 1, 2...) |
| `title_path` | TEXT[] | `section.titlePath` | 完整标题路径，例: `["第一章", "机器学习基础", "监督学习"]` |
| `level` | INT | `section.level` | 标题层级 (1-6)，H1=1, H2=2... |
| `loc` | JSONB | `section.loc` | 位置信息 `{"startLine": 10, "endLine": 25}` |
| `created_at` | TIMESTAMPTZ | Supabase 自动生成 | 创建时间 |
| `updated_at` | TIMESTAMPTZ | Supabase 触发器维护 | 更新时间 |

**生成位置**: `documentStructure.js` → `buildSectionsFromText()` Line 51-111

**SQL 定义**: `supabase/init.sql` Line 214-230

---

### 3. `document_chunks` 表

**用途**: 存储实际用于向量检索的文本块及其 embedding

| 字段 | 类型 | 来源 | 说明 |
|------|------|------|------|
| `id` | UUID | Supabase 自动生成 | 主键 |
| `document_id` | UUID | 关联的文档 | 外键关联 `space_documents.id` |
| `section_id` | UUID | 关联的 section | 外键关联 `document_sections.id` (可为 NULL) |
| `external_chunk_id` | TEXT | `chunk.chunkId` | 例: `"2-1"` (sectionId-chunkIndex) |
| `chunk_index` | INT | `chunk.chunkIndex` | 同一 section 内的 chunk 序号 (0, 1, 2...) |
| `content_type` | TEXT | `chunk.contentType` | 内容类型，默认 `"paragraph"` |
| `text` | TEXT | `chunk.text` | **实际存储的文本** (包含 titlePath 前缀) |
| `token_count` | INT | `chunk.tokenCount` | Token 数量估算 (length / 4) |
| `chunk_hash` | TEXT | `chunk.chunkHash` | 文本 hash，用于去重和增量更新 |
| `loc` | JSONB | `chunk.loc` | 位置信息 `{"startLine": 10, "endLine": 25}` |
| `source_hint` | TEXT | `chunk.sourceHint` | 提示信息，例: `"[Section] 监督学习"` |
| `embedding` | REAL[] | `embeddingService.fetchEmbeddingVector()` | **向量数组** `[0.123, -0.456, ...]` |
| `created_at` | TIMESTAMPTZ | Supabase 自动生成 | 创建时间 |
| `updated_at` | TIMESTAMPTZ | Supabase 触发器维护 | 更新时间 |

**生成位置**: `documentStructure.js` → `chunkDocumentWithHierarchy()` → `pushChunk()` Line 127-146

**SQL 定义**: `supabase/init.sql` Line 232-258

**重要索引**:
- `idx_document_chunks_document_id`: 按 document_id 查询
- `idx_document_chunks_section_id`: 按 section_id 查询
- `idx_document_chunks_document_hash`: 唯一索引 (document_id, chunk_hash)，用于去重

---

## JavaScript对象结构

### 1. Section 对象

**定义位置**: `documentStructure.js` → `buildSectionsFromText()`

**生成时机**: 文档上传时，解析文本提取标题结构

**结构示例**:
```javascript
{
  id: 2,                                      // External section ID (数据库中的 external_section_id)
  title: "监督学习",                           // 当前标题文本
  titlePath: ["第一章", "机器学习基础", "监督学习"],  // 完整标题路径 (数据库中的 title_path)
  level: 3,                                    // 标题层级 (数据库中的 level)
  loc: { startLine: 10, endLine: 25 },        // 位置信息 (数据库中的 loc)
  lines: [                                     // 该 section 的文本行 (不存数据库，仅用于后续 chunking)
    "监督学习是机器学习的重要分支...",
    "",
    "线性回归用于预测连续值..."
  ]
}
```

**字段来源**:

| 字段 | 来源 | 说明 |
|------|------|------|
| `id` | `nextSectionId++` | 从 0 开始自增 |
| `title` | `detectHeadingTitle()` | 识别 Markdown 标题 (`# 标题`)、编号标题 (`1.1 标题`)、中文章节 (`第一章`) 等 |
| `titlePath` | `titleStack` | 维护一个栈，记录当前层级的所有父标题 |
| `level` | `detectHeadingTitle()` | 根据标题格式判断层级 (1-6) |
| `loc` | 行号计数器 | `{ startLine, endLine }` |
| `lines` | 文本分割 | 该 section 包含的所有文本行 |

---

### 2. Chunk 对象

**定义位置**: `documentStructure.js` → `chunkDocumentWithHierarchy()` → `pushChunk()`

**生成时机**: 对每个 Section 的文本进行分块处理

**结构示例**:
```javascript
{
  chunkId: "2-1",                             // `${sectionId}-${chunkIndex}` (数据库中的 external_chunk_id)
  parentSectionId: 2,                         // 所属 section 的 id
  titlePath: ["第一章", "机器学习基础", "监督学习"],  // 继承自 section (存到数据库，但主要用于展示)
  chunkIndex: 1,                              // 当前 chunk 在 section 内的序号 (数据库中的 chunk_index)
  heading: "监督学习",                         // section 的标题 (不存数据库)
  contentType: "paragraph",                   // 内容类型 (数据库中的 content_type)
  text: "[第一章 > 机器学习基础 > 监督学习]\n线性回归用于预测连续值...",  // ⚠️ **核心字段** (数据库中的 text)
  tokenCount: 75,                             // Token 数量估算 (数据库中的 token_count)
  loc: { startLine: 10, endLine: 25 },        // 位置信息 (数据库中的 loc)
  sourceHint: "[Section] 监督学习",            // 提示信息 (数据库中的 source_hint)
  chunkHash: "abc123...",                     // 文本 hash (数据库中的 chunk_hash)
  embedding: [0.123, -0.456, ...]             // 向量 (数据库中的 embedding，后续添加)
}
```

**字段来源**:

| 字段 | 来源 | 说明 |
|------|------|------|
| `chunkId` | `${section.id}-${sectionChunkIndex}` | 唯一标识符 |
| `parentSectionId` | `section.id` | 关联到 section |
| `titlePath` | `section.titlePath` | 继承自 section |
| `chunkIndex` | `sectionChunkIndex++` | 在 section 内从 0 开始递增 |
| `heading` | `section.title` | section 的标题 |
| `contentType` | 固定值 `"paragraph"` | 内容类型 (未来可扩展 `code`, `table`) |
| `text` | **Line 129**: `${prefix}${chunkText}` | ⚠️ **修改后每个 chunk 都包含 titlePath 前缀** |
| `tokenCount` | `Math.round(text.length / 4)` | 简单估算 |
| `loc` | `section.loc` | 继承自 section |
| `sourceHint` | `[Section] ${section.title}` | 用于 UI 展示 |
| `chunkHash` | 后续添加 (hash.js) | SHA256 hash |
| `embedding` | 后续添加 (embeddingService.js) | 向量数组 |

---

## 数据流转过程

### 步骤 1: 用户上传文件

**触发位置**: 用户在 Space 的知识库中上传文件

**调用链**:
```
UI (DocumentUpload)
  → documentsService.uploadDocument()
    → documentParser.extractTextFromFile()
```

**输出**: `content_text` (完整文本)

---

### 步骤 2: 解析 Sections 和 Chunks

**调用位置**: 文档上传后台处理

**调用链**:
```
documentsService.uploadDocument()
  → documentStructure.chunkDocumentWithHierarchy(content_text)
    → buildSectionsFromText(text)  // 提取 sections
    → 对每个 section:
      → splitIntoSentences()       // 分句
      → pushChunk()                // 创建 chunk 对象
```

**输出**:
```javascript
{
  sections: [
    { id: 0, title: "", titlePath: [], level: 0, loc: {...} },
    { id: 1, title: "第一章", titlePath: ["第一章"], level: 1, loc: {...} },
    { id: 2, title: "监督学习", titlePath: ["第一章", "监督学习"], level: 2, loc: {...} }
  ],
  chunks: [
    { chunkId: "2-0", text: "[第一章 > 监督学习]\n监督学习是...", ... },
    { chunkId: "2-1", text: "[第一章 > 监督学习]\n线性回归...", ... }
  ],
  truncated: false
}
```

---

### 步骤 3: 生成 Embeddings

**调用位置**: chunk 对象创建后

**调用链**:
```
documentsService.uploadDocument()
  → embeddingService.fetchEmbeddingVector({
      text: chunk.text,  // ⚠️ 包含 titlePath 前缀的完整文本
      taskType: 'RETRIEVAL_DOCUMENT'
    })
```

**重要**:
- 输入是 `chunk.text`，**包含 titlePath 前缀**
- 因此 embedding 向量也包含了标题的语义信息
- 这是修改后提升检索准确率的关键！

**输出**: `embedding` 数组 `[0.123, -0.456, ...]`

---

### 步骤 4: 持久化到数据库

**调用位置**: embeddings 生成后

**调用链**:
```
documentsService.uploadDocument()
  → documentIndexService.persistDocumentSections(documentId, sections)
  → documentIndexService.persistDocumentChunks(documentId, chunks, sectionMap)
```

**persistDocumentSections** (Line 6-34):
```javascript
// 输入: sections 数组
// 输出: sectionMap = { externalSectionId → dbSectionId }
//       例: { 0 → "uuid-001", 1 → "uuid-002", 2 → "uuid-003" }
```

**persistDocumentChunks** (Line 36-61):
```javascript
// 输入: chunks 数组, sectionMap
// 处理:
//   - chunk.parentSectionId → sectionMap[parentSectionId] → section_id (UUID)
//   - 使用 upsert 根据 (document_id, chunk_hash) 去重
```

---

### 步骤 5: 向量检索

**触发位置**: 用户发送消息时，如果选中了文档

**调用链**:
```
ChatInterface.jsx → handleSendMessage()
  → fetchRelevantDocumentSources(documents, queryText)
    → documentRetrievalService.fetchDocumentChunkContext({
        documents: selectedDocuments,
        queryText: userMessage,
        chunkLimit: 250,
        topChunks: 3
      })
```

**检索过程** (documentRetrievalService.js Line 43-121):

1. **生成查询向量**:
   ```javascript
   const queryEmbedding = await fetchEmbeddingVector({
     text: "监督学习的原理",
     prompt: "query: 监督学习的原理"
   })
   ```

2. **获取候选 chunks**:
   ```javascript
   const { data: chunks } = await supabase
     .from('document_chunks')
     .select('id,document_id,text,embedding,source_hint,chunk_index')
     .in('document_id', documentIds)
     .limit(250)
   ```

3. **计算相似度**:
   ```javascript
   chunks.forEach(chunk => {
     const score = cosineSimilarity(queryEmbedding, chunk.embedding)
     // 因为 chunk.embedding 是基于包含 titlePath 的 text 生成的
     // 所以标题信息也参与了相似度计算！
   })
   ```

4. **排序并返回 Top-K**:
   ```javascript
   const top = scored
     .sort((a, b) => b.score - a.score)
     .slice(0, 3)  // topChunks = 3
   ```

**输出**:
```javascript
{
  context: "### 机器学习入门.pdf (pdf)\n[第一章 > 监督学习]\n线性回归...",
  sources: [
    {
      id: "chunk-uuid",
      documentId: "doc-uuid",
      title: "机器学习入门.pdf",
      fileType: "pdf",
      snippet: "[第一章 > 监督学习]\n线性回归...",  // 截断到 400 字符
      sourceHint: "[Section] 监督学习",
      score: 0.92
    }
  ]
}
```

---

### 步骤 6: 传递给 LLM

**调用位置**: ChatInterface.jsx → sendMessage()

**处理**:
```javascript
// Line 121-133: formatDocumentAppendText()
const documentAppendText = formatDocumentAppendText(sources)

// 输出示例:
`# The following document excerpts may help answer this question (may be incomplete):
- [High relevance | 机器学习入门.pdf (pdf)]: [第一章 > 监督学习]
线性回归用于预测连续值，例如房价预测。它通过拟合一条直线来建立输入特征与输出之间的关系...`
```

**最终发送给 LLM**:
```javascript
{
  role: "user",
  content: [
    { type: "text", text: userMessage },
    { type: "text", text: documentAppendText }  // 附加文档上下文
  ]
}
```

---

## 向量检索流程

### 为什么修改后效果更好？

#### ❌ 修改前 (只有第一个 chunk 有 titlePath)

```javascript
// Section "监督学习" 被分成 3 个 chunk

// Chunk 0
text: "[第一章 > 监督学习]\n监督学习是机器学习的重要分支..."
embedding: embed(text) → 包含 "第一章", "监督学习" 的语义

// Chunk 1 ⚠️
text: "线性回归用于预测连续值..."  // 缺少上下文！
embedding: embed(text) → 只包含 "线性回归" 的语义

// Chunk 2 ⚠️
text: "逻辑回归虽然名字叫回归..."  // 缺少上下文！
embedding: embed(text) → 只包含 "逻辑回归" 的语义
```

**问题**: 用户搜索 "监督学习中的线性回归" 时:
- 查询向量包含: "监督学习", "线性回归"
- Chunk 1 的 embedding 只包含 "线性回归"
- **相似度评分降低**，可能召回失败！

---

#### ✅ 修改后 (每个 chunk 都有 titlePath)

```javascript
// Section "监督学习" 被分成 3 个 chunk

// Chunk 0
text: "[第一章 > 监督学习]\n监督学习是机器学习的重要分支..."
embedding: embed(text) → 包含 "第一章", "监督学习", "机器学习" 的语义

// Chunk 1 ✅
text: "[第一章 > 监督学习]\n线性回归用于预测连续值..."
embedding: embed(text) → 包含 "第一章", "监督学习", "线性回归" 的语义

// Chunk 2 ✅
text: "[第一章 > 监督学习]\n逻辑回归虽然名字叫回归..."
embedding: embed(text) → 包含 "第一章", "监督学习", "逻辑回归" 的语义
```

**优势**: 用户搜索 "监督学习中的线性回归" 时:
- 查询向量包含: "监督学习", "线性回归"
- Chunk 1 的 embedding **同时包含**这两个概念
- **相似度评分提升**，召回准确率显著提高！

---

## 快速参考

### 核心文件位置

| 文件 | 作用 | 关键函数/常量 |
|------|------|---------------|
| `documentParser.js` | 提取文件文本 | `extractTextFromFile()` |
| `documentStructure.js` | 解析 sections + chunks | `chunkDocumentWithHierarchy()`, `buildSectionsFromText()`, `pushChunk()` |
| `embeddingService.js` | 生成向量 | `fetchEmbeddingVector()`, `resolveEmbeddingConfig()` |
| `documentIndexService.js` | 持久化到数据库 | `persistDocumentSections()`, `persistDocumentChunks()` |
| `documentRetrievalService.js` | 向量检索 | `fetchDocumentChunkContext()`, `listDocumentChunksByDocumentIds()` |
| `documentsService.js` | 文档管理 | `uploadDocument()`, `listSpaceDocuments()` |
| `vectorUtils.js` | 向量计算 | `cosineSimilarity()` |
| `hash.js` | 计算 hash | `hashText()` |

---

### 关键配置常量

| 常量 | 位置 | 默认值 | 说明 |
|------|------|--------|------|
| `DOCUMENT_CHUNK_SIZE` | `documentConstants.js` | 800 | Chunk 最大字符数 |
| `DOCUMENT_CHUNK_OVERLAP` | `documentConstants.js` | 160 | Chunk 重叠字符数 (20%) |
| `DOCUMENT_MAX_CHUNKS` | `documentConstants.js` | 500 | 单个文档最大 chunk 数 |
| `DOCUMENT_RETRIEVAL_CHUNK_LIMIT` | `ChatInterface.jsx` | 250 | 检索时候选 chunk 数量 |
| `DOCUMENT_RETRIEVAL_TOP_CHUNKS` | `ChatInterface.jsx` | 3 | 返回的 top-K chunk 数量 |
| `DOCUMENT_CONTEXT_MAX_TOTAL` | `ChatInterface.jsx` | 12000 | 总上下文最大字符数 |

---

### 数据库查询关键点

**查询 chunk 时的字段**:
```sql
SELECT 
  id,
  document_id,
  text,           -- 包含 titlePath 前缀的完整文本
  embedding,      -- 向量数组
  source_hint,    -- "[Section] 标题"
  chunk_index     -- Chunk 序号
FROM document_chunks
WHERE document_id IN (...)
LIMIT 250
```

**重要**: 
- `text` 字段存储的是**包含 titlePath 前缀**的文本
- `embedding` 是基于这个**完整 text** 生成的向量
- 因此向量检索时，标题信息也参与了语义匹配

---

### TitlePath 前缀格式

**格式**: `[标题1 > 标题2 > 标题3]\n`

**示例**:
```
[第一章 > 机器学习基础 > 监督学习]
线性回归用于预测连续值，例如房价预测...
```

**生成位置**: `documentStructure.js` Line 128
```javascript
const prefix = section.titlePath.length ? `[${section.titlePath.join(' > ')}]\n` : ''
```

**应用位置**: `documentStructure.js` Line 129
```javascript
const finalText = `${prefix}${chunkText}`.trim()  // ✅ 每个 chunk 都包含前缀
```

---

## 总结

### 数据结构层次

```
Document (文档)
  ├─ Section (章节/标题)
  │   ├─ titlePath: ["第一章", "监督学习"]  // 完整路径
  │   └─ Chunk (文本块)
  │       ├─ text: "[第一章 > 监督学习]\n线性回归..."  // 包含前缀
  │       └─ embedding: [0.123, ...]  // 基于完整 text 的向量
  └─ Section
      └─ Chunk
```

### 关键改进点

**修改位置**: `documentStructure.js` Line 129

**修改内容**: 确保每个 chunk 都包含 titlePath 前缀

**效果**: 
- ✅ 所有 chunk 的 embedding 都包含完整的语义上下文
- ✅ 向量检索时标题信息参与匹配
- ✅ 召回准确率显著提升 (预计 15-30%)

---

**最后更新**: 2026-01-11  
**相关文档**: [hierarchical_chunking.md](./hierarchical_chunking.md)
