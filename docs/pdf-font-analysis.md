# PDF 字体分析增强功能说明

> 本文档说明增强后的 PDF 解析功能，包括字体分析、标题识别和 Markdown 转换的工作原理。

---

## 📋 功能概览

### 改进前
```javascript
// 简单文本提取，丢失所有格式信息
const pageText = content.items.map(item => item.str || '').join(' ')
```

### 改进后
```javascript
// 分析字体大小和样式，自动识别标题并转换为 Markdown
# 第一章 机器学习基础

机器学习是人工智能的核心领域...

## 监督学习

监督学习需要标注数据来训练模型...
```

---

## 🔍 工作原理

### 步骤 1: 提取字体信息

对于每个 PDF 文本项，提取以下信息：

```javascript
{
  str: "第一章 机器学习基础",     // 文本内容
  transform: [18, 0, 0, 18, ...], // 变换矩阵，transform[0] = 字体大小
  fontName: "Arial-BoldMT",       // 字体名称
  ...
}
```

---

### 步骤 2: 统计分析

分析整个文档的字体大小分布：

```javascript
// 收集所有字体大小
const fontSizes = allItems
  .map(item => Math.abs(item.transform[0]))
  .filter(size => size > 0)

// 计算平均字体大小
const avgFontSize = fontSizes.reduce((sum, size) => sum + size, 0) / fontSizes.length
```

**示例**:
- 文档平均字体大小: 12pt
- 检测到的字体大小范围: 10pt - 24pt

---

### 步骤 3: 动态阈值计算

根据平均字体大小，动态计算标题阈值：

| 标题级别 | 阈值 | 示例 (avgFontSize = 12pt) |
|---------|------|---------------------------|
| **H1** | 150% 平均大小 | ≥ 18pt |
| **H2** | 130% 平均大小 | ≥ 15.6pt |
| **H3** | 115% 平均大小 | ≥ 13.8pt |

**为什么使用百分比？**
- 不同 PDF 的基础字体大小不同
- 自适应阈值可以适配各种文档
- 避免硬编码固定值导致的误判

---

### 步骤 4: 标题识别规则

#### 规则 1: 基于字体大小

```javascript
if (fontSize >= avgFontSize * 1.5) {
  headingLevel = 1  // H1
} else if (fontSize >= avgFontSize * 1.3) {
  headingLevel = 2  // H2
} else if (fontSize >= avgFontSize * 1.15) {
  headingLevel = 3  // H3
}
```

#### 规则 2: 基于字体样式（粗体）

```javascript
const isBoldFont = /bold|heavy|black|semibold/i.test(fontName)

// 120% 大小 + 粗体 → H1
if (fontSize >= avgFontSize * 1.2 && isBoldFont) {
  headingLevel = 1
}

// 110% 大小 + 粗体 → H2
if (fontSize >= avgFontSize * 1.1 && isBoldFont) {
  headingLevel = 2
}

// 普通大小 + 粗体 + 短文本 (<60字符) → H3
if (fontSize >= avgFontSize && isBoldFont && text.length < 60) {
  headingLevel = 3
}
```

**为什么检查文本长度？**
- 标题通常较短 (< 60 字符)
- 避免把粗体段落误判为标题

---

### 步骤 5: 换行检测

通过 Y 坐标变化判断是否为新行：

```javascript
const y = item.transform[5]  // Y 坐标
const lineGap = avgFontSize * 0.5  // 换行阈值（字体大小的 50%）

const isNewLine = lastY === null || Math.abs(y - lastY) > lineGap
```

**为什么这样做？**
- PDF 文本项不按行分组，需要手动检测
- Y 坐标相近的文本属于同一行
- Y 坐标差异大的文本属于不同行

---

### 步骤 6: 转换为 Markdown

```javascript
if (headingLevel > 0 && isNewLine) {
  // 标题：添加 # 前缀
  markdown += `\n${'#'.repeat(headingLevel)} ${text}\n\n`
} else {
  // 普通文本
  if (isNewLine) {
    markdown += '\n'
  } else {
    markdown += ' '  // 同一行的文本用空格连接
  }
  markdown += text
}
```

---

## 📊 识别示例

### 示例 1: 清晰的层级结构

**输入 PDF**:
```
第一章 机器学习基础      (24pt, Bold)
  监督学习              (18pt, Bold)
    线性回归            (14pt, Bold)
      正文内容...       (12pt, Regular)
```

**输出 Markdown**:
```markdown
# 第一章 机器学习基础

## 监督学习

### 线性回归

正文内容...
```

---

### 示例 2: 只有字体大小差异

**输入 PDF**:
```
Introduction           (20pt, Regular)
  Background          (16pt, Regular)
    Context           (14pt, Regular)
      Text content... (12pt, Regular)
```

**输出 Markdown**:
```markdown
# Introduction

## Background

### Context

Text content...
```

---

### 示例 3: 粗体标题

**输入 PDF**:
```
概述                   (12pt, Bold)     ← 普通大小但粗体
  这是一段正文...      (12pt, Regular)
重要事项               (12pt, Bold, 短文本)
  详细说明...          (12pt, Regular)
```

**输出 Markdown**:
```markdown
### 概述

这是一段正文...

### 重要事项

详细说明...
```

---

## 🛡️ 降级处理

如果 PDF 不包含字体信息（罕见情况），自动回退到简单文本提取：

```javascript
if (fontSizes.length === 0) {
  // Fallback: no font information, use simple text extraction
  let text = ''
  for (const items of pages) {
    const pageText = items.map(item => item.str || '').join(' ')
    text += `${pageText}\n\n`
  }
  return text
}
```

**确保功能向后兼容，不会因为特殊 PDF 而失败。**

---

## ⚙️ 配置参数

### 可调整的阈值

| 参数 | 当前值 | 说明 |
|------|--------|------|
| `headingThreshold1` | `avgFontSize * 1.5` | H1 的字体大小阈值 |
| `headingThreshold2` | `avgFontSize * 1.3` | H2 的字体大小阈值 |
| `headingThreshold3` | `avgFontSize * 1.15` | H3 的字体大小阈值 |
| `lineGap` | `avgFontSize * 0.5` | 换行检测阈值 |
| 短文本长度 | `60` 字符 | 判断粗体文本是否为标题的长度限制 |

**位置**: `src/lib/documentParser.js` Line 85-87

**如果需要调整**:
- 提高阈值 → 更严格，减少误判
- 降低阈值 → 更宽松，但可能增加误判

---

## 🎯 优势

### 1. **自适应性强**
- 基于文档自身的字体分布计算阈值
- 适配各种格式和样式的 PDF

### 2. **准确率高**
- 结合字体大小和样式（粗体）双重判断
- 通过文本长度过滤误判

### 3. **兼容性好**
- 保留降级方案，确保所有 PDF 都能处理
- 不影响其他格式（DOCX、Markdown 等）

### 4. **零成本**
- 完全基于本地分析，无需 API 调用
- 处理速度快（毫秒级）

---

## 🔄 与现有系统的集成

### 数据流

```
用户上传 PDF
    ↓
[documentParser.js] 字体分析 + Markdown 转换  ← 新增
    ↓
[documentStructure.js] 解析 Sections + Chunks  ← 准确率提升！
    ↓
[embeddingService.js] 生成向量
    ↓
存储到数据库
```

### 影响范围

✅ **提升 Section 识别准确率**
- 原来无法识别的 PDF 标题，现在可以正确识别
- Section 数量增加，结构更清晰

✅ **改进 Chunk 质量**
- 基于准确的 Section，Chunk 切分更合理
- TitlePath 前缀更有意义

✅ **提高检索准确性**
- 更好的文档结构 → 更准确的语义检索
- 用户搜索体验提升

---

## 📝 使用说明

### 无需额外配置

功能已自动启用，用户上传 PDF 时会自动使用增强解析。

### 查看效果

1. 上传包含标题的 PDF 文档
2. 系统自动识别标题并转换为 Markdown
3. 在知识库检索时，可以看到更准确的 Section 信息

---

## 🧪 测试建议

### 测试用例

1. **学术论文** - 清晰的章节结构
2. **技术文档** - 多层级标题
3. **简单 PDF** - 只有正文，无标题
4. **设计精美的 PDF** - 复杂字体样式

### 验证方法

上传 PDF 后，检查生成的 Sections 是否合理：
```sql
SELECT title, level, title_path 
FROM document_sections 
WHERE document_id = 'your-document-id'
ORDER BY external_section_id;
```

---

## 🚀 未来优化方向

### 短期
- [ ] 根据用户反馈调整阈值参数
- [ ] 添加调试日志（可选开启）
- [ ] 支持更多字体样式识别（斜体、下划线等）

### 中期
- [ ] 添加用户自定义阈值配置
- [ ] 识别列表、表格等特殊结构
- [ ] 支持 TOC (Table of Contents) 提取

### 长期
- [ ] 结合 LLM 进行后处理优化
- [ ] 支持图片和图表的文字识别

---

**最后更新**: 2026-01-11  
**相关文件**: `src/lib/documentParser.js`  
**相关文档**: [knowledge-base-data-structure.md](./knowledge-base-data-structure.md)
