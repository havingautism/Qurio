import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Trash2, Save, X } from 'lucide-react'
import useScrollLock from '../../../hooks/useScrollLock'
import { useAppContext } from '../../../App'

const NoteModal = ({ isOpen, onClose, note, onSave, onDelete }) => {
  const { t } = useTranslation()
  const { showConfirmation } = useAppContext()
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
      showConfirmation({
        title: t('confirmation.deleteNoteTitle') || 'Delete Note',
        message:
          t('confirmation.deleteNoteMessage') || 'Are you sure you want to delete this note?',
        confirmText: t('common.delete', 'Delete'),
        isDangerous: true,
        onConfirm: () => onDelete(note.id),
      })
    }
  }

  const modalContent = (
    <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/50 p-4 md:backdrop-blur-sm">
      <div className="flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl transition-all dark:border-zinc-800 dark:bg-[#191a1a]">
        {/* Header */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-6 dark:border-zinc-800 dark:bg-[#191a1a]">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {note?.id
              ? t('views.widgets.editNote', 'Edit Note')
              : t('views.widgets.newNote', 'New Note')}
          </h3>
          <button
            onClick={onClose}
            className="-mr-2 rounded-full p-2 text-gray-500 transition-colors hover:bg-gray-100 dark:hover:bg-zinc-800"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="min-h-[300px] flex-1 bg-white p-6 dark:bg-[#191a1a]/50">
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder={t('views.widgets.notePlaceholder', 'Write something...')}
            className="font-handwriting h-full w-full resize-none bg-transparent text-base leading-relaxed text-gray-700 placeholder-gray-400 outline-none dark:text-gray-200"
            autoFocus
          />
        </div>

        {/* Footer */}
        <div className="flex h-16 items-center justify-between border-t border-gray-200 bg-white px-6 dark:border-zinc-800 dark:bg-[#191a1a]">
          <div>
            {note?.id && (
              <button
                onClick={handleDelete}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/10"
              >
                <Trash2 size={16} />
                {t('common.delete', 'Delete')}
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-zinc-800"
            >
              {t('common.cancel', 'Cancel')}
            </button>
            <button
              onClick={handleSave}
              className="bg-primary-500 hover:bg-primary-600 flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors"
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
