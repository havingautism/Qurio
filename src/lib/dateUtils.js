/**
 * Formats a date string into a user-friendly timestamp.
 *
 * Rules:
 * - Today: "Today HH:mm" (or localized equivalent)
 * - Yesterday: "Yesterday HH:mm" (or localized equivalent)
 * - Within 7 days: "Weekday HH:mm" (e.g., Monday 14:30)
 * - Older than 7 days: "YYYY-MM-DD HH:mm"
 *
 * @param {string} dateString - The ISO date string to format
 * @param {Function} t - Translation function from i18next
 * @param {string} locale - Locale string (e.g., 'en-US', 'zh-CN'), defaults to navigator.language
 * @returns {string} Formatted date string
 */
export const formatMessageDate = (dateString, t, locale) => {
  if (!dateString) return ''

  const date = new Date(dateString)
  if (isNaN(date.getTime())) return ''

  const now = new Date()
  const currentLocale = locale || (typeof navigator !== 'undefined' ? navigator.language : 'en-US')

  // Reset time part for accurate day comparison
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)

  const checkDate = new Date(date)
  checkDate.setHours(0, 0, 0, 0)

  const diffTime = today.getTime() - checkDate.getTime()
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24))

  // Time formatter
  const timeFormatter = new Intl.DateTimeFormat(currentLocale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const timeStr = timeFormatter.format(date)

  // Today
  if (diffDays === 0) {
    return `${t('sidebar.today', 'Today')} ${timeStr}`
  }

  // Yesterday
  if (diffDays === 1) {
    return `${t('sidebar.yesterday', 'Yesterday')} ${timeStr}`
  }

  // Within 7 days
  if (diffDays > 1 && diffDays < 7) {
    const weekdayFormatter = new Intl.DateTimeFormat(currentLocale, {
      weekday: 'long',
    })
    return `${weekdayFormatter.format(date)} ${timeStr}`
  }

  // Older than 7 days
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day} ${timeStr}`
}
