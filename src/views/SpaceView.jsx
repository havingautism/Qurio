import clsx from 'clsx'
import {
  Bookmark,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  FileJson,
  FileSpreadsheet,
  FileCode,
  File,
  Layers,
  Pencil,
  Trash2,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  Menu,
} from 'lucide-react'
import { useCallback, useEffect, useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppContext } from '../App'
import EmojiDisplay from '../components/EmojiDisplay'
import FancyLoader from '../components/FancyLoader'
import ColorBendsBackground from '../components/ui/ColorBendsBackground'
import ConversationCard from '../components/ConversationCard'
import { useToast } from '../contexts/ToastContext'
import useSettings from '../hooks/useSettings'
import {
  listConversationsBySpace,
  notifyConversationsChanged,
  toggleFavorite,
} from '../lib/conversationsService'
import {
  getFileTypeLabel,
} from '../lib/documentParser'
import {
  createSpaceDocument,
  deleteSpaceDocument,
  listSpaceDocuments,
} from '../lib/documentsService'
import {
  cancelDocumentUploadJob,
  clearPendingDocumentUploadJob,
  createDocumentUploadJob,
  deleteDocumentKnowledge,
  getPendingDocumentUploadJob,
  getDocumentUploadJob,
  getDocumentUploadMessageKey,
  savePendingDocumentUploadJob,
} from '../lib/documentKnowledgeService'
import { deleteConversation } from '../lib/supabase'
import { getProvider } from '../lib/providers'
import { spaceRoute } from '../router'

const FileIcon = ({ fileType, className }) => {
  const type = (fileType || '').toLowerCase()
  if (type.includes('pdf')) return <FileText className={clsx('text-red-500', className)} />
  if (type.includes('doc') || type.includes('word'))
    return <FileText className={clsx('text-blue-500', className)} />
  if (type.includes('json')) return <FileJson className={clsx('text-yellow-500', className)} />
  if (type.includes('csv') || type.includes('excel') || type.includes('sheet'))
    return <FileSpreadsheet className={clsx('text-emerald-500', className)} />
  if (
    type.includes('md') ||
    type.includes('start') ||
    type.includes('code') ||
    type === 'js' ||
    type === 'py'
  )
    return <FileCode className={clsx('text-purple-500', className)} />
  return <File className={clsx('text-gray-400', className)} />
}

const SpaceView = () => {
  const { t, i18n } = useTranslation()
  const { spaceId } = spaceRoute.useParams()
  const {
    spaces,
    isSidebarPinned,
    onEditSpace,
    onOpenConversation,
    showConfirmation,
    toggleSidebar,
    deepResearchSpace,
  } = useAppContext()

  const activeSpace = spaces?.find(s => String(s.id) === String(spaceId)) || null

  const normalizeTitleEmojis = value => {
    if (Array.isArray(value)) {
      return value
        .map(item => String(item || '').trim())
        .filter(Boolean)
        .slice(0, 1)
    }
    if (typeof value === 'string' && value.trim()) {
      try {
        const parsed = JSON.parse(value)
        if (Array.isArray(parsed)) {
          return parsed
            .map(item => String(item || '').trim())
            .filter(Boolean)
            .slice(0, 1)
        }
      } catch {
        return []
      }
    }
    return []
  }

  const resolveConversationEmoji = (conv, fallbackEmoji) => {
    const emojiList = normalizeTitleEmojis(conv?.title_emojis ?? conv?.titleEmojis)
    if (emojiList.length > 0) return emojiList[0]
    return fallbackEmoji || null
  }

  // State for conversations
  const [conversations, setConversations] = useState([])
  const [loading, setLoading] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [isDeletingId, setIsDeletingId] = useState(null)
  const limit = 12

  // State for collapsible actions
  const [expandedActionId, setExpandedActionId] = useState(null)

  // State for space documents
  const [spaceDocuments, setSpaceDocuments] = useState([])
  const [documentsLoading, setDocumentsLoading] = useState(false)
  const [documentUploadState, setDocumentUploadState] = useState({
    status: 'idle',
    message: '',
    fileName: '',
    characters: 0,
    sections: 0,
    chunks: 0,
    stage: '',
  })

  // New state for upload UI
  const fileInputRef = useRef(null)
  const [isDragging, setIsDragging] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const isViewActiveRef = useRef(true)
  const resumeUploadLockRef = useRef(false)

  const { error: toastError, success: toastSuccess } = useToast()
  const settings = useSettings()

  // Reset pagination when space changes
  useEffect(() => {
    isViewActiveRef.current = true
    return () => {
      isViewActiveRef.current = false
    }
  }, [])

  useEffect(() => {
    setCurrentPage(1)
  }, [spaceId])

  // Fetch conversations for this space
  useEffect(() => {
    const fetchConversations = async () => {
      if (!activeSpace?.id) {
        setConversations([])
        setTotalCount(0)
        return
      }

      setLoading(true)
      const { data, count, error } = await listConversationsBySpace(activeSpace.id, {
        page: currentPage,
        limit,
        sortBy: 'updated_at',
        ascending: false,
      })

      if (!error) {
        setConversations(data || [])
        if (count !== undefined) {
          setTotalCount(count)
          const totalPages = Math.ceil(count / limit)
          if (currentPage > totalPages && totalPages > 0) {
            setCurrentPage(totalPages)
          }
        }
      } else {
        console.error('Failed to load conversations by space:', error)
        toastError(t('views.spaceView.failedToLoad'))
      }
      setLoading(false)
    }

    fetchConversations()
  }, [activeSpace?.id, currentPage, toastError, t])

  const loadSpaceDocuments = useCallback(async () => {
    if (!activeSpace?.id) {
      setSpaceDocuments([])
      return
    }
    setDocumentsLoading(true)
    const { data, error } = await listSpaceDocuments(activeSpace.id)
    if (!error) {
      setSpaceDocuments(data || [])
    } else {
      console.error('Failed to load space documents:', error)
      toastError(t('views.spaceView.documentLoadFailed'))
    }
    setDocumentsLoading(false)
  }, [activeSpace?.id, t, toastError])

  useEffect(() => {
    loadSpaceDocuments()
  }, [loadSpaceDocuments])

  const totalPages = Math.ceil(totalCount / limit) || 1

  const handlePageChange = useCallback(
    newPage => {
      if (newPage >= 1 && newPage <= totalPages) {
        setCurrentPage(newPage)
      }
    },
    [totalPages],
  )

  const handleDeleteConversation = useCallback(
    async conversation => {
      if (!conversation) return

      showConfirmation({
        title: t('confirmation.delete'),
        message: t('confirmation.deleteMessage', { title: conversation.title }),
        confirmText: t('confirmation.delete'),
        isDangerous: true,
        onConfirm: async () => {
          setIsDeletingId(conversation.id)
          const { success, error } = await deleteConversation(conversation.id)

          if (success) {
            toastSuccess(t('views.spaceView.conversationDeleted'))
            setCurrentPage(1)
            // Notify Sidebar to refresh its conversation list
            notifyConversationsChanged({ scopes: ['library', 'bookmarks'] })
          } else {
            console.error('Failed to delete conversation:', error)
            toastError(t('views.spaceView.failedToDelete'))
            setIsDeletingId(null)
          }
        },
      })
    },
    [showConfirmation, setCurrentPage, toastSuccess, toastError, t],
  )

  const handleToggleFavorite = useCallback(
    async conversation => {
      const newStatus = !conversation.is_favorited
      const { error } = await toggleFavorite(conversation.id, newStatus)

      if (error) {
        console.error('Failed to toggle favorite:', error)
        toastError(t('sidebar.failedToUpdateFavorite'))
      } else {
        toastSuccess(newStatus ? t('views.addBookmark') : t('views.removeBookmark'))
        // Notify Sidebar to refresh its conversation list
        notifyConversationsChanged({ scopes: ['library', 'bookmarks'] })
      }
    },
    [toastSuccess, toastError, t],
  )

  const formatFileType = value => {
    const text = String(value || '')
      .trim()
      .toLowerCase()
    if (text === 'md') return 'MARKDOWN'
    return text ? text.toUpperCase() : 'FILE'
  }

  const syncUploadStateFromJob = useCallback(
    (job, fileName) => {
      if (!isViewActiveRef.current) return
      const result = job?.result || {}
      const nextProgress = Number(job?.progress || 0)
      setUploadProgress(Math.max(10, Math.min(100, nextProgress)))
      setDocumentUploadState({
        status: 'loading',
        stage: job?.stage || '',
        message: t(getDocumentUploadMessageKey(job)),
        fileName,
        characters: Number(result.character_count || 0),
        sections: Number(result.section_count || 0),
        chunks: Number(result.chunk_count || 0),
      })
    },
    [t],
  )

  const waitForDocumentUploadJob = useCallback(
    async (jobId, fileName) => {
      const maxAttempts = 240
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        if (!isViewActiveRef.current) {
          return null
        }
        const job = await getDocumentUploadJob(jobId)
        if (!isViewActiveRef.current) {
          return null
        }
        if (job?.status === 'completed') {
          syncUploadStateFromJob(job, fileName)
          return job
        }
        if (job?.status === 'cancelled') {
          throw new Error(job?.error || job?.message || t('views.spaceView.documentUploadFailed'))
        }
        if (job?.status === 'failed') {
          throw new Error(job?.error || job?.message || t('views.spaceView.documentUploadFailed'))
        }
        syncUploadStateFromJob(job, fileName)
        if (!isViewActiveRef.current) {
          return null
        }
        await new Promise(resolve => setTimeout(resolve, 1200))
      }
      throw new Error(t('views.spaceView.documentUploadTimeout'))
    },
    [syncUploadStateFromJob, t],
  )

  const finalizeCompletedUpload = useCallback(
    async ({ completedJob, fileName }) => {
      const result = completedJob?.result
      if (!result?.content_text || !result?.document_id) {
        throw new Error(t('views.spaceView.documentUploadFailed'))
      }

      const finalFileType = result.file_type || ''
      const { error: createError } = await createSpaceDocument({
        id: result.document_id,
        spaceId: activeSpace.id,
        name: fileName,
        fileType: finalFileType,
        contentText: result.content_text,
      })

      if (createError) {
        try {
          await deleteDocumentKnowledge({
            spaceId: activeSpace.id,
            documentId: result.document_id,
          })
        } catch (cleanupError) {
          console.error('Failed to cleanup knowledge after document insert failure:', cleanupError)
        }
        throw createError
      }

      clearPendingDocumentUploadJob(activeSpace.id)
      if (!isViewActiveRef.current) return
      setUploadProgress(100)
      setDocumentUploadState({
        status: 'success',
        stage: '',
        message: t('views.spaceView.documentUploaded'),
        fileName,
        characters: Number(result.character_count || 0),
        sections: Number(result.section_count || 0),
        chunks: Number(result.chunk_count || 0),
      })
      await loadSpaceDocuments()

      setTimeout(() => {
        if (!isViewActiveRef.current) return
        setDocumentUploadState(prev => ({ ...prev, status: 'idle', message: '' }))
        setUploadProgress(0)
      }, 3000)
    },
    [activeSpace?.id, loadSpaceDocuments, t],
  )

  useEffect(() => {
    if (!activeSpace?.id || resumeUploadLockRef.current) return
    const pendingUpload = getPendingDocumentUploadJob(activeSpace.id)
    if (!pendingUpload?.jobId) return

    resumeUploadLockRef.current = true
    setDocumentUploadState({
      status: 'loading',
      stage: 'uploading',
      message: t('views.spaceView.documentUploading'),
      fileName: pendingUpload.fileName,
      characters: 0,
      sections: 0,
      chunks: 0,
    })
    setUploadProgress(10)

    ;(async () => {
      try {
        const completedJob = await waitForDocumentUploadJob(
          pendingUpload.jobId,
          pendingUpload.fileName,
        )
        if (!completedJob) return
        await finalizeCompletedUpload({
          completedJob,
          fileName: pendingUpload.fileName,
        })
      } catch (err) {
        try {
          await cancelDocumentUploadJob(pendingUpload.jobId)
        } catch (cancelError) {
          console.error('Failed to cancel timed-out document upload job:', cancelError)
        }
        clearPendingDocumentUploadJob(activeSpace.id)
        if (!isViewActiveRef.current) return
        setUploadProgress(0)
        setDocumentUploadState({
          status: 'error',
          stage: '',
          message: err?.message || t('views.spaceView.documentUploadFailed'),
          fileName: pendingUpload.fileName,
          characters: 0,
          sections: 0,
          chunks: 0,
        })
      } finally {
        resumeUploadLockRef.current = false
      }
    })()
  }, [activeSpace?.id, finalizeCompletedUpload, t, waitForDocumentUploadJob])

  const handleDocumentUpload = async (event, droppedFile = null) => {
    const file = droppedFile || event.target.files?.[0]
    if (!file || !activeSpace?.id) return

    setDocumentUploadState({
      status: 'loading',
      stage: 'uploading',
      message: t('views.spaceView.documentUploading'),
      fileName: file.name,
      characters: 0,
      sections: 0,
      chunks: 0,
    })
    setUploadProgress(10)

    try {
      const providerId = settings?.defaultModelProvider || settings?.apiProvider || ''
      const provider = providerId ? getProvider(providerId) : null
      const credentials = provider?.getCredentials ? provider.getCredentials(settings) : {}
      const model = settings?.defaultModel || settings?.liteModel || ''

      const uploadJob = await createDocumentUploadJob({
        file,
        spaceId: activeSpace.id,
        title: file.name,
        provider: providerId,
        model,
        baseUrl: credentials?.baseUrl,
        apiKey: credentials?.apiKey,
      })

      savePendingDocumentUploadJob({
        spaceId: activeSpace.id,
        jobId: uploadJob.job_id,
        fileName: file.name,
      })
      syncUploadStateFromJob(uploadJob, file.name)

      const completedJob = await waitForDocumentUploadJob(uploadJob.job_id, file.name)
      if (!completedJob) {
        return
      }
      await finalizeCompletedUpload({ completedJob, fileName: file.name })
    } catch (err) {
      const pendingUpload = getPendingDocumentUploadJob(activeSpace.id)
      if (pendingUpload?.jobId) {
        try {
          await cancelDocumentUploadJob(pendingUpload.jobId)
        } catch (cancelError) {
          console.error('Failed to cancel document upload job:', cancelError)
        }
      }
      clearPendingDocumentUploadJob(activeSpace.id)
      console.error('Document upload error details:', err)
      if (!isViewActiveRef.current) {
        return
      }
      setUploadProgress(0)
      setDocumentUploadState({
        status: 'error',
        stage: '',
        message: err?.message || t('views.spaceView.documentUploadFailed'),
        fileName: file.name,
        characters: 0,
        sections: 0,
        chunks: 0,
      })
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const onDragOver = e => {
    e.preventDefault()
    setIsDragging(true)
  }

  const onDragLeave = e => {
    e.preventDefault()
    setIsDragging(false)
  }

  const onDrop = e => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) {
      handleDocumentUpload(null, file)
    }
  }

  const handleDeleteDocument = async (doc, e) => {
    e.stopPropagation()
    if (!doc) return

    showConfirmation({
      title: t('confirmation.delete'),
      message: t('views.spaceView.deleteDocumentMessage', { name: doc.name }),
      confirmText: t('confirmation.delete'),
      isDangerous: true,
      onConfirm: async () => {
        const { success, error } = await deleteSpaceDocument(doc.id, activeSpace.id)

        if (success) {
          toastSuccess(t('views.spaceView.documentDeleted'))
          loadSpaceDocuments()
        } else {
          console.error('Failed to delete document:', error)
          toastError(t('views.spaceView.documentDeleteFailed'))
        }
      },
    })
  }

  if (!activeSpace) {
    return <div className="bg-background text-foreground min-h-screen" />
  }

  return (
    <div
      className={clsx(
        'relative flex h-full flex-1 flex-col overflow-hidden bg-[#f4f4f4] transition-all duration-300 dark:bg-black',
        isSidebarPinned ? 'ml-0 sm:ml-72' : 'ml-0 sm:ml-16',
      )}
    >
      <div className="pointer-events-none absolute inset-0 z-0 opacity-40 dark:opacity-20">
        <ColorBendsBackground />
      </div>
      <div className="relative z-10 flex h-full flex-col">
        {/* Fixed Header */}
        <div className="mx-auto w-full max-w-[1400px] shrink-0 px-4 pt-4 pb-2 sm:px-8 sm:pt-8 sm:pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => toggleSidebar()}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gray-200/50 bg-white/90 p-0 text-gray-600 shadow-sm backdrop-blur-xl transition-all hover:bg-white sm:hidden dark:border-zinc-800/50 dark:bg-zinc-900/90 dark:text-gray-300"
              >
                <Menu size={20} strokeWidth={2} />
              </button>
              <div className="text-4xl">
                <EmojiDisplay emoji={activeSpace.emoji} size="2.25rem" />
              </div>
              <div className="flex flex-col">
                <h1 className="text-2xl font-semibold text-gray-900 sm:text-3xl dark:text-white">
                  {activeSpace.label}
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {activeSpace.description ||
                    t('views.spaceView.descriptionFallback', { label: activeSpace.label })}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => onEditSpace && onEditSpace(activeSpace)}
                className="flex items-center justify-center rounded-2xl bg-white p-3 text-sm font-bold text-gray-900 shadow-sm transition-all hover:scale-105 hover:shadow-md active:scale-95 dark:bg-zinc-800 dark:text-white"
                title={t('views.editSpace')}
              >
                <Pencil size={18} />
              </button>
            </div>
          </div>
        </div>

        {/* Scrollable Container */}
        <div className="no-scrollbar sm:scrollbar-default relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
          <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-8 px-4 pb-4 sm:px-8 sm:pb-8">
            {/* Section: Documents */}
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2 font-medium text-gray-900 dark:text-white">
                <FileText size={18} />
                <span>{t('views.spaceView.documents')}</span>
              </div>

              <div
                className={clsx(
                  'relative flex cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed p-8 transition-all',
                  isDragging
                    ? 'border-primary-500 bg-primary-500/5 dark:bg-primary-500/10'
                    : 'border-gray-200 bg-white/20 dark:border-zinc-800 dark:bg-zinc-900/40',
                )}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx,.txt,.md,.csv,.json,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={handleDocumentUpload}
                  className="hidden"
                />

                <div className="z-10 flex flex-col items-center gap-3">
                  <div
                    className={clsx(
                      'flex h-12 w-12 items-center justify-center rounded-xl transition-colors',
                      isDragging
                        ? 'bg-primary-100 text-primary-600 dark:bg-primary-500/20 dark:text-primary-400'
                        : 'bg-gray-100 text-gray-500 dark:bg-zinc-800 dark:text-gray-400',
                    )}
                  >
                    <UploadCloud size={24} />
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                      {isDragging
                        ? t('views.spaceView.dropToUpload')
                        : t('views.spaceView.clickOrDragToUpload')}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      PDF, DOCX, TXT, MD, CSV, JSON
                    </p>
                  </div>
                </div>

                {/* Progress Overlay */}
                {documentUploadState.status === 'loading' && (
                  <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-white dark:bg-zinc-900">
                    <div className="h-1.5 w-48 overflow-hidden rounded-full bg-gray-100 dark:bg-zinc-800">
                      <div
                        className="bg-primary-500 h-full transition-all duration-300 ease-out"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                    <p className="animate-pulse text-sm font-medium text-gray-600 dark:text-gray-300">
                      {documentUploadState.message}
                    </p>
                  </div>
                )}

                {/* Success/Error Overlay */}
                {documentUploadState.status !== 'idle' &&
                  documentUploadState.status !== 'loading' && (
                    <div
                      className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-white/95 dark:bg-zinc-900/95"
                      onClick={e => {
                        e.stopPropagation()
                        setDocumentUploadState(p => ({ ...p, status: 'idle' }))
                      }}
                    >
                      {documentUploadState.status === 'success' ? (
                        <CheckCircle2 size={32} className="text-emerald-500" />
                      ) : (
                        <AlertCircle size={32} className="text-red-500" />
                      )}
                      <p
                        className={clsx(
                          'text-sm font-medium',
                          documentUploadState.status === 'success'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-red-600 dark:text-red-400',
                        )}
                      >
                        {documentUploadState.message}
                      </p>
                    </div>
                  )}
              </div>

              <div className="flex flex-col gap-3">
                {documentsLoading && (
                  <div className="flex items-center justify-center py-8">
                    <FancyLoader />
                  </div>
                )}
                {!documentsLoading && spaceDocuments.length === 0 && (
                  <div className="rounded-xl border border-dashed border-gray-200 py-4 text-center text-sm text-gray-500 dark:border-zinc-800 dark:text-gray-400">
                    {t('views.spaceView.documentEmptyList')}
                  </div>
                )}
                {!documentsLoading &&
                  spaceDocuments.map(doc => (
                    <div
                      key={doc.id}
                      className="group flex items-start justify-between gap-3 rounded-xl border border-gray-100 bg-white/60 px-3 py-3 transition-colors hover:bg-white sm:items-center sm:gap-4 sm:px-4 sm:py-3 dark:border-zinc-800/60 dark:bg-zinc-900/30 dark:hover:bg-zinc-900"
                    >
                      <div className="flex min-w-0 flex-1 items-start gap-3 sm:items-center">
                        <div className="shrink-0 rounded-lg border border-gray-200/50 bg-gray-50 p-2 shadow-sm dark:border-zinc-700/50 dark:bg-zinc-800">
                          <FileIcon fileType={doc.file_type} size={20} />
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col gap-1">
                          <div className="truncate pr-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
                            {doc.name.replace(/\.[^/.]+$/, '')}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-gray-500 sm:text-xs dark:text-gray-400">
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] font-bold text-gray-400 uppercase dark:text-zinc-500">
                                {formatFileType(doc.file_type)}
                              </span>
                              <span className="text-gray-300 dark:text-zinc-700">·</span>
                              <span>
                                {t('views.spaceView.documentCharacters', {
                                  count: doc.content_text?.length || 0,
                                })}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={e => handleDeleteDocument(doc, e)}
                        className="shrink-0 rounded-lg p-2 text-gray-400 opacity-100 transition-all duration-200 hover:bg-red-50 hover:text-red-500 sm:opacity-0 sm:group-hover:opacity-100 dark:hover:bg-red-900/20"
                        title={t('views.spaceView.deleteDocument')}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
              </div>
            </div>

            {/* Section: My Topics */}
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2 font-medium text-gray-900 dark:text-white">
                <Layers size={18} />
                <span>{t('views.spaceView.myTopics')}</span>
              </div>

              {/* Topics Grid */}
              <div className="relative pb-32">
                {loading ? (
                  <div className="flex h-64 items-center justify-center">
                    <FancyLoader />
                  </div>
                ) : conversations.length === 0 ? (
                  <div className="flex h-64 flex-col items-center justify-center gap-4 text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-sm dark:bg-zinc-900">
                      <Layers size={28} className="text-gray-300" />
                    </div>
                    <p className="text-sm font-medium text-gray-500">
                      {t('views.spaceView.noThreadsFound')}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {conversations.map(conv => {
                      const isDeepResearch =
                        activeSpace?.isDeepResearchSystem ||
                        (deepResearchSpace?.id &&
                          String(activeSpace.id) === String(deepResearchSpace.id))
                      return (
                        <ConversationCard
                          key={conv.id}
                          conversation={conv}
                          space={activeSpace}
                          isDeepResearch={isDeepResearch}
                          onToggleFavorite={handleToggleFavorite}
                          onDelete={handleDeleteConversation}
                          isDeleting={isDeletingId === conv.id}
                        />
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Floating Pagination Controls */}
      {!loading && totalPages > 1 && (
        <div className="pointer-events-none absolute right-0 bottom-0 left-0 z-40 flex justify-center pb-8 sm:pb-10">
          <div className="pointer-events-auto flex items-center gap-2 rounded-3xl bg-white/80 p-1.5 shadow-2xl backdrop-blur-2xl transition-all sm:gap-3 dark:bg-zinc-900/80">
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-gray-600 transition-all hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-30 dark:bg-zinc-800 dark:text-gray-300 dark:hover:bg-zinc-700"
              title={t('views.previousPage')}
            >
              <ChevronLeft size={20} />
            </button>

            <div className="px-3 text-xs font-bold tracking-widest text-gray-500 uppercase sm:text-sm">
              {currentPage} <span className="mx-1 text-gray-300">/</span> {totalPages}
            </div>

            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-gray-600 transition-all hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-30 dark:bg-zinc-800 dark:text-gray-300 dark:hover:bg-zinc-700"
              title={t('views.nextPage')}
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default SpaceView
