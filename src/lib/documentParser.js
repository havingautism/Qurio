import * as mammoth from 'mammoth/mammoth.browser'
import { extractDocumentTextViaBackend } from './backendClient'
// import * as pdfjsLib from 'pdfjs-dist'

// const { GlobalWorkerOptions, getDocument } = pdfjsLib

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const DEFAULT_ALLOWED_EXTENSIONS = new Set(['pdf', 'docx', 'txt', 'md', 'csv', 'json'])

// if (typeof window !== 'undefined') {
//   GlobalWorkerOptions.workerSrc =
//     'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs'
// }

export const normalizeExtractedText = text =>
  String(text || '')
    // eslint-disable-next-line no-control-regex
    .replace(/\u0000/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()

const HEADING_PATTERNS = [
  /^(#{1,6})\s+\S+/,
  /^第[0-9一二三四五六七八九十百千零两]+[章节篇部分]\s*\S*/,
  /^[一二三四五六七八九十百千]+[、.．]\s*\S+/,
  /^[（(][一二三四五六七八九十百千0-9]+[）)]\s*\S+/,
  /^\d+(?:\.\d+){0,3}[.)、．]?\s+\S+/,
  /^Chapter\s+\d+\b/i,
  /^Section\s+\d+(?:\.\d+)*\b/i,
]

const isHeadingLine = line => {
  const trimmed = String(line || '').trim()
  if (!trimmed) return false
  if (HEADING_PATTERNS.some(pattern => pattern.test(trimmed))) return true
  const words = trimmed.split(/\s+/).filter(Boolean)
  if (
    trimmed.length <= 80 &&
    words.length >= 2 &&
    words.length <= 8 &&
    words.every(word => /^[A-Z][A-Za-z0-9/&()-]*$/.test(word))
  ) {
    return true
  }
  if (
    trimmed.length <= 80 &&
    /^[A-Z0-9][A-Z0-9\s:./&()-]{2,80}$/.test(trimmed) &&
    /[A-Z]/.test(trimmed)
  ) {
    return true
  }
  return false
}

const isListLine = line => {
  const trimmed = String(line || '').trim()
  return /^([-*•]|[0-9]+[.)]|[a-zA-Z][.)]|[一二三四五六七八九十]+[、.．])\s+\S+/.test(trimmed)
}

const isLikelyTocLine = line => {
  const trimmed = String(line || '').trim()
  if (!trimmed) return false
  if (/^目录$|^contents?$/i.test(trimmed)) return true
  return /^.{2,120}(\.{2,}|·{2,}|…{2,}|\s{2,})\s*\d+\s*$/.test(trimmed)
}

const isLikelyPageMarker = line =>
  /^\s*(page\s*\d+|\d+\s*\/\s*\d+|第\s*\d+\s*页)\s*$/i.test(String(line || '').trim())

const collectRepeatedStandaloneLines = lines => {
  const counts = new Map()
  lines.forEach(rawLine => {
    const line = String(rawLine || '').trim()
    if (!line || line.length > 120 || isLikelyTocLine(line)) return
    if (/^#{1,6}\s+/.test(line)) return
    if (/^第[0-9一二三四五六七八九十百千零两]+[章节篇部分]/.test(line)) return
    if (/^(chapter|section)\s+\d+/i.test(line)) return
    counts.set(line, (counts.get(line) || 0) + 1)
  })
  return new Set(
    Array.from(counts.entries())
      .filter(([, count]) => count >= 2)
      .map(([line]) => line),
  )
}

const mergeFragmentedLines = lines => {
  const merged = []
  let buffer = ''

  const flush = () => {
    if (buffer.trim()) merged.push(buffer.trim())
    buffer = ''
  }

  lines.forEach(rawLine => {
    const line = String(rawLine || '').trim()
    if (!line) {
      flush()
      return
    }
    if (isHeadingLine(line) || isListLine(line) || isLikelyTocLine(line)) {
      flush()
      merged.push(line)
      return
    }

    if (!buffer) {
      buffer = line
      return
    }

    const shouldMerge =
      buffer.length < 220 &&
      line.length < 220 &&
      !/[。！？.!?;；:]$/.test(buffer) &&
      !/[:：]$/.test(line)

    buffer = shouldMerge ? `${buffer} ${line}` : `${buffer}\n${line}`
  })

  flush()
  return merged
}

export const postProcessExtractedDocumentText = (text, options = {}) => {
  const normalized = normalizeExtractedText(text)
  if (!normalized) return ''

  const { fileType = '' } = options
  const lines = normalized.split('\n')
  const repeatedLines = collectRepeatedStandaloneLines(lines)

  const filtered = lines.filter(rawLine => {
    const line = String(rawLine || '').trim()
    if (!line) return true
    if (isLikelyTocLine(line)) return false
    if (isLikelyPageMarker(line)) return false
    if (repeatedLines.has(line)) return false
    return true
  })

  const merged = mergeFragmentedLines(filtered)
  const processed = normalizeExtractedText(merged.join('\n\n'))

  if (!processed) {
    return normalized
  }

  if (String(fileType || '').toLowerCase() === 'md') {
    return processed
  }

  return processed
}

export const getFileExtension = file => {
  const name = file?.name || ''
  const parts = name.split('.')
  if (parts.length <= 1) return ''
  return parts.pop()?.toLowerCase() || ''
}

export const getFileTypeLabel = file => {
  const extension = getFileExtension(file)
  if (extension) return extension
  return file?.type || 'unknown'
}

export const extractTextFromFile = async (file, options = {}) => {
  const { allowedExtensions = DEFAULT_ALLOWED_EXTENSIONS, unsupportedMessage } = options
  const extension = getFileExtension(file)
  const isPlainText =
    file?.type?.startsWith('text/') ||
    file?.type === 'application/json' ||
    file?.type === 'application/csv'
  const isPdf = extension === 'pdf' || file?.type === 'application/pdf'
  const isDocx = extension === 'docx' || file?.type === DOCX_MIME
  const canParse = isPdf || isDocx || isPlainText || allowedExtensions.has(extension)

  if (!canParse) {
    throw new Error(unsupportedMessage || 'Unsupported file type.')
  }

  if (isPdf) {
    try {
      const extracted = await extractDocumentTextViaBackend(file)
      return extracted?.content_text || ''
    } catch (err) {
      console.error('PDF parsing error:', err)
      throw new Error(`PDF parse failed: ${err.message}`)
    }
  }

  if (isDocx) {
    try {
      const extracted = await extractDocumentTextViaBackend(file)
      if (String(extracted?.content_text || '').trim()) {
        return extracted.content_text
      }
    } catch (err) {
      console.warn('Backend DOCX extraction failed, falling back to local parser:', err)
    }

    const arrayBuffer = await file.arrayBuffer()
    const result = await mammoth.convertToMarkdown({ arrayBuffer })
    return result?.value || ''
  }

  return await file.text()
}
