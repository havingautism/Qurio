import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Trash2, Save, X } from 'lucide-react'
import useScrollLock from '../../../hooks/useScrollLock'

const NoteModal = ({ isOpen, onClose, note, onSave, onDelete }) => {
  const { t } = useTranslation()
  const [content, setContent] = useState('')

  useScrollLock(isOpen)

  useEffect(() => {
    setContent(note?.content || '')
  }, [note])

  if (!isOpen) return null
  if (typeof document === 'undefined') return null

  const handleSave = () => {
    onSave({ ...note, content })
  }

  const handleDelete = () => {
    if (onDelete && note?.id) {
      onDelete(note.id)
    }
  }

  const modalContent = (
    <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-white dark:bg-[#191a1a] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-gray-200 dark:border-zinc-800 transition-all">
        {/* Header */}
        <div className="h-14 border-b border-gray-200 dark:border-zinc-800 flex items-center justify-between px-6 shrink-0 bg-white dark:bg-[#191a1a]">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {note?.id
              ? t('views.widgets.editNote', 'Edit Note')
              : t('views.widgets.newNote', 'New Note')}
          </h3>
          <button
            onClick={onClose}
            className="p-2 -mr-2 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-500 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 p-6 min-h-[300px] bg-gray-50 dark:bg-[#191a1a]/50">
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder={t('views.widgets.notePlaceholder', 'Write something...')}
            className="w-full h-full bg-transparent resize-none outline-none text-gray-700 dark:text-gray-200 placeholder-gray-400 text-base leading-relaxed font-handwriting"
            autoFocus
          />
        </div>

        {/* Footer */}
        <div className="h-16 border-t border-gray-200 dark:border-zinc-800 flex items-center justify-between px-6 bg-white dark:bg-[#191a1a]">
          <div>
            {note?.id && (
              <button
                onClick={handleDelete}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors text-sm font-medium"
              >
                <Trash2 size={16} />
                {t('common.delete', 'Delete')}
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors text-sm font-medium"
            >
              {t('common.cancel', 'Cancel')}
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-white transition-colors text-sm font-medium shadow-sm"
            >
              <Save size={16} />
              {t('common.save', 'Save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  return createPortal(modalContent, document.body)
}

export default NoteModal
