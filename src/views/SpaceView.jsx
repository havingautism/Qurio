import { useNavigate } from '@tanstack/react-router'
import clsx from 'clsx'
import {
  Bookmark,
  ChevronLeft,
  ChevronRight,
  FileText,
  FileJson,
  FileSpreadsheet,
  FileCode,
  File,
  Layers,
  LogOut,
  MoreHorizontal,
  Pencil,
  Trash2,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react'
import { useCallback, useEffect, useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppContext } from '../App'
import DropdownMenu from '../components/DropdownMenu'
import EmojiDisplay from '../components/EmojiDisplay'
import FancyLoader from '../components/FancyLoader'
import { useToast } from '../contexts/ToastContext'
import { listConversationsBySpace, toggleFavorite } from '../lib/conversationsService'
import {
  extractTextFromFile,
  getFileTypeLabel,
  normalizeExtractedText,
} from '../lib/documentParser'
import { chunkDocumentWithHierarchy } from '../lib/documentStructure'
import {
  DOCUMENT_CHUNK_OVERLAP,
  DOCUMENT_CHUNK_SIZE,
  DOCUMENT_MAX_CHUNKS,
} from '../lib/documentConstants'
import {
  createSpaceDocument,
  deleteSpaceDocument,
  listSpaceDocuments,
} from '../lib/documentsService'
import { persistDocumentChunks, persistDocumentSections } from '../lib/documentIndexService'
import { fetchEmbeddingVector, resolveEmbeddingConfig } from '../lib/embeddingService'
import { computeSha256 } from '../lib/hash'
import { deleteConversation, removeConversationFromSpace } from '../lib/supabase'
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
  const navigate = useNavigate()
  const { spaces, isSidebarPinned, onEditSpace, onOpenConversation, showConfirmation } =
    useAppContext()

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
  const limit = 10

  // State for dropdown menu
  const [openMenuId, setOpenMenuId] = useState(null)
  const [menuAnchorEl, setMenuAnchorEl] = useState(null)

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

  const { error: toastError, success: toastSuccess } = useToast()

  // Reset pagination when space changes
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
          const { success, error } = await deleteConversation(conversation.id)

          if (success) {
            toastSuccess(t('views.spaceView.conversationDeleted'))
            setCurrentPage(1)
            // Notify Sidebar to refresh its conversation list
            window.dispatchEvent(new Event('conversations-changed'))
          } else {
            console.error('Failed to delete conversation:', error)
            toastError(t('views.spaceView.failedToDelete'))
          }
        },
      })
    },
    [showConfirmation, setCurrentPage, toastSuccess, toastError, t],
  )

  const handleRemoveFromSpace = useCallback(
    async conversation => {
      const { data, error } = await removeConversationFromSpace(conversation.id)

      if (!error && data) {
        toastSuccess(t('views.spaceView.removedFromSpace'))
        setCurrentPage(1)
        // Notify Sidebar to refresh its conversation list
        window.dispatchEvent(new Event('conversations-changed'))
      } else {
        console.error('Failed to remove conversation from space:', error)
        toastError(t('views.spaceView.failedToRemove'))
      }
    },
    [toastSuccess, toastError, t],
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
        window.dispatchEvent(new Event('conversations-changed'))
      }
    },
    [toastSuccess, toastError, t],
  )

  const formatFileType = value => {
    const text = String(value || '').trim()
    return text ? text.toUpperCase() : 'FILE'
  }

  const handleDocumentUpload = async (event, droppedFile = null) => {
    const file = droppedFile || event.target.files?.[0]
    if (!file || !activeSpace?.id) return

    setDocumentUploadState({
      status: 'loading',
      stage: 'chunking',
      message: t('views.spaceView.documentChunking'),
      fileName: file.name,
      characters: 0,
      sections: 0,
      chunks: 0,
    })
    setUploadProgress(10)

    try {
      const rawText = await extractTextFromFile(file, {
        unsupportedMessage: t('views.spaceView.documentUnsupportedType'),
      })
      const normalized = normalizeExtractedText(rawText)
      if (!normalized) {
        throw new Error(t('views.spaceView.documentEmpty'))
      }

      const { sections, chunks } = chunkDocumentWithHierarchy(normalized, {
        chunkSize: DOCUMENT_CHUNK_SIZE,
        chunkOverlap: DOCUMENT_CHUNK_OVERLAP,
        maxChunks: DOCUMENT_MAX_CHUNKS,
      })
      setUploadProgress(45)
      setDocumentUploadState(prev => ({
        ...prev,
        sections: sections.length,
        chunks: chunks.length,
        stage: 'embedding',
        message: t('views.spaceView.documentEmbedding'),
      }))

      const enrichedChunks = []
      const sanitizeChunkText = text =>
        String(text || '')
          .replace(/<[^>]+>/g, '')
          .replace(/\[.*?\]/g, '')
          .replace(/\n+/g, ' ')
          .trim()

      const sanitizeHeadingText = text =>
        String(text || '')
          .replace(/<[^>]+>/g, '')
          .replace(/&lt;|&gt;/g, '')
          .replace(/\[.*?\]/g, '')
          .replace(/\s+/g, ' ')
          .trim()

      if (chunks.length > 0) {
        for (let index = 0; index < chunks.length; index += 1) {
          const chunk = chunks[index]
          const headingLabel =
            chunk.titlePath?.length > 0 ? chunk.titlePath.join(' > ') : chunk.heading
          const titleLabel = sanitizeHeadingText(headingLabel) || file?.name || 'Document'
          const sanitizedText = sanitizeChunkText(chunk.text)
          const chunkPrompt = `passage: ${titleLabel}. ${sanitizedText}`
          const embedding = await fetchEmbeddingVector({
            text: sanitizedText,
            taskType: 'RETRIEVAL_DOCUMENT',
            prompt: chunkPrompt,
          })
          const chunkHash = await computeSha256(chunk.text)
          enrichedChunks.push({ ...chunk, embedding, chunkHash })
          const progress = Math.min(85, 45 + Math.round(((index + 1) / chunks.length) * 35))
          setUploadProgress(progress)
          setDocumentUploadState(prev => ({
            ...prev,
            message: t('views.spaceView.documentEmbeddingProgress', {
              current: index + 1,
              total: chunks.length,
            }),
          }))
        }
      }

      const fileType = getFileTypeLabel(file)
      const { provider: embeddingProvider, model: embeddingModel } = resolveEmbeddingConfig()
      const { error: createError, data: doc } = await createSpaceDocument({
        spaceId: activeSpace.id,
        name: file.name,
        fileType,
        contentText: normalized,
        embeddingProvider,
        embeddingModel,
      })

      if (createError || !doc) {
        throw createError || new Error('Failed to create document record')
      }

      const { sectionMap, error: sectionsError } = await persistDocumentSections(doc.id, sections)
      if (sectionsError) {
        await deleteSpaceDocument(doc.id)
        throw sectionsError
      }

      const { error: chunksError } = await persistDocumentChunks(doc.id, enrichedChunks, sectionMap)
      if (chunksError) {
        await deleteSpaceDocument(doc.id)
        throw chunksError
      }

      setUploadProgress(100)
      setDocumentUploadState({
        status: 'success',
        stage: '',
        message: t('views.spaceView.documentUploaded'),
        fileName: file.name,
        characters: normalized.length,
        sections: sections.length,
        chunks: enrichedChunks.length,
      })
      await loadSpaceDocuments()

      setTimeout(() => {
        setDocumentUploadState(prev => ({ ...prev, status: 'idle', message: '' }))
        setUploadProgress(0)
      }, 3000)
    } catch (err) {
      console.error('Document upload error details:', err)
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
        const { success, error } = await deleteSpaceDocument(doc.id)

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
    return <div className="min-h-screen bg-background text-foreground" />
  }

  return (
    <div
      className={clsx(
        'flex flex-col items-center min-h-0 h-full overflow-y-auto p-6 pb-24 bg-background text-foreground transition-all duration-300',
        isSidebarPinned ? 'ml-0 sm:ml-72' : 'ml-0 sm:ml-16',
      )}
    >
      <div className="w-full max-w-3xl flex flex-col gap-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="text-4xl">
              <EmojiDisplay emoji={activeSpace.emoji} size="2.25rem" />
            </div>
            <div className="flex flex-col">
              <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
                {activeSpace.label}
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {activeSpace.description || `${activeSpace.label} search records`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onEditSpace && onEditSpace(activeSpace)}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-user-bubble dark:bg-zinc-800 text-gray-600 dark:text-gray-300 transition-transform duration-200 hover:scale-110 active:scale-95 cursor-pointer"
              title={t('views.editSpace')}
            >
              <Pencil size={16} />
            </button>
          </div>
        </div>

        {/* Section: Documents */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 text-gray-900 dark:text-white font-medium">
            <FileText size={18} />
            <span>{t('views.spaceView.documents')}</span>
          </div>

          <div
            className={clsx(
              'relative flex flex-col items-center justify-center p-8 rounded-2xl border-2 border-dashed transition-all cursor-pointer overflow-hidden',
              isDragging
                ? 'border-primary-500 bg-primary-500/5 dark:bg-primary-500/10'
                : 'border-gray-200 dark:border-zinc-800 bg-white/20 dark:bg-zinc-900/40',
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

            <div className="flex flex-col items-center gap-3 z-10">
              <div
                className={clsx(
                  'w-12 h-12 rounded-xl flex items-center justify-center transition-colors',
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
              <div className="absolute inset-0 bg-white dark:bg-zinc-900 flex flex-col items-center justify-center gap-3 z-20">
                <div className="w-48 h-1.5 bg-gray-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary-500 transition-all duration-300 ease-out"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-300 animate-pulse">
                  {documentUploadState.message}
                </p>
              </div>
            )}

            {/* Success/Error Overlay */}
            {documentUploadState.status !== 'idle' && documentUploadState.status !== 'loading' && (
              <div
                className="absolute inset-0 bg-white/95 dark:bg-zinc-900/95 flex flex-col items-center justify-center gap-2 z-20"
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
                {documentUploadState.status === 'success' &&
                  documentUploadState.sections > 0 &&
                  documentUploadState.chunks > 0 && (
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {t('views.spaceView.documentSections', {
                        count: documentUploadState.sections,
                      })}
                      {' • '}
                      {t('views.spaceView.documentChunks', { count: documentUploadState.chunks })}
                    </div>
                  )}
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
              <div className="text-sm text-center py-4 text-gray-500 dark:text-gray-400 border border-dashed border-gray-200 dark:border-zinc-800 rounded-xl">
                {t('views.spaceView.documentEmptyList')}
              </div>
            )}
            {!documentsLoading &&
              spaceDocuments.map(doc => (
                <div
                  key={doc.id}
                  className="group flex items-start sm:items-center justify-between gap-3 sm:gap-4 rounded-xl border border-gray-100 dark:border-zinc-800/60 bg-white/60 dark:bg-zinc-900/30 px-3 py-3 sm:px-4 sm:py-3 hover:bg-white dark:hover:bg-zinc-900 transition-colors"
                >
                  <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
                    <div className="shrink-0 p-2 rounded-lg bg-gray-50 dark:bg-zinc-800 shadow-sm border border-gray-200/50 dark:border-zinc-700/50">
                      <FileIcon fileType={doc.file_type} size={20} />
                    </div>
                    <div className="flex flex-col gap-1 min-w-0 flex-1">
                      <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate pr-2">
                        {doc.name}
                      </div>
                      <div className="text-[11px] sm:text-xs text-gray-500 dark:text-gray-400 flex flex-wrap items-center gap-x-2 gap-y-1">
                        <div className="flex items-center gap-1">
                          <span className="uppercase font-bold text-[10px] text-gray-400 dark:text-zinc-500">
                            {formatFileType(doc.file_type)}
                          </span>
                          <span className="text-gray-300 dark:text-zinc-700">·</span>
                          <span>
                            {t('views.spaceView.documentCharacters', {
                              count: doc.content_text?.length || 0,
                            })}
                          </span>
                        </div>
                        {doc.embedding_model && (
                          <div className="flex items-center gap-1">
                            <span className="text-gray-300 dark:text-zinc-700 hidden sm:inline">
                              ·
                            </span>
                            <span className="bg-primary-500/5 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400 px-1.5 py-0.5 rounded text-[10px]">
                              {doc.embedding_model}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={e => handleDeleteDocument(doc, e)}
                    className="shrink-0 p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-all duration-200"
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
          <div className="flex items-center gap-2 text-gray-900 dark:text-white font-medium">
            <Layers size={18} />
            <span>{t('views.spaceView.myTopics')}</span>
          </div>

          {/* Topics List */}
          <div className="relative flex flex-col gap-4">
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center backdrop-blur-md bg-background/40 rounded-2xl">
                <FancyLoader />
              </div>
            )}
            {!loading && conversations.length === 0 && (
              <div className="text-sm text-gray-500 dark:text-gray-400">
                {t('views.spaceView.noThreadsFound')}
              </div>
            )}
            {!loading &&
              conversations.map((conv, i) => (
                <div
                  key={conv.id || i}
                  data-conversation-id={conv.id || i}
                  className="group relative py-3 sm:p-4 rounded-xl cursor-pointer transition-colors border-b border-gray-100 dark:border-zinc-800/50 last:border-0 hover:bg-primary-500/10 dark:hover:bg-primary-500/20 hover:border hover:border-primary-500/30 dark:hover:border-primary-500/40"
                  onClick={() => onOpenConversation && onOpenConversation(conv)}
                >
                  <div className="flex justify-between items-start gap-4">
                    <div className="shrink-0 flex items-center justify-center bg-gray-100 dark:bg-zinc-800 rounded-lg w-12 h-12">
                      <EmojiDisplay
                        emoji={resolveConversationEmoji(conv, activeSpace?.emoji)}
                        size="2rem"
                      />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-medium text-gray-900 dark:text-gray-100 group-hover:text-primary-500 transition-colors flex items-center gap-2">
                        {conv.title || t('views.untitled')}
                        {conv.is_favorited && (
                          <Bookmark size={14} className="text-yellow-500 fill-current" />
                        )}
                      </h3>
                      <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
                        <span>
                          {new Date(conv.updated_at || conv.created_at).toLocaleDateString(
                            i18n.language === 'zh-CN' ? 'zh-CN' : 'en-US',
                            {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            },
                          )}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="relative">
                      <button
                        className={clsx(
                          'p-1 hover:bg-primary-500/10 dark:hover:bg-primary-500/20 rounded text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-all',
                          'opacity-100',
                          'md:opacity-0 md:group-hover:opacity-100',
                          'min-w-[44px] min-h-[44px] flex items-center justify-center',
                        )}
                        onClick={e => {
                          e.stopPropagation()
                          setOpenMenuId(conv.id)
                          setMenuAnchorEl(e.currentTarget)
                        }}
                      >
                        <MoreHorizontal size={16} strokeWidth={2} />
                      </button>
                      <DropdownMenu
                        isOpen={openMenuId === conv.id}
                        anchorEl={openMenuId === conv.id ? menuAnchorEl : null}
                        onClose={() => {
                          setOpenMenuId(null)
                          setMenuAnchorEl(null)
                        }}
                        items={[
                          {
                            label: conv.is_favorited
                              ? t('views.removeBookmark')
                              : t('views.addBookmark'),
                            icon: (
                              <Bookmark
                                size={14}
                                className={conv.is_favorited ? 'fill-current' : ''}
                              />
                            ),
                            onClick: () => handleToggleFavorite(conv),
                            className: conv.is_favorited ? 'text-yellow-500' : '',
                          },
                          {
                            label: t('views.removeFromSpace'),
                            icon: <LogOut size={14} />,
                            onClick: () => handleRemoveFromSpace(conv),
                          },
                          {
                            label: t('views.deleteConversation'),
                            icon: <Trash2 size={14} />,
                            danger: true,
                            onClick: () => handleDeleteConversation(conv),
                          },
                        ]}
                      />
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Pagination Controls */}
      {!loading && totalPages > 1 && (
        <div
          className={clsx(
            'fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur border-t border-gray-200 dark:border-zinc-800',
            isSidebarPinned ? 'pl-0 sm:pl-80' : 'pl-0 sm:pl-16',
          )}
        >
          <div className="max-w-3xl mx-auto px-4">
            <div className="flex items-center justify-center gap-4 py-4">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title={t('views.previousPage')}
              >
                <ChevronLeft size={20} />
              </button>

              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                {t('views.pageOf', { current: currentPage, total: totalPages })}
              </span>

              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title={t('views.nextPage')}
              >
                <ChevronRight size={20} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default SpaceView
