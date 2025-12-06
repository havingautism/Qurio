const QuestionNavigator = ({ items = [], onJump, activeId }) => {
  if (!items.length) return null

  return (
    <div className="hidden xl:block w-64 sticky top-24 self-start mt-8 pl-6 shrink-0">
      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-4 uppercase tracking-wider px-2">
        Jump to question
      </div>
      <div className="relative border-l-2 border-gray-200 dark:border-zinc-800 ml-4 space-y-6 py-2">
        {items.map(item => {
          const isActive = activeId === item.id
          return (
            <div key={item.id} className="relative pl-6">
              {/* Timeline dot */}
              <div
                className={`absolute -left-[6px] top-1.5 h-2.5 w-2.5 rounded-full  transition-all duration-300 ${
                  isActive
                    ? 'bg-cyan-500 scale-110'
                    : 'bg-gray-300 dark:bg-zinc-600 hover:bg-cyan-400 dark:hover:bg-cyan-400'
                }`}
              />

              <button
                onClick={() => onJump && onJump(item.id)}
                className={`text-left text-sm transition-colors duration-200 line-clamp-2 leading-relaxed ${
                  isActive
                    ? 'text-cyan-600 dark:text-cyan-400 font-medium'
                    : 'text-gray-600 dark:text-gray-400 hover:text-cyan-600 dark:hover:text-cyan-400'
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
