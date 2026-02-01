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
      className="group relative h-full min-h-[160px] overflow-hidden"
    >
      <div className="relative z-10 flex h-full flex-col justify-between">
        <div>
          <h2 className="mb-1 text-3xl font-light text-gray-800 dark:text-white">{weekDay}</h2>
          <p className="font-mono text-lg text-gray-500 dark:text-gray-400">{dateStr}</p>
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
            {t('views.widgets.week', { number: getWeekNumber(date) })}
          </p>
        </div>
        <div className="mt-auto text-4xl font-medium text-gray-800 dark:text-white">{timeStr}</div>
      </div>
    </WidgetCard>
  )
}

export default DateWidget
