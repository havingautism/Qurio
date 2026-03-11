import { describe, expect, test } from 'bun:test'

import {
  buildDocumentContextFromMatches,
  clearPendingDocumentUploadJob,
  getPendingDocumentUploadJob,
  getDocumentUploadMessageKey,
  savePendingDocumentUploadJob,
  shouldUseBackendDocumentExtraction,
} from './documentKnowledgeService'

describe('documentKnowledgeService', () => {
  const storage = new Map()
  globalThis.sessionStorage = {
    getItem: key => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => {
      storage.set(String(key), String(value))
    },
    removeItem: key => {
      storage.delete(String(key))
    },
    clear: () => storage.clear(),
  }

  test('builds document context from locate and read results', () => {
    const context = buildDocumentContextFromMatches({
      locateResult: {
        matches: [
          {
            doc_id: 'doc-a',
            title: 'Guide.md',
            file_type: 'md',
            section_id: 's2',
            section_title: 'Details',
            score: 3,
          },
        ],
      },
      readResults: [
        {
          ok: true,
          doc_id: 'doc-a',
          section_id: 's2',
          section_title: 'Details',
          chunks: [
            {
              chunk_id: '002-details',
              content: 'Hello world from the details section.',
            },
          ],
        },
      ],
    })

    expect(context.sources).toHaveLength(1)
    expect(context.sources[0].title).toBe('Guide.md')
    expect(context.sources[0].titlePath).toEqual(['Details'])
    expect(context.sources[0].path).toBe('')
    expect(context.appendText).toContain('Hello world from the details section.')
  })

  test('routes pdf uploads to backend extraction', () => {
    expect(
      shouldUseBackendDocumentExtraction({
        name: 'guide.pdf',
        type: 'application/pdf',
      }),
    ).toBe(true)

    expect(
      shouldUseBackendDocumentExtraction({
        name: 'notes.md',
        type: 'text/markdown',
      }),
    ).toBe(false)
  })

  test('maps upload job stages to the shared loading copy', () => {
    expect(getDocumentUploadMessageKey({ stage: 'uploading' })).toBe(
      'views.spaceView.documentUploading',
    )
    expect(getDocumentUploadMessageKey({ stage: 'parsing' })).toBe(
      'views.spaceView.documentParsing',
    )
    expect(getDocumentUploadMessageKey({ stage: 'indexing' })).toBe(
      'views.spaceView.documentIndexing',
    )
    expect(getDocumentUploadMessageKey({ stage: 'completed' })).toBe(
      'views.spaceView.documentUploaded',
    )
  })

  test('stores pending upload jobs by space for route resume', () => {
    sessionStorage.clear()
    savePendingDocumentUploadJob({
      spaceId: 'space-a',
      jobId: 'job-1',
      fileName: 'Guide.pdf',
    })

    expect(getPendingDocumentUploadJob('space-a')).toEqual({
      spaceId: 'space-a',
      jobId: 'job-1',
      fileName: 'Guide.pdf',
    })

    clearPendingDocumentUploadJob('space-a')
    expect(getPendingDocumentUploadJob('space-a')).toBeNull()
  })

  test('restores pending upload jobs from session storage', () => {
    sessionStorage.clear()
    sessionStorage.setItem(
      'document-upload-job:space-b',
      JSON.stringify({
        spaceId: 'space-b',
        jobId: 'job-2',
        fileName: 'Resume.pdf',
      }),
    )

    expect(getPendingDocumentUploadJob('space-b')).toEqual({
      spaceId: 'space-b',
      jobId: 'job-2',
      fileName: 'Resume.pdf',
    })

    clearPendingDocumentUploadJob('space-b')
    expect(sessionStorage.getItem('document-upload-job:space-b')).toBeNull()
  })
})
