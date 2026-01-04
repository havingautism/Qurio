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
      className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      style={{ zIndex: 9999 }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl shadow-2xl w-full max-w-md p-6 transform transition-all scale-100 opacity-100 mx-auto sm:mx-0 animate-in zoom-in-95 duration-200"
      >
        <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-3">{title}</h3>
        <p className="text-gray-600 dark:text-gray-400 mb-8 leading-relaxed">{message}</p>

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors text-sm font-semibold"
          >
            {cancelText || t('confirmation.cancel')}
          </button>
          <button
            onClick={onConfirm}
            className={clsx(
              'px-5 py-2.5 rounded-xl text-white text-sm font-semibold transition-all shadow-sm hover:shadow-md active:scale-95',
              isDangerous
                ? 'bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700'
                : 'bg-primary-500 hover:bg-primary-600 text-white',
            )}
          >
            {confirmText || t('confirmation.confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ConfirmationModal
