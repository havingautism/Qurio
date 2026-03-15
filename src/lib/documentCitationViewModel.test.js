import { describe, expect, test } from 'bun:test'
import {
  canExpandDocumentCitation,
  cleanDocumentCitationText,
  prepareDocumentCitationSources,
  truncateDocumentCitationPreview,
} from './documentCitationViewModel'

describe('documentCitationViewModel', () => {
  test('preserves one item per original document hit', () => {
    const items = prepareDocumentCitationSources([
      {
        documentId: 'doc-1',
        nodeId: '15',
        title: 'Networking Notes.pdf',
        titlePath: ['8. Browser Connects'],
        snippet: '本地DNS解析器已经将IP地址返回给您的计算机。',
      },
      {
        documentId: 'doc-1',
        nodeId: '16',
        title: 'Networking Notes.pdf',
        titlePath: ['8. Browser Connects'],
        snippet:
          '本地DNS解析器已经将IP地址返回给您的计算机，您的浏览器可以使用该IP地址与目标服务器建立连接，开始获取网页内容。',
      },
    ])

    expect(items).toHaveLength(2)
    expect(items[0].originalIndex).toBe(0)
    expect(items[1].originalIndex).toBe(1)
  })

  test('adds full and preview snippets for each source independently', () => {
    const items = prepareDocumentCitationSources([
      {
        documentId: 'doc-1',
        title: 'Networking Notes.pdf',
        titlePath: ['8. Browser Connects'],
        snippet:
          '本地DNS解析器已经将IP地址返回给您的计算机，您的浏览器可以使用该IP地址与目标服务器建立连接，开始获取网页内容。',
      },
    ])

    expect(items[0].fullSnippet).toContain('开始获取网页内容')
    expect(items[0].previewSnippet.length).toBeLessThanOrEqual(items[0].fullSnippet.length)
  })

  test('normalizes markdown and heading noise from snippets', () => {
    expect(cleanDocumentCitationText('### 标题\n1. 结论内容')).toBe('标题 结论内容')
  })

  test('truncates long previews without changing the full quote', () => {
    const longText = 'A'.repeat(250)
    expect(truncateDocumentCitationPreview(longText, 40)).toHaveLength(43)
  })

  test('allows expanding any document source that has quote text', () => {
    expect(canExpandDocumentCitation({ fullSnippet: '短内容' })).toBe(true)
    expect(canExpandDocumentCitation({ snippet: '另一段引用' })).toBe(true)
    expect(canExpandDocumentCitation({ fullSnippet: '' })).toBe(false)
  })
})
