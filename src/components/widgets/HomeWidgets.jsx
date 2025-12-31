import NoteWidget from './home/NoteWidget'
import TipsWidget from './home/TipsWidget'
import ShortcutsWidget from './home/ShortcutsWidget'
import DateWidget from './home/DateWidget'

const HomeWidgets = () => {
  return (
    <div className="w-full max-w-5xl">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Column 1 */}
        <div className="flex flex-col gap-7 sm:gap-4">
          <NoteWidget />
          <TipsWidget />
        </div>

        {/* Column 2 */}
        <div className="flex flex-col gap-4">
          <ShortcutsWidget />
          <DateWidget />
        </div>
      </div>
    </div>
  )
}

export default HomeWidgets
