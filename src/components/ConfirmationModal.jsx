import useScrollLock from '../hooks/useScrollLock'

const ConfirmationModal = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isDangerous = false,
}) => {
  useScrollLock(isOpen)
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" style={{ zIndex: 9999 }}>
      <div className="bg-[#1e1e1e] border border-white/10 rounded-xl shadow-2xl w-full max-w-md p-6 transform transition-all scale-100 opacity-100 mx-auto sm:mx-0">
        <h3 className="text-xl font-semibold text-white mb-2">{title}</h3>
        <p className="text-gray-400 mb-6">{message}</p>

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-gray-300 hover:bg-white/5 transition-colors text-sm font-medium"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 rounded-lg text-white text-sm font-medium transition-colors ${
              isDangerous ? 'bg-red-500/80 hover:bg-red-500' : 'bg-blue-500 hover:bg-blue-600'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ConfirmationModal
