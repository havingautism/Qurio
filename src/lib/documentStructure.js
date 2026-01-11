import {
  DOCUMENT_CHUNK_OVERLAP,
  DOCUMENT_CHUNK_SIZE,
  DOCUMENT_MAX_CHUNKS,
} from './documentConstants'

const DEFAULT_CHUNK_OPTIONS = {
  chunkSize: DOCUMENT_CHUNK_SIZE,
  chunkOverlap: DOCUMENT_CHUNK_OVERLAP,
  maxChunks: DOCUMENT_MAX_CHUNKS,
}

const splitIntoSentences = text => {
  if (!text) return []
  const regex = /[^.!?。！？]+[.!?。！？]|[^.!?。！？]+$/g
  return text.match(regex) || [text]
}

const detectHeadingTitle = line => {
  const trimmed = line.trim()
  if (!trimmed) return null

  const hashMatch = trimmed.match(/^(#{1,6})\s+(.*)$/)
  if (hashMatch) {
    return { title: hashMatch[2].trim(), level: hashMatch[1].length }
  }

  const numberedMatch = trimmed.match(/^(\d+(?:\.\d+)*)[\.\)]\s+(.*)$/)
  if (numberedMatch) {
    return {
      title: numberedMatch[2].trim(),
      level: Math.min(numberedMatch[1].split('.').length + 1, 6),
    }
  }

  const chineseMatch = trimmed.match(/^第[0-9一二三四五六七八九十百千]+[章节节]\s*(.*)$/)
  if (chineseMatch) {
    return { title: chineseMatch[1].trim(), level: 2 }
  }

  const dotMatch = trimmed.match(/^[\u4e00-\u9fa5A-Za-z0-9]{1,4}[、.．]\s*(.*)$/)
  if (dotMatch) {
    return { title: dotMatch[1].trim(), level: 3 }
  }

  if (
    trimmed.length >= 4 &&
    trimmed.length <= 80 &&
    /^[A-Z0-9\s]+$/.test(trimmed) &&
    /[A-Z]/.test(trimmed)
  ) {
    return { title: trimmed, level: 1 }
  }

  return null
}

const buildSectionsFromText = text => {
  if (!text) {
    return [
      {
        id: 0,
        title: '',
        titlePath: [],
        level: 0,
        lines: [],
        loc: { startLine: 1, endLine: 1 },
      },
    ]
  }

  const lines = text.split(/\r?\n/)
  const sections = []
  let currentSection = {
    id: 0,
    title: '',
    titlePath: [],
    level: 0,
    lines: [],
    loc: { startLine: 1, endLine: 1 },
  }
  sections.push(currentSection)
  const titleStack = []
  let nextSectionId = 1
  let lineIndex = 0

  const startNewSection = (meta, nextLine) => {
    const level = Math.min(Math.max(meta.level || 1, 1), 6)
    titleStack[level - 1] = meta.title
    titleStack.length = level
    const titlePath = titleStack.filter(Boolean)
    const section = {
      id: nextSectionId,
      title: meta.title,
      titlePath,
      level,
      lines: [],
      loc: { startLine: nextLine + 1, endLine: nextLine },
    }
    nextSectionId += 1
    sections.push(section)
    currentSection = section
  }

  for (const line of lines) {
    lineIndex += 1
    const heading = detectHeadingTitle(line)
    if (heading) {
      currentSection.loc.endLine = lineIndex - 1
      startNewSection(heading, lineIndex)
      continue
    }
    currentSection.lines.push(line)
    currentSection.loc.endLine = lineIndex
  }

  return sections
}

export const chunkDocumentWithHierarchy = (text, options = {}) => {
  const opts = { ...DEFAULT_CHUNK_OPTIONS, ...options }
  const sections = buildSectionsFromText(text).map(section => ({
    id: section.id,
    title: section.title,
    level: section.level,
    titlePath: section.titlePath,
    loc: section.loc,
    text: section.lines.join('\n').trim(),
  }))

  const chunks = []
  let globalChunkCount = 0

  const pushChunk = (section, chunkText, sectionChunkIndex) => {
    const prefix = section.titlePath.length ? `[${section.titlePath.join(' > ')}]\n` : ''
    const finalText = `${prefix}${chunkText}`.trim()
    if (!finalText) return null
    const chunk = {
      chunkId: `${section.id}-${sectionChunkIndex}`,
      parentSectionId: section.id,
      titlePath: section.titlePath,
      chunkIndex: sectionChunkIndex,
      heading: section.title,
      contentType: 'paragraph',
      text: finalText,
      tokenCount: Math.max(1, Math.round(finalText.length / 4)),
      loc: section.loc,
      sourceHint: section.title ? `[Section] ${section.title}` : undefined,
    }
    chunks.push(chunk)
    globalChunkCount += 1
    return chunk
  }

  for (const section of sections) {
    if (globalChunkCount >= opts.maxChunks) break
    if (!section.text) continue
    const sentences = section.text
      .split(/\n{2,}/)
      .map(point => point.trim())
      .filter(Boolean)
      .flatMap(part => {
        const pieces = splitIntoSentences(part)
        return pieces.length > 0 ? pieces : [part]
      })

    if (sentences.length === 0) continue

    let current = ''
    let sectionChunkIndex = 0
    for (const sentence of sentences) {
      const next = current ? `${current} ${sentence}` : sentence
      if (next.length > opts.chunkSize && current) {
        pushChunk(section, current, sectionChunkIndex)
        sectionChunkIndex += 1
        const overlapSegment = opts.chunkOverlap > 0 ? current.slice(-opts.chunkOverlap) : ''
        current = overlapSegment ? `${overlapSegment} ${sentence}` : sentence
      } else {
        current = next
      }
      if (globalChunkCount >= opts.maxChunks) break
    }

    if (current.trim() && globalChunkCount < opts.maxChunks) {
      pushChunk(section, current, sectionChunkIndex)
    }
  }

  const truncated = chunks.length > opts.maxChunks
  return {
    sections: sections.map(section => ({
      id: section.id,
      title: section.title,
      level: section.level,
      titlePath: section.titlePath,
      loc: section.loc,
    })),
    chunks: truncated ? chunks.slice(0, opts.maxChunks) : chunks,
    truncated,
  }
}
