import { useEffect, useState } from 'react'
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
    let isMounted = true
    const load = async () => {
      setIsLoading(true)
      const { data } = await fetchHomeNotes()
      if (!isMounted) return
      if (data) {
        setNotes(data)
        if (currentIndex >= data.length) {
          setCurrentIndex(Math.max(0, data.length - 1))
        }
      }
      setIsLoading(false)
    }
    load()
    return () => {
      isMounted = false
    }
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
      <div className="perspective-1000 group relative mb-2 h-[140px] w-full overflow-x-clip sm:mb-0 sm:h-[150px] md:h-[160px]">
        {/* Notes Stack */}
        <div className="relative mx-auto flex h-full w-full items-center justify-center px-4 sm:px-10 md:px-6">
          {/* Navigation Controls - inside stack for proper spacing */}
          {notes.length > 1 && (
            <div className="absolute top-4/5 left-0 z-30 -translate-y-1/2 pl-1 transition-opacity sm:top-1/2 md:pointer-events-none md:opacity-0 md:group-hover:pointer-events-auto md:group-hover:opacity-100">
              <button
                onClick={prevNote}
                disabled={currentIndex === 0}
                className="flex h-14 w-8 items-center justify-center rounded-xl bg-black/20 text-white transition-all hover:bg-black/40 disabled:opacity-0 md:backdrop-blur-sm"
              >
                <ChevronLeft size={24} />
              </button>
            </div>
          )}
          {notes.length > 1 && (
            <div className="absolute top-4/5 right-0 z-30 -translate-y-1/2 pr-1 transition-opacity sm:top-1/2 md:pointer-events-none md:opacity-0 md:group-hover:pointer-events-auto md:group-hover:opacity-100">
              <button
                onClick={nextNote}
                disabled={currentIndex === notes.length - 1}
                className="flex h-14 w-8 items-center justify-center rounded-xl bg-black/20 text-white transition-all hover:bg-black/40 disabled:opacity-0 md:backdrop-blur-sm"
              >
                <ChevronRight size={24} />
              </button>
            </div>
          )}

          {notes.length === 0 && !isLoading && (
            <div
              onClick={openNewNoteModal}
              className="hover:text-primary-500 bg-user-bubble flex h-full w-full cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 text-gray-500 transition-colors md:backdrop-blur-md dark:border-white/10 dark:bg-[#1e1e1e]/60 dark:text-gray-400"
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
                className={`absolute h-full w-full origin-bottom transition-all duration-300 ease-out ${isActive ? 'hover:-translate-y-2' : ''}`}
                style={style}
              >
                {/* Action buttons on active note */}
                {isActive && (
                  <div className="absolute top-0 right-5 z-20 flex gap-2 p-2">
                    <button
                      onClick={e => {
                        e.stopPropagation()
                        openEditModal(note)
                      }}
                      className="rounded-full bg-white/80 p-1.5 text-gray-700 shadow-lg transition-transform hover:scale-105 hover:bg-white md:backdrop-blur-sm"
                      title={t('common.edit', 'Edit')}
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      onClick={e => {
                        e.stopPropagation()
                        openNewNoteModal(e)
                      }}
                      className="bg-primary-500 hover:bg-primary-600 rounded-full p-1.5 text-white shadow-lg transition-transform hover:scale-105"
                      title={t('views.widgets.newNote', 'New Note')}
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                )}
                <div className="mx-auto w-full">
                  <WidgetCard className="bg-primary-50/40! dark:bg-primary-950/20! border-primary-200/50! dark:border-primary-500/20! pointer-events-none h-full w-full overflow-hidden backdrop-blur-xl! select-none">
                    <div
                      className={`pointer-events-none flex h-full flex-col px-6 py-2 transition-all duration-200 ${isActive ? 'visible opacity-100' : 'invisible opacity-0'}`}
                    >
                      <p className="font-handwriting line-clamp-6 text-sm leading-relaxed font-medium whitespace-pre-wrap text-gray-800 dark:text-gray-200">
                        {note.content}
                      </p>
                      <span className="dark:text-primary-500/50 mt-auto block pt-2 text-[10px] text-gray-500">
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
