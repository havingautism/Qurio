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
    success: <CheckCircle size={20} className="text-green-500" />,
    error: <AlertCircle size={20} className="text-red-500" />,
    info: <Info size={20} className="text-blue-500" />,
  }

  const bgColors = {
    success: 'bg-[#1e1e1e] border-green-500/20',
    error: 'bg-[#1e1e1e] border-red-500/20',
    info: 'bg-[#1e1e1e] border-blue-500/20',
  }

  return (
    <div
      className={clsx(
        'animate-in slide-in-from-bottom-5 fade-in flex min-w-[300px] items-center gap-3 rounded-lg border px-4 py-3 shadow-lg duration-300',
        bgColors[type] || bgColors.info,
      )}
    >
      {icons[type] || icons.info}
      <p className="flex-1 text-sm font-medium text-gray-200">{message}</p>
      <button onClick={onClose} className="text-gray-500 transition-colors hover:text-gray-300">
        <X size={16} />
      </button>
    </div>
  )
}

export default Toast
