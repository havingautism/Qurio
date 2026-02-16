import React from 'react'

const ExpertTaskCard = ({ task = '' }) => {
  const text = String(task || '').trim()
  if (!text) return null

  return (
    <div className="border-primary-200/50 bg-primary-50/26 dark:border-primary-700/30 dark:bg-primary-900/12 mx-5 mb-4 rounded-xl border px-3.5 py-2.5 text-sm leading-relaxed text-gray-700 sm:mx-0 dark:text-gray-200">
      <div className="flex items-start gap-2.5">
        <span className="bg-primary-500 mt-2 h-1.5 w-1.5 shrink-0 rounded-full" />
        <span>{text}</span>
      </div>
    </div>
  )
}

export default React.memo(ExpertTaskCard)
