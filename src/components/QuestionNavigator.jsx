const QuestionNavigator = ({ items = [], onJump, activeId }) => {
  if (!items.length) return null

  return (
    <div className="sticky top-24 mt-8 hidden w-64 shrink-0 self-start pl-6 xl:block">
      <div className="mb-4 px-2 text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
        Jump to question
      </div>
      <div className="relative ml-4 space-y-6 border-l-2 border-gray-200 py-2 dark:border-zinc-800">
        {items.map(item => {
          const isActive = activeId === item.id
          return (
            <div key={item.id} className="relative pl-6">
              {/* Timeline dot */}
              <div
                className={`absolute top-1.5 -left-[6px] h-2.5 w-2.5 rounded-full transition-all duration-300 ${
                  isActive ? 'bg-primary-500 scale-110' : 'bg-gray-300 dark:bg-zinc-600'
                }`}
              />

              <button
                onClick={() => onJump && onJump(item.id)}
                className={`line-clamp-2 text-left text-sm leading-relaxed transition-colors duration-200 ${
                  isActive
                    ? 'text-primary-500 font-medium'
                    : 'hover:text-primary-600 dark:hover:text-primary-400 text-gray-600 dark:text-gray-400'
                }`}
              >
                {item.label}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default QuestionNavigator
