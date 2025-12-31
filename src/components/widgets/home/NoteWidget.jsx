import { useEffect, useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, ChevronLeft, ChevronRight, StickyNote, Pencil } from 'lucide-react'
import WidgetCard from './WidgetCard'
import NoteModal from './NoteModal'
import { fetchHomeNotes, upsertHomeNote, deleteHomeNote } from '../../../lib/homeWidgetsService'

const NoteWidget = () => {
  const { t } = useTranslation()
  const [notes, setNotes] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingNote, setEditingNote] = useState(null)
  const [isLoading, setIsLoading] = useState(false)

  // Load notes on mount
  // Load notes on mount
  const loadNotes = async () => {
    setIsLoading(true)
    const { data } = await fetchHomeNotes()
    if (data) {
      setNotes(data)
      // Reset index if out of bounds
      if (currentIndex >= data.length) {
        setCurrentIndex(Math.max(0, data.length - 1))
      }
    }
    setIsLoading(false)
  }

  useEffect(() => {
    loadNotes()
  }, [])

  const handleSave = async noteToSave => {
    const { data, error } = await upsertHomeNote(noteToSave)
    if (!error && data) {
      loadNotes()
      setIsModalOpen(false)
    }
  }

  const handleDelete = async id => {
    const { error } = await deleteHomeNote(id)
    if (!error) {
      loadNotes()
      setIsModalOpen(false)
    }
  }

  const openNewNoteModal = e => {
    e.stopPropagation()
    setEditingNote(null) // New note
    setIsModalOpen(true)
  }

  const openEditModal = note => {
    setEditingNote(note)
    setIsModalOpen(true)
  }

  const nextNote = e => {
    e.stopPropagation()
    if (currentIndex < notes.length - 1) {
      setCurrentIndex(prev => prev + 1)
    }
  }

  const prevNote = e => {
    e.stopPropagation()
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1)
    }
  }

  return (
    <>
      <div className="relative h-[140px] sm:h-[150px] md:h-[160px] w-full perspective-1000 group overflow-x-clip mb-2 sm:mb-0">
        {/* Notes Stack */}
        <div className="relative w-full h-full flex items-center justify-center mx-auto px-4 sm:px-10 md:px-6">
          {/* Navigation Controls - inside stack for proper spacing */}
          {notes.length > 1 && (
            <div className="absolute top-4/5 sm:top-1/2 -translate-y-1/2 left-0 z-30 transition-opacity md:opacity-0 md:pointer-events-none md:group-hover:opacity-100 md:group-hover:pointer-events-auto pl-1">
              <button
                onClick={prevNote}
                disabled={currentIndex === 0}
                className="flex items-center justify-center w-8 h-14 bg-black/20 hover:bg-black/40 text-white rounded-xl disabled:opacity-0 transition-all backdrop-blur-sm"
              >
                <ChevronLeft size={24} />
              </button>
            </div>
          )}
          {notes.length > 1 && (
            <div className="absolute top-4/5 sm:top-1/2 -translate-y-1/2 right-0 z-30 transition-opacity md:opacity-0 md:pointer-events-none md:group-hover:opacity-100 md:group-hover:pointer-events-auto pr-1">
              <button
                onClick={nextNote}
                disabled={currentIndex === notes.length - 1}
                className="flex items-center justify-center w-8 h-14 bg-black/20 hover:bg-black/40 text-white rounded-xl disabled:opacity-0 transition-all backdrop-blur-sm"
              >
                <ChevronRight size={24} />
              </button>
            </div>
          )}

          {notes.length === 0 && !isLoading && (
            <div
              onClick={openNewNoteModal}
              className="flex flex-col items-center justify-center text-gray-500 dark:text-gray-400 cursor-pointer hover:text-primary-500 transition-colors bg-user-bubble dark:bg-[#1e1e1e]/60 backdrop-blur-md border-2 border-dashed border-gray-200 dark:border-white/10 rounded-2xl w-full h-full"
            >
              <StickyNote size={32} className="mb-2 opacity-50" />
              <span className="text-sm font-medium">
                {t('views.widgets.createFirstNote', 'Create a Note')}
              </span>
            </div>
          )}

          {notes.map((note, index) => {
            const offset = index - currentIndex
            const isActive = index === currentIndex

            // Visible range: active, 1 before, 2 after
            if (Math.abs(offset) > 2) return null

            let zIndex = 10 - Math.abs(offset)
            let scale = 1 - Math.abs(offset) * 0.04
            // Keep stack inside the card width to avoid covering neighbors
            let translateX = offset * 8
            let translateY = offset * 1
            let rotate = offset * 1
            let opacity = 1 - Math.abs(offset) * 0.12

            // Previous notes: stack to left, slightly visible
            if (offset < 0) {
              translateX = offset * 8
              rotate = offset * 1
            }

            // Stacked effect logic
            const style = {
              transform: `translateX(${translateX}px) translateY(${translateY}px) scale(${scale}) rotate(${rotate}deg)`,
              zIndex: zIndex,
              opacity: opacity,
            }

            return (
              <div
                key={note.id}
                className={`absolute w-full  h-full transition-all duration-300 ease-out origin-bottom ${isActive ? 'hover:-translate-y-2' : ''}`}
                style={style}
              >
                {/* Action buttons on active note */}
                {isActive && (
                  <div className="absolute top-0 right-5 z-20 p-2 flex gap-2">
                    <button
                      onClick={e => {
                        e.stopPropagation()
                        openEditModal(note)
                      }}
                      className="bg-white/80 hover:bg-white text-gray-700 p-1.5 rounded-full shadow-lg transition-transform hover:scale-105 backdrop-blur-sm"
                      title={t('common.edit', 'Edit')}
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      onClick={e => {
                        e.stopPropagation()
                        openNewNoteModal(e)
                      }}
                      className="bg-primary-500 hover:bg-primary-600 text-white p-1.5 rounded-full shadow-lg transition-transform hover:scale-105"
                      title={t('views.widgets.newNote', 'New Note')}
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                )}
                <div className="mx-auto w-full ">
                  <WidgetCard className="h-full w-full pointer-events-none select-none overflow-hidden bg-yellow-100! dark:bg-[#3f2c06]! border-yellow-200! dark:border-yellow-700/50!">
                    <div className="px-6 py-2 h-full flex flex-col pointer-events-none">
                      <p className="text-sm text-gray-800 dark:text-yellow-100 font-medium whitespace-pre-wrap line-clamp-6 leading-relaxed font-handwriting">
                        {note.content}
                      </p>
                      <span className="mt-auto text-[10px] text-gray-500 dark:text-yellow-500/60 pt-2 block">
                        {new Date(note.updated_at || new Date()).toLocaleDateString()}
                      </span>
                    </div>
                  </WidgetCard>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <NoteModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        note={editingNote}
        onSave={handleSave}
        onDelete={handleDelete}
      />
    </>
  )
}

export default NoteWidget
