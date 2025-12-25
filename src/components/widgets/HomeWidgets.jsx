import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Cloud,
  Sun,
  MoreHorizontal,
  Github,
  Youtube,
  Bot,
  Code,
  BookOpen,
  Terminal,
  Wind,
  Droplets,
  Thermometer,
} from 'lucide-react'

const WidgetCard = ({ children, className = '', title, action }) => (
  <div
    className={`bg-user-bubble dark:bg-[#1e1e1e]/60 backdrop-blur-md border border-gray-200 dark:border-white/5 rounded-2xl p-5 flex flex-col shadow-sm ${className}`}
  >
    {(title || action) && (
      <div className="flex justify-between items-center mb-3">
        {title && <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</h3>}
        {action && (
          <button className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
            {action}
          </button>
        )}
      </div>
    )}
    {children}
  </div>
)

const NoteWidget = () => {
  const { t } = useTranslation()
  const [note, setNote] = useState('')

  return (
    <WidgetCard title={t('views.widgets.noteTitle')} action={<MoreHorizontal size={16} />} className="h-full min-h-[160px]">
      <textarea
        value={note}
        onChange={e => setNote(e.target.value)}
        placeholder={t('views.widgets.notePlaceholder')}
        className="w-full h-full bg-transparent resize-none outline-none text-gray-700 dark:text-gray-200 placeholder-gray-400 text-sm font-medium"
      />
    </WidgetCard>
  )
}

const ShortcutItem = ({ icon: Icon, color }) => (
  <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 transition-colors cursor-pointer group">
    <Icon
      size={24}
      className={`group-hover:scale-110 transition-transform duration-200 ${color}`}
    />
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
        <ShortcutItem icon={Bot} color="text-sky-500" />
        <ShortcutItem icon={Github} color="text-gray-700 dark:text-white" />
        <ShortcutItem icon={Youtube} color="text-red-500" />
        <ShortcutItem icon={Code} color="text-purple-500" />
        <ShortcutItem icon={Bot} color="text-primary-500" />
        <ShortcutItem icon={BookOpen} color="text-primary-500" />
        <ShortcutItem icon={MoreHorizontal} color="text-gray-400" />
      </div>
    </WidgetCard>
  )
}

const TipsWidget = () => {
  const { t } = useTranslation()

  return (
    <WidgetCard
      title={t('views.widgets.tipsTitle')}
      action={<MoreHorizontal size={16} />}
      className="h-full min-h-[160px]"
    >
      <div className="flex flex-col justify-center h-full gap-2">
        <p className="text-lg font-medium text-gray-800 dark:text-gray-200">
          {t('views.widgets.tipsContent')}
        </p>
      </div>
    </WidgetCard>
  )
}

const DateWidget = () => {
  const { t, i18n } = useTranslation()
  const [date, setDate] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setDate(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  // Dynamic weekday names - recalculate on every render to ensure language changes take effect
  const weekDays = [
    t('views.widgets.sunday'),
    t('views.widgets.monday'),
    t('views.widgets.tuesday'),
    t('views.widgets.wednesday'),
    t('views.widgets.thursday'),
    t('views.widgets.friday'),
    t('views.widgets.saturday'),
  ]
  const weekDay = weekDays[date.getDay()]
  const dateStr = `${date.getFullYear()} ${date.getMonth() + 1}/${date.getDate()}`
  const timeStr = date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  // Calculating week number
  const getWeekNumber = d => {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
    return Math.ceil(((d - yearStart) / 86400000 + 1) / 7)
  }

  return (
    <WidgetCard
      title={t('views.widgets.dateTitle')}
      action={<MoreHorizontal size={16} />}
      className="h-full min-h-[160px] relative overflow-hidden group"
    >
      {/* Background decorative blob */}
      <div className="absolute -right-8 -bottom-8 w-32 h-32 bg-blue-500/20 rounded-full blur-2xl group-hover:bg-blue-500/30 transition-all duration-500" />

      <div className="flex flex-col h-full justify-between relative z-10">
        <div>
          <h2 className="text-3xl font-light text-gray-800 dark:text-white mb-1">{weekDay}</h2>
          <p className="text-lg text-gray-500 dark:text-gray-400 font-mono">
            {dateStr}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            {t('views.widgets.week', { number: getWeekNumber(date) })}
          </p>
        </div>
        <div className="text-4xl font-medium text-gray-800 dark:text-white mt-auto">{timeStr}</div>
      </div>
    </WidgetCard>
  )
}

const WeatherWidget = () => {
  const { t, i18n } = useTranslation()

  // Mock data
  const currentTemp = 7
  const location = t('views.widgets.shanghai')

  // Generate dynamic date string based on language
  const now = new Date()
  const monthNames = {
    'en-US': ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    'zh-CN': ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'],
  }
  const weekDays = {
    'en-US': ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    'zh-CN': ['周日', '周一', '周二', '周三', '周四', '周五', '周六'],
  }
  const locale = i18n.language === 'zh-CN' ? 'zh-CN' : 'en-US'
  const dateStr = `${monthNames[locale][now.getMonth()]} ${now.getDate()} ${weekDays[locale][now.getDay()]}`

  // Use short weekday names directly without slicing
  const shortWeekDays = {
    'en-US': ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    'zh-CN': ['周一', '周二', '周三', '周四', '周五'],
  }

  // Use useMemo to recalculate forecast when language changes
  const forecast = useMemo(() => [
    { day: t('views.widgets.today'), icon: Sun, high: 17, low: 6 },
    { day: t('views.widgets.tomorrow'), icon: Sun, high: 20, low: 8 },
    { day: shortWeekDays[locale][0], icon: Sun, high: 15, low: 9 },
    { day: shortWeekDays[locale][1], icon: Cloud, high: 14, low: 8 },
    { day: shortWeekDays[locale][2], icon: Cloud, high: 20, low: 10 },
  ], [t, i18n.language])

  return (
    <WidgetCard
      title={t('views.widgets.weatherTitle')}
      action={<MoreHorizontal size={16} />}
      className="h-full min-h-[340px]"
    >
      <div className="flex flex-col h-full">
        {/* Header Section */}
        <div className="flex flex-col mb-6">
          <h2 className="text-2xl font-medium text-gray-800 dark:text-white">{location}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{dateStr}</p>

          <div className="flex items-center gap-4">
            <Bot size={48} className="text-yellow-500" /> {/* Should be moon or sun icon */}
            <span className="text-5xl font-light text-gray-800 dark:text-white">
              {currentTemp}°C
            </span>
          </div>

          <div className="grid grid-cols-2 gap-y-1 gap-x-4 mt-4 text-xs text-gray-500 dark:text-gray-400">
            <div className="flex items-center gap-1">
              <Thermometer size={12} /> {t('views.widgets.feelsLike')} 8°C
            </div>
            <div className="flex items-center gap-1">
              <Droplets size={12} /> {t('views.widgets.precip')} 0.0mm
            </div>
            <div className="flex items-center gap-1">
              <Wind size={12} /> {t('views.widgets.wind')} 1.2 m/s
            </div>
          </div>
        </div>

        {/* Forecast List */}
        <div className="mt-auto space-y-3">
          {forecast.map((item, idx) => (
            <div key={idx} className="flex items-center justify-between text-sm">
              <span className="w-10 text-gray-500 dark:text-gray-400">{item.day}</span>
              <item.icon size={16} className="text-yellow-500" />
              <div className="flex gap-2 text-gray-800 dark:text-gray-200 font-mono">
                <span className="opacity-60">{item.low}°</span>
                <span>/</span>
                <span>{item.high}°</span>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 text-[10px] text-gray-400 dark:text-gray-600 flex justify-between">
          <span>{t('views.widgets.source')}: MET.no</span>
          <span>{t('views.widgets.updated')}: 01:16</span>
        </div>
      </div>
    </WidgetCard>
  )
}

const HomeWidgets = () => {
  return (
    <div className="w-full max-w-5xl mt-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Column 1 */}
        <div className="flex flex-col gap-4">
          <NoteWidget />
          <TipsWidget />
        </div>

        {/* Column 2 */}
        <div className="flex flex-col gap-4">
          <ShortcutsWidget />
          <DateWidget />
        </div>

        {/* Column 3 */}
        <div className="flex flex-col h-full">
          <WeatherWidget />
        </div>
      </div>
    </div>
  )
}

export default HomeWidgets
