import clsx from 'clsx'
import Check from 'lucide-react/dist/esm/icons/check'
import { useTranslation } from 'react-i18next'

const DocumentsList = ({
  documents = [],
  documentsLoading = false,
  selectedDocumentIdSet = new Set(),
  onToggleDocument,
  loadingLabel,
  emptyLabel,
  t,
}) => {
  if (documentsLoading) {
    return (
      <div className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
        {loadingLabel || t('chatInterface.documentsLoading')}
      </div>
    )
  }

  if (documents.length === 0) {
    return (
      <div className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
        {emptyLabel || t('chatInterface.documentsEmpty')}
      </div>
    )
  }

  return documents.map(doc => {
    const isSelected = selectedDocumentIdSet.has(String(doc.id))
    return (
      <button
        key={doc.id}
        type="button"
        onClick={() => onToggleDocument?.(doc.id)}
        className={clsx(
          'flex w-full items-start gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition-colors',
          isSelected
            ? 'bg-gray-100 font-medium text-gray-900 dark:bg-zinc-700/50 dark:text-white'
            : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-zinc-700/50',
        )}
        aria-pressed={isSelected}
      >
        <span
          className={clsx(
            'mt-0.5 flex h-4 w-4 items-center justify-center rounded border transition-colors',
            isSelected
              ? 'bg-primary-500 border-primary-500 text-white'
              : 'border-gray-300 text-transparent dark:border-zinc-600',
          )}
        >
          <Check size={12} />
        </span>
        <div className="flex w-full min-w-0 items-center justify-between gap-2">
          <span className="truncate">{doc.name}</span>
          <span className="shrink-0 text-[10px] font-normal text-gray-400">
            {(() => {
              const type = (doc.file_type || '').toUpperCase()
              return type === 'MD' ? 'MARKDOWN' : type
            })()}
          </span>
        </div>
      </button>
    )
  })
}

const DocumentsSection = ({
  documents = [],
  documentsLoading = false,
  selectedDocumentCount = 0,
  selectedDocumentIdSet = new Set(),
  onToggleDocument,
  t,
  label,
  loadingLabel,
  emptyLabel,
}) => {
  const { t: defaultT } = useTranslation()
  const translate = t || defaultT
  return (
    <div className="space-y-2">
      <div className="px-2 text-[10px] font-bold tracking-widest text-gray-400 uppercase">
        {(label || translate('chatInterface.documents')) + ` (${selectedDocumentCount})`}
      </div>
      <div className="no-scrollbar flex max-h-[250px] flex-col gap-0.5 overflow-y-auto">
        <DocumentsList
          documents={documents}
          documentsLoading={documentsLoading}
          selectedDocumentIdSet={selectedDocumentIdSet}
          onToggleDocument={onToggleDocument}
          loadingLabel={loadingLabel}
          emptyLabel={emptyLabel}
          t={translate}
        />
      </div>
    </div>
  )
}

export default DocumentsSection
