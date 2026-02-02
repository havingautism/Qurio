const WidgetCard = ({ children, className = '', title, action }) => (
  <div
    className={`flex flex-col rounded-2xl border border-gray-200 bg-white/60 p-5 shadow-sm dark:border-zinc-700 dark:bg-[#1e1e1e]/60 ${className}`}
  >
    {(title || action) && (
      <div className="mb-3 flex items-center justify-between">
        {title && <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</h3>}
        {action && (
          <div className="text-gray-400 transition-colors hover:text-gray-600 dark:hover:text-gray-200">
            {action}
          </div>
        )}
      </div>
    )}
    {children}
  </div>
)

export default WidgetCard
