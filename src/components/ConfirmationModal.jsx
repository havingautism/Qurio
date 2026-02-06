import { useTranslation } from 'react-i18next'
import useScrollLock from '../hooks/useScrollLock'
import clsx from 'clsx'

const ConfirmationModal = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText,
  cancelText,
  isDangerous = false,
}) => {
  const { t } = useTranslation()
  useScrollLock(isOpen)
  if (!isOpen) return null

  return (
    <div
      className="animate-in fade-in fixed inset-0 flex items-center justify-center bg-black/60 p-4 duration-200 md:backdrop-blur-sm"
      style={{ zIndex: 9999 }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="animate-in zoom-in-95 mx-auto w-full max-w-md scale-100 transform rounded-2xl border border-gray-200 bg-white p-6 opacity-100 shadow-2xl transition-all duration-200 sm:mx-0 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <h3 className="mb-3 text-xl font-bold text-gray-900 dark:text-gray-100">{title}</h3>
        <p className="mb-8 leading-relaxed text-gray-600 dark:text-gray-400">{message}</p>

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-xl px-5 py-2.5 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-zinc-800"
          >
            {t('confirmation.cancel')}
          </button>
          <button
            onClick={onConfirm}
            className={clsx(
              'rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:shadow-md active:scale-95',
              isDangerous
                ? 'bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700'
                : 'bg-primary-500 hover:bg-primary-600 text-white',
            )}
          >
            {t('confirmation.confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ConfirmationModal
