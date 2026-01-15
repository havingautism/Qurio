import clsx from 'clsx'

export const capsulePopoverSurfaceClass =
  'absolute bottom-full left-0 mb-3 bg-white/80 dark:bg-[#1C1C1E]/80 dark:bg-[#1a1a1a] bg-[#F9F9F9] dark:bg-[#1a1a1a] backdrop-blur-xl border border-gray-200/50 dark:border-zinc-700/50 rounded-2xl shadow-2xl z-999 overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 p-3'

const UploadPopover = ({ className = '', children }) => (
  <div className={clsx(capsulePopoverSurfaceClass, className)}>{children}</div>
)

export default UploadPopover
