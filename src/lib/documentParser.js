import * as mammoth from 'mammoth/mammoth.browser'
import * as pdfjsLib from 'pdfjs-dist'

const { GlobalWorkerOptions, getDocument } = pdfjsLib

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const DEFAULT_ALLOWED_EXTENSIONS = new Set(['pdf', 'docx', 'txt', 'md', 'csv', 'json'])

if (typeof window !== 'undefined') {
  GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs'
}

export const normalizeExtractedText = text =>
  String(text || '')
    // eslint-disable-next-line no-control-regex
    .replace(/\u0000/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()

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
      const data = await file.arrayBuffer()
      const pdf = await getDocument({ data }).promise
      let text = ''
      for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
        const page = await pdf.getPage(pageIndex)
        const content = await page.getTextContent()
        const pageText = content.items.map(item => item.str || '').join(' ')
        text += `${pageText}\n\n`
      }
      return text
    } catch (err) {
      console.error('PDF parsing error:', err)
      throw new Error(`PDF parse failed: ${err.message}`)
    }
  }

  if (isDocx) {
    const arrayBuffer = await file.arrayBuffer()
    const result = await mammoth.extractRawText({ arrayBuffer })
    return result?.value || ''
  }

  return await file.text()
}
