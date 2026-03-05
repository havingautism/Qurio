const WidgetCard = ({ children, className = '', title, action }) => (
  <div
    className={`glass-elite-panel flex flex-col rounded-[32px] border-none p-5 shadow-[0_8px_24px_rgba(15,23,42,0.07)] backdrop-blur-xl ${className}`}
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
