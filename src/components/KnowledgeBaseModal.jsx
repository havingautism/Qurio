import { useState, useMemo } from 'react'
import {
  X,
  Plus,
  Save,
  Search,
  Database,
  ChevronRight,
  FileText,
  Upload,
  FolderOpen,
} from 'lucide-react'
import clsx from 'clsx'
import { useTranslation } from 'react-i18next'

const KnowledgeBaseModal = ({ isOpen, onClose }) => {
  const { t } = useTranslation()
  const [knowledgeBases, setKnowledgeBases] = useState([]) // Placeholder for data
  const [loading, setLoading] = useState(false)
  const [editingKb, setEditingKb] = useState(null)
  const [isCreating, setIsCreating] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // Placeholder form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
  })

  // Mock Data for UI dev
  useState(() => {
    setKnowledgeBases([
      {
        id: '1',
        name: 'Product Documentation',
        description: 'Official product guides and manuals',
        docCount: 12,
      },
      {
        id: '2',
        name: 'Engineering Standards',
        description: 'Internal coding standards and best practices',
        docCount: 5,
      },
      {
        id: '3',
        name: 'Marketing Assets',
        description: 'Brand guidelines and copy snippets',
        docCount: 8,
      },
    ])
  }, [])

  const handleCreate = () => {
    setIsCreating(true)
    setEditingKb(null)
    setFormData({ name: '', description: '' })
  }

  const handleEdit = kb => {
    setIsCreating(false)
    setEditingKb(kb)
    setFormData({
      name: kb.name,
      description: kb.description,
    })
  }

  const filteredKbs = useMemo(() => {
    if (!searchQuery) return knowledgeBases
    const query = searchQuery.toLowerCase()
    return knowledgeBases.filter(
      kb => kb.name.toLowerCase().includes(query) || kb.description.toLowerCase().includes(query),
    )
  }, [knowledgeBases, searchQuery])

  if (!isOpen) return null

  const showForm = isCreating || editingKb

  return (
    <div className="animate-in fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm duration-200 md:p-4">
      <div className="relative flex h-dvh w-full flex-col overflow-hidden border-gray-200 bg-white shadow-2xl md:h-[85vh] md:max-w-5xl md:flex-row md:rounded-2xl md:border dark:border-zinc-800 dark:bg-[#191a1a]">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-30 rounded-full bg-gray-100/50 p-2 text-gray-500 backdrop-blur-sm transition-colors hover:bg-gray-200 dark:bg-zinc-800/50 dark:hover:bg-zinc-700"
        >
          <X size={20} />
        </button>

        {/* LEFT PANE: List */}
        <div
          className={clsx(
            'bg-primary-50 dark:bg-background/70 flex h-full w-full shrink-0 flex-col border-r border-gray-200 md:w-72 dark:border-zinc-800',
            showForm ? 'hidden md:flex' : 'flex',
          )}
        >
          {/* Header */}
          <div className="mt-8 flex flex-col gap-4 border-b border-gray-200 p-4 sm:p-6 md:mt-0 dark:border-zinc-800">
            <h2 className="flex items-center gap-2 px-1 text-xl font-bold text-gray-900 dark:text-white">
              <Database size={24} className="text-primary-600 dark:text-primary-400" />
              {t('knowledgeBase.title') || 'Knowledge Base'}
            </h2>
            <div className="relative">
              <Search
                size={14}
                className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400"
              />
              <input
                type="text"
                placeholder={t('common.search') || 'Search...'}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="focus:ring-primary-500/20 w-full rounded-lg border border-gray-200 bg-white py-2 pr-4 pl-9 text-sm focus:ring-2 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900"
              />
            </div>
            <button
              onClick={handleCreate}
              className="bg-primary-600 hover:bg-primary-700 flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all active:scale-95"
            >
              <Plus size={16} />
              {t('knowledgeBase.create') || 'New Collection'}
            </button>
          </div>

          {/* List */}
          <div className="flex-1 space-y-2 overflow-y-auto p-3">
            {loading ? (
              <div className="flex h-40 items-center justify-center text-sm text-gray-500">
                {t('common.loading') || 'Loading...'}
              </div>
            ) : filteredKbs.length === 0 ? (
              <div className="px-4 py-10 text-center text-gray-500 dark:text-gray-400">
                <div className="mb-2 flex justify-center">
                  <FolderOpen size={24} className="opacity-20" />
                </div>
                <p className="text-sm">{t('knowledgeBase.empty') || 'No collections found'}</p>
              </div>
            ) : (
              filteredKbs.map(kb => (
                <div
                  key={kb.id}
                  onClick={() => handleEdit(kb)}
                  className={clsx(
                    'group flex cursor-pointer items-center justify-between rounded-xl border p-3 transition-all select-none',
                    editingKb?.id === kb.id
                      ? 'bg-primary-100 border-primary-500/30 shadow-sm dark:bg-zinc-800'
                      : 'hover:bg-primary-50 border-transparent bg-white hover:border-gray-200 hover:shadow-sm dark:bg-zinc-900 dark:hover:border-zinc-700 dark:hover:bg-zinc-800/50',
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="mb-0.5 flex items-center gap-2">
                      <span
                        className={clsx(
                          'truncate text-sm font-semibold',
                          editingKb?.id === kb.id
                            ? 'text-primary-600 dark:text-primary-400'
                            : 'text-gray-900 dark:text-gray-100',
                        )}
                      >
                        {kb.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 font-mono text-[11px] text-gray-500 opacity-80 dark:text-gray-400">
                      <FileText size={10} />
                      <span>
                        {kb.docCount} {t('knowledgeBase.docs') || 'files'}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* RIGHT PANE: Details */}
        <div
          className={clsx(
            'flex h-full w-full flex-1 flex-col overflow-hidden bg-white dark:bg-[#191a1a]',
            !showForm && 'hidden md:flex',
          )}
        >
          {/* Header */}
          <div className="flex h-16 items-center justify-between border-b border-gray-200 px-4 sm:px-8 dark:border-zinc-800">
            <div className="flex items-center gap-3">
              {showForm && (
                <button
                  onClick={() => {
                    setIsCreating(false)
                    setEditingKb(null)
                  }}
                  className="-ml-2 p-2 text-gray-600 md:hidden dark:text-gray-400"
                >
                  <ChevronRight size={20} className="rotate-180" />
                </button>
              )}
              <h3 className="font-semibold text-gray-900 capitalize dark:text-white">
                {showForm
                  ? isCreating
                    ? t('knowledgeBase.createTitle') || 'Create Collection'
                    : t('knowledgeBase.editTitle') || 'Edit Collection'
                  : t('knowledgeBase.selectPrompt') || 'Select a collection'}
              </h3>
            </div>
            <div className="hidden h-10 w-10 md:block" />
          </div>

          {showForm ? (
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07)] sm:px-8 sm:py-8">
              <div className="mx-auto max-w-2xl space-y-8">
                {/* Basic Info */}
                <div className="space-y-4">
                  <FormInput
                    label={t('knowledgeBase.form.name') || 'Name'}
                    value={formData.name}
                    onChange={v => setFormData({ ...formData, name: v })}
                    placeholder="e.g. Compliance Documents"
                  />
                  <FormInput
                    label={t('knowledgeBase.form.description') || 'Description'}
                    value={formData.description}
                    onChange={v => setFormData({ ...formData, description: v })}
                    placeholder="Optional description..."
                    type="textarea"
                  />
                </div>

                {!isCreating && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
                        <Upload size={14} />
                        {t('knowledgeBase.documents') || 'Documents'}
                      </label>
                      <button className="text-primary-600 dark:text-primary-400 text-xs font-medium hover:underline">
                        {t('knowledgeBase.upload') || '+ Upload Files'}
                      </button>
                    </div>

                    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50 p-8 text-center dark:border-zinc-800 dark:bg-zinc-900/50">
                      <div className="mb-3 rounded-full bg-gray-100 p-3 text-gray-400 dark:bg-zinc-800">
                        <Upload size={20} />
                      </div>
                      <p className="text-sm font-medium text-gray-600 dark:text-gray-300">
                        Drag & drop files here
                      </p>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-500">
                        PDF, TXT, Markdown, CSV
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-3 pt-4 pb-8 md:pb-0">
                  <button className="bg-primary-600 hover:bg-primary-700 flex flex-1 items-center justify-center gap-2 rounded-xl px-6 py-3 font-medium text-white transition-all active:scale-95">
                    <Save size={18} />
                    {t('common.save') || 'Save Changes'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center p-8 text-center text-gray-500 dark:text-gray-400">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-50 dark:bg-zinc-900">
                <Database size={32} className="text-gray-300 dark:text-zinc-600" />
              </div>
              <h3 className="mb-1 text-lg font-medium text-gray-900 dark:text-gray-100">
                {t('knowledgeBase.selectPrompt') || 'Select a collection'}
              </h3>
              <p className="mx-auto mb-6 max-w-xs text-sm">
                {t('knowledgeBase.selectPromptHelp') ||
                  'Manage your documents and embedding indexes from here.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const FormInput = ({ label, value, onChange, placeholder, type = 'text', icon, rows }) => (
  <div className="w-full space-y-1.5">
    <label className="flex items-center gap-1.5 text-xs font-medium text-gray-700 dark:text-gray-300">
      {label}
    </label>
    <div className="relative">
      {icon && (
        <div className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-gray-400">
          {icon}
        </div>
      )}
      {type === 'textarea' ? (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows || 3}
          className={clsx(
            'w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm transition-all disabled:bg-gray-50/20 dark:border-zinc-700 dark:bg-zinc-900',
            'focus:ring-primary-500/20 focus:border-primary-500 focus:ring-2 focus:outline-none',
            'placeholder:text-gray-400 dark:placeholder:text-zinc-600',
            icon && 'pl-9',
          )}
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className={clsx(
            'w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm transition-all disabled:bg-gray-50/20 dark:border-zinc-700 dark:bg-zinc-900',
            'focus:ring-primary-500/20 focus:border-primary-500 focus:ring-2 focus:outline-none',
            'placeholder:text-gray-400 dark:placeholder:text-zinc-600',
            icon && 'pl-9',
          )}
        />
      )}
    </div>
  </div>
)

export default KnowledgeBaseModal
