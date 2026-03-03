import { useEffect } from 'react'
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react'
import clsx from 'clsx'

const Toast = ({ message, type = 'info', onClose, duration = 3000 }) => {
  useEffect(() => {
    if (duration) {
      const timer = setTimeout(() => {
        onClose()
      }, duration)
      return () => clearTimeout(timer)
    }
  }, [duration, onClose])

  const icons = {
    success: <CheckCircle size={20} className="text-emerald-500" />,
    error: <AlertCircle size={20} className="text-red-500" />,
    info: <Info size={20} className="text-primary-500" />,
  }

  const styles = {
    success: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-900 dark:text-emerald-100',
    error: 'bg-red-500/10 border-red-500/20 text-red-900 dark:text-red-100',
    info: 'bg-primary-500/10 border-primary-500/20 text-primary-900 dark:text-primary-100',
  }

  return (
    <div
      className={clsx(
        'animate-in slide-in-from-bottom-8 fade-in flex max-w-md min-w-[320px] items-center gap-3 rounded-2xl border px-4 py-3.5 shadow-2xl backdrop-blur-xl transition-all duration-500',
        styles[type] || styles.info,
        'bg-white/70 dark:bg-zinc-900/70',
      )}
    >
      <div className="shrink-0">{icons[type] || icons.info}</div>
      <p className="flex-1 text-sm leading-relaxed font-semibold">{message}</p>
      <button
        onClick={onClose}
        className="rounded-full p-1 text-gray-400 transition-colors hover:bg-black/5 dark:text-gray-500 dark:hover:bg-white/10"
      >
        <X size={16} />
      </button>
    </div>
  )
}

export default Toast
