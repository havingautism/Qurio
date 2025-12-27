import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MoreHorizontal } from 'lucide-react'
import WidgetCard from './WidgetCard'
// Temporarily disable memo persistence to Supabase.
// import { fetchHomeNote, upsertHomeNote } from '../../../lib/homeWidgetsService'

const SAVE_IDLE = 'idle'
const SAVE_SAVING = 'saving'
const SAVE_SAVED = 'saved'
const SAVE_ERROR = 'error'

const NoteWidget = () => {
  const { t } = useTranslation()
  const [note, setNote] = useState('')
  // const [noteId, setNoteId] = useState(null)
  // const [saveState, setSaveState] = useState(SAVE_IDLE)
  // const saveTimerRef = useRef(null)
  // const loadedRef = useRef(false)
  // const saveStatusTimerRef = useRef(null)

  // Persistence is disabled for now.

  return (
    <WidgetCard
      title={t('views.widgets.noteTitle')}
      action={<MoreHorizontal size={16} />}
      className="h-full min-h-[160px]"
    >
      <div className="flex flex-col h-full">
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder={t('views.widgets.notePlaceholder')}
          className="w-full h-full bg-transparent resize-none outline-none text-gray-700 dark:text-gray-200 placeholder-gray-400 text-sm font-medium"
        />
        {/* Save status hidden while persistence is disabled */}
      </div>
    </WidgetCard>
  )
}

export default NoteWidget
