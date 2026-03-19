import { AlertCircle, RefreshCw } from 'lucide-react'

const ConversationErrorState = ({
  title,
  description,
  details,
  onRetry,
  onRefresh,
  retryLabel = 'Retry',
  refreshLabel = 'Refresh Page',
}) => {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="bg-card group w-full max-w-md rounded-2xl border border-red-200/60 p-6 shadow-sm transition-transform duration-300 hover:-translate-y-0.5 dark:border-red-900/60">
        <div className="mb-3 flex items-center gap-2 text-red-500">
          <AlertCircle className="h-5 w-5" />
          <h2 className="text-lg font-semibold">{title}</h2>
        </div>
        <p className="text-muted-foreground text-sm">{description}</p>
        <div className="mt-4 flex gap-2">
          <button
            onClick={onRetry}
            className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm transition-transform duration-200 hover:-translate-y-0.5 active:translate-y-0"
          >
            <RefreshCw className="h-4 w-4 transition-transform duration-300 group-hover:rotate-90" />
            {retryLabel}
          </button>
          <button
            onClick={onRefresh}
            className="border-border bg-background text-foreground hover:bg-accent rounded-lg border px-4 py-2 text-sm transition-colors"
          >
            {refreshLabel}
          </button>
        </div>
        <p className="text-muted-foreground mt-3 text-xs">
          {details ? `Details: ${details}` : 'No additional error details.'}
        </p>
      </div>
    </div>
  )
}

export default ConversationErrorState
