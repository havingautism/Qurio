import { useTranslation } from 'react-i18next'
import { MoreHorizontal, Github, Youtube, Smile, Code, BookOpen, Terminal } from 'lucide-react'
import WidgetCard from './WidgetCard'

const ShortcutItem = ({ icon: Icon, color }) => (
  <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 transition-colors cursor-pointer group">
    <Icon size={24} className={`group-hover:scale-110 transition-transform duration-200 ${color}`} />
  </div>
)

const ShortcutsWidget = () => {
  const { t } = useTranslation()

  return (
    <WidgetCard
      title={t('views.widgets.shortcutsTitle')}
      action={<MoreHorizontal size={16} />}
      className="h-full min-h-[160px]"
    >
      <div className="grid grid-cols-4 gap-4 place-items-center h-full">
        <ShortcutItem icon={Terminal} color="text-emerald-500" />
        <ShortcutItem icon={Smile} color="text-sky-500" />
        <ShortcutItem icon={Github} color="text-gray-700 dark:text-white" />
        <ShortcutItem icon={Youtube} color="text-red-500" />
        <ShortcutItem icon={Code} color="text-purple-500" />
        <ShortcutItem icon={Smile} color="text-primary-500" />
        <ShortcutItem icon={BookOpen} color="text-primary-500" />
        <ShortcutItem icon={MoreHorizontal} color="text-gray-400" />
      </div>
    </WidgetCard>
  )
}

export default ShortcutsWidget
