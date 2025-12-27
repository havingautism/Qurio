import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import WidgetCard from './WidgetCard'

const DateWidget = () => {
  const { t } = useTranslation()
  const [date, setDate] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setDate(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

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

  const getWeekNumber = d => {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
    return Math.ceil(((d - yearStart) / 86400000 + 1) / 7)
  }

  return (
    <WidgetCard
      title={t('views.widgets.dateTitle')}
      action={null}
      className="h-full min-h-[160px] relative overflow-hidden group"
    >
      <div className="absolute -right-8 -bottom-8 w-32 h-32 bg-blue-500/20 rounded-full blur-2xl group-hover:bg-blue-500/30 transition-all duration-500" />

      <div className="flex flex-col h-full justify-between relative z-10">
        <div>
          <h2 className="text-3xl font-light text-gray-800 dark:text-white mb-1">{weekDay}</h2>
          <p className="text-lg text-gray-500 dark:text-gray-400 font-mono">{dateStr}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            {t('views.widgets.week', { number: getWeekNumber(date) })}
          </p>
        </div>
        <div className="text-4xl font-medium text-gray-800 dark:text-white mt-auto">
          {timeStr}
        </div>
      </div>
    </WidgetCard>
  )
}

export default DateWidget
