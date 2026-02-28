import clsx from 'clsx'

export const capsulePopoverSurfaceClass =
  'glass-elite-dropdown absolute left-0 z-50 mt-2 min-w-60 rounded-xl p-3'
const UploadPopover = ({ className = '', children }) => (
  <div className={clsx(capsulePopoverSurfaceClass, className)}>{children}</div>
)

export default UploadPopover
