import { useState, useMemo } from 'react'
import {
  X,
  Plus,
  Trash2,
  Edit2,
  Save,
  Search,
  Database,
  CloudAlert,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm md:p-4 animate-in fade-in duration-200">
      <div className="w-full h-[100dvh] md:max-w-5xl md:h-[85vh] bg-white dark:bg-[#191a1a] md:rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row md:border border-gray-200 dark:border-zinc-800 relative">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-30 p-2 rounded-full bg-gray-100/50 dark:bg-zinc-800/50 hover:bg-gray-200 dark:hover:bg-zinc-700 text-gray-500 backdrop-blur-sm transition-colors"
        >
          <X size={20} />
        </button>

        {/* LEFT PANE: List */}
        <div
          className={clsx(
            'flex flex-col w-full md:w-72 bg-primary-50 dark:bg-background/70 border-r border-gray-200 dark:border-zinc-800 h-full shrink-0',
            showForm ? 'hidden md:flex' : 'flex',
          )}
        >
          {/* Header */}
          <div className="p-4 sm:p-6 border-b border-gray-200 dark:border-zinc-800 flex flex-col gap-4 mt-8 md:mt-0">
            <h2 className="text-xl font-bold px-1 text-gray-900 dark:text-white flex items-center gap-2">
              <Database size={24} className="text-primary-600 dark:text-primary-400" />
              {t('knowledgeBase.title') || 'Knowledge Base'}
            </h2>
            <div className="relative">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="text"
                placeholder={t('common.search') || 'Search...'}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              />
            </div>
            <button
              onClick={handleCreate}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-600 text-white text-sm font-semibold rounded-lg hover:bg-primary-700 transition-all shadow-sm active:scale-95"
            >
              <Plus size={16} />
              {t('knowledgeBase.create') || 'New Collection'}
            </button>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {loading ? (
              <div className="flex items-center justify-center h-40 text-gray-500 text-sm">
                {t('common.loading') || 'Loading...'}
              </div>
            ) : filteredKbs.length === 0 ? (
              <div className="text-center py-10 px-4 text-gray-500 dark:text-gray-400">
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
                    'group flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer select-none',
                    editingKb?.id === kb.id
                      ? 'bg-primary-100 dark:bg-zinc-800 border-primary-500/30 shadow-sm'
                      : 'bg-white dark:bg-zinc-900 border-transparent hover:bg-primary-50 dark:hover:bg-zinc-800/50 hover:border-gray-200 dark:hover:border-zinc-700 hover:shadow-sm',
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span
                        className={clsx(
                          'text-sm font-semibold truncate',
                          editingKb?.id === kb.id
                            ? 'text-primary-600 dark:text-primary-400'
                            : 'text-gray-900 dark:text-gray-100',
                        )}
                      >
                        {kb.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400 font-mono opacity-80">
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
            'flex-1 flex flex-col bg-white dark:bg-[#191a1a] w-full h-full overflow-hidden',
            !showForm && 'hidden md:flex',
          )}
        >
          {/* Header */}
          <div className="h-16 border-b border-gray-200 dark:border-zinc-800 flex items-center justify-between px-4 sm:px-8">
            <div className="flex items-center gap-3">
              {showForm && (
                <button
                  onClick={() => {
                    setIsCreating(false)
                    setEditingKb(null)
                  }}
                  className="md:hidden p-2 -ml-2 text-gray-600 dark:text-gray-400"
                >
                  <ChevronRight size={20} className="rotate-180" />
                </button>
              )}
              <h3 className="font-semibold text-gray-900 dark:text-white capitalize">
                {showForm
                  ? isCreating
                    ? t('knowledgeBase.createTitle') || 'Create Collection'
                    : t('knowledgeBase.editTitle') || 'Edit Collection'
                  : t('knowledgeBase.selectPrompt') || 'Select a collection'}
              </h3>
            </div>
            <div className="w-10 h-10 hidden md:block" />
          </div>

          {showForm ? (
            <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-8 sm:py-8 min-h-0 shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07)]">
              <div className="max-w-2xl mx-auto space-y-8">
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
                      <label className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                        <Upload size={14} />
                        {t('knowledgeBase.documents') || 'Documents'}
                      </label>
                      <button className="text-xs text-primary-600 dark:text-primary-400 font-medium hover:underline">
                        {t('knowledgeBase.upload') || '+ Upload Files'}
                      </button>
                    </div>

                    <div className="bg-gray-50 dark:bg-zinc-900/50 border border-gray-200 dark:border-zinc-800 rounded-xl p-8 flex flex-col items-center justify-center text-center border-dashed">
                      <div className="p-3 bg-gray-100 dark:bg-zinc-800 rounded-full mb-3 text-gray-400">
                        <Upload size={20} />
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-300 font-medium">
                        Drag & drop files here
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                        PDF, TXT, Markdown, CSV
                      </p>
                    </div>
                  </div>
                )}

                <div className="pt-4 flex flex-col gap-3 pb-8 md:pb-0">
                  <button className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium transition-all active:scale-95">
                    <Save size={18} />
                    {t('common.save') || 'Save Changes'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-gray-500 dark:text-gray-400">
              <div className="w-16 h-16 bg-gray-50 dark:bg-zinc-900 rounded-2xl flex items-center justify-center mb-4">
                <Database size={32} className="text-gray-300 dark:text-zinc-600" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-1">
                {t('knowledgeBase.selectPrompt') || 'Select a collection'}
              </h3>
              <p className="text-sm max-w-xs mx-auto mb-6">
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
  <div className="space-y-1.5 w-full">
    <label className="text-xs font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
      {label}
    </label>
    <div className="relative">
      {icon && (
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
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
            'w-full px-3 py-2.5 bg-white disabled:bg-gray-50/20 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm transition-all resize-none',
            'focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500',
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
            'w-full px-3 py-2.5 bg-white disabled:bg-gray-50/20 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm transition-all',
            'focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500',
            'placeholder:text-gray-400 dark:placeholder:text-zinc-600',
            icon && 'pl-9',
          )}
        />
      )}
    </div>
  </div>
)

export default KnowledgeBaseModal
