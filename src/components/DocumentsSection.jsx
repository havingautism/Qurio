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
          'flex items-start gap-2.5 w-full px-3 py-2 rounded-xl text-sm transition-colors text-left',
          isSelected
            ? 'bg-gray-100 dark:bg-zinc-700/50 text-gray-900 dark:text-white font-medium'
            : 'hover:bg-gray-100 dark:hover:bg-zinc-700/50 text-gray-600 dark:text-gray-300',
        )}
        aria-pressed={isSelected}
      >
        <span
          className={clsx(
            'mt-0.5 flex items-center justify-center w-4 h-4 rounded border transition-colors',
            isSelected
              ? 'bg-primary-500 border-primary-500 text-white'
              : 'border-gray-300 dark:border-zinc-600 text-transparent',
          )}
        >
          <Check size={12} />
        </span>
        <div className="flex items-center justify-between w-full min-w-0 gap-2">
          <span className="truncate">{doc.name}</span>
          <span className="text-[10px] text-gray-400 font-normal shrink-0">
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
      <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-2">
        {(label || translate('chatInterface.documents')) + ` (${selectedDocumentCount})`}
      </div>
      <div className="flex flex-col gap-0.5 max-h-[250px] overflow-y-auto no-scrollbar">
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
