import { useTranslation } from 'react-i18next'
import useScrollLock from '../hooks/useScrollLock'
import clsx from 'clsx'
import { AlertTriangle, Info, X } from 'lucide-react'

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
      className="animate-in fade-in fixed inset-0 flex items-center justify-center bg-black/60 p-4 backdrop-blur-md duration-200"
      style={{ zIndex: 9999 }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="animate-in zoom-in-95 relative mx-auto w-full max-w-md scale-100 transform overflow-hidden rounded-[2rem] border border-white/20 bg-white/80 p-8 shadow-2xl backdrop-blur-2xl transition-all duration-200 dark:border-zinc-800/50 dark:bg-zinc-900/80"
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-6 right-6 rounded-full p-2 text-gray-400 transition-colors hover:bg-gray-100 dark:text-zinc-500 dark:hover:bg-zinc-800"
        >
          <X size={20} />
        </button>

        <div className="flex flex-col items-center text-center">
          {/* Icon Area */}
          <div
            className={clsx(
              'mb-6 flex h-16 w-16 items-center justify-center rounded-2xl shadow-sm',
              isDangerous
                ? 'bg-red-50 text-red-500 dark:bg-red-500/10 dark:text-red-400'
                : 'bg-primary-50 text-primary-500 dark:bg-primary-500/10 dark:text-primary-400',
            )}
          >
            {isDangerous ? <AlertTriangle size={32} /> : <Info size={32} />}
          </div>

          <h3 className="mb-3 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            {title}
          </h3>
          <p className="mb-10 text-base leading-relaxed text-gray-500 dark:text-zinc-400">
            {message}
          </p>

          <div className="flex w-full flex-col gap-3 sm:flex-row">
            <button
              onClick={onClose}
              className="flex flex-1 items-center justify-center rounded-2xl border border-slate-300 bg-white px-6 py-4 text-sm font-bold text-gray-600 transition-all hover:bg-gray-50 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            >
              {cancelText || t('confirmation.cancel')}
            </button>
            <button
              onClick={onConfirm}
              className={clsx(
                'flex flex-1 items-center justify-center rounded-2xl px-6 py-4 text-sm font-bold text-white shadow-lg transition-all hover:scale-[1.02] active:scale-[0.98]',
                isDangerous
                  ? 'bg-red-500 shadow-red-500/20 hover:bg-red-600'
                  : 'bg-primary-600 shadow-primary-500/20 hover:bg-primary-700',
              )}
            >
              {confirmText || t('confirmation.confirm')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ConfirmationModal
