import * as mammoth from 'mammoth/mammoth.browser'
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
      const pdfjsLib = await import('pdfjs-dist')
      const { GlobalWorkerOptions, getDocument } = pdfjsLib

      if (typeof window !== 'undefined' && !GlobalWorkerOptions.workerSrc) {
        GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`
      }

      const data = await file.arrayBuffer()
      const pdf = await getDocument({ data }).promise
      const pages = []

      // Extract text with font information from all pages
      for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
        const page = await pdf.getPage(pageIndex)
        const content = await page.getTextContent()
        pages.push(content.items)
      }

      // Analyze font sizes across the entire document to determine heading thresholds
      const allItems = pages.flat()
      const fontSizes = allItems.map(item => Math.abs(item.transform[0])).filter(size => size > 0)

      if (fontSizes.length === 0) {
        // Fallback: no font information, use simple text extraction
        let text = ''
        for (const items of pages) {
          const pageText = items.map(item => item.str || '').join(' ')
          text += `${pageText}\n\n`
        }
        return text
      }

      // Calculate font size statistics
      const avgFontSize = fontSizes.reduce((sum, size) => sum + size, 0) / fontSizes.length
      // const sortedSizes = [...new Set(fontSizes)].sort((a, b) => b - a)

      // Determine heading thresholds (sizes significantly larger than average)
      const headingThreshold1 = avgFontSize * 1.5 // H1: 150% of average
      const headingThreshold2 = avgFontSize * 1.3 // H2: 130% of average
      const headingThreshold3 = avgFontSize * 1.15 // H3: 115% of average

      // Convert PDF items to markdown with heading detection
      let markdown = ''
      let lastY = null
      const lineGap = avgFontSize * 0.5 // Threshold for detecting new lines

      for (const items of pages) {
        for (const item of items) {
          const text = (item.str || '').trim()
          if (!text) continue

          const fontSize = Math.abs(item.transform[0])
          const y = item.transform[5]
          const fontName = item.fontName || ''

          // Detect if this is a new line (significant Y position change)
          const isNewLine = lastY === null || Math.abs(y - lastY) > lineGap
          lastY = y

          // Check if font indicates a heading (Bold, Heavy, etc.)
          const isBoldFont = /bold|heavy|black|semibold/i.test(fontName)
          // const isItalicFont = /italic|oblique/i.test(fontName)

          // Determine heading level based on font size and style
          let headingLevel = 0
          if (fontSize >= headingThreshold1 || (fontSize >= avgFontSize * 1.2 && isBoldFont)) {
            headingLevel = 1
          } else if (
            fontSize >= headingThreshold2 ||
            (fontSize >= avgFontSize * 1.1 && isBoldFont)
          ) {
            headingLevel = 2
          } else if (
            fontSize >= headingThreshold3 ||
            (fontSize >= avgFontSize && isBoldFont && text.length < 60)
          ) {
            headingLevel = 3
          }

          if (headingLevel > 0 && isNewLine) {
            // Add heading with appropriate markdown syntax
            markdown += `\n${'#'.repeat(headingLevel)} ${text}\n\n`
          } else {
            // Regular text
            if (isNewLine) {
              markdown += '\n'
            } else {
              markdown += ' '
            }
            markdown += text
          }
        }
        markdown += '\n\n' // Separate pages
      }

      return markdown
    } catch (err) {
      console.error('PDF parsing error:', err)
      throw new Error(`PDF parse failed: ${err.message}`)
    }
  }

  if (isDocx) {
    const arrayBuffer = await file.arrayBuffer()
    const result = await mammoth.convertToMarkdown({ arrayBuffer })
    return result?.value || ''
  }

  return await file.text()
}
