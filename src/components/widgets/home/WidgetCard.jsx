const WidgetCard = ({ children, className = '', title, action }) => (
  <div
    className={`bg-user-bubble dark:bg-[#1e1e1e]/60 backdrop-blur-md border border-gray-200 dark:border-zinc-700 rounded-2xl p-5 flex flex-col shadow-sm ${className}`}
  >
    {(title || action) && (
      <div className="flex justify-between items-center mb-3">
        {title && <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</h3>}
        {action && (
          <div className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
            {action}
          </div>
        )}
      </div>
    )}
    {children}
  </div>
)

export default WidgetCard
