import clsx from 'clsx'

export const capsulePopoverSurfaceClass =
  'absolute left-0 mt-2 p-3 min-w-60 bg-white dark:bg-[#202222] border border-gray-200 dark:border-zinc-700 rounded-xl shadow-xl z-50'
const UploadPopover = ({ className = '', children }) => (
  <div className={clsx(capsulePopoverSurfaceClass, className)}>{children}</div>
)

export default UploadPopover
