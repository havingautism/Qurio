import { X } from 'lucide-react'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'

const MobileDrawer = ({ isOpen, onClose, title, icon: Icon, children }) => {
  return (
    <Drawer open={isOpen} onOpenChange={onClose}>
      <DrawerContent className="max-h-[85dvh] sm:max-h-[80vh]">
        {/* Header */}
        <DrawerHeader className="mx-2 border-b border-white/20 px-5 pb-3 dark:border-white/8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {Icon && (
                <div className="glass-elite-chip text-primary-500 flex h-9 w-9 items-center justify-center rounded-xl">
                  <Icon size={18} strokeWidth={2} />
                </div>
              )}
              <DrawerTitle className="m-0 p-0 text-lg leading-none font-bold text-gray-900 dark:text-gray-100">
                {title}
              </DrawerTitle>
            </div>
            <button
              onClick={onClose}
              className="glass-elite-chip -mr-2 rounded-xl p-2 text-gray-400 transition-all duration-200 hover:text-gray-600 active:scale-95 dark:hover:text-gray-200"
            >
              <X size={20} strokeWidth={2} />
            </button>
          </div>
        </DrawerHeader>

        {/* Content */}
        <div className="mt-2 min-h-0 overflow-y-auto px-3 pb-8 sm:px-2">{children}</div>
      </DrawerContent>
    </Drawer>
  )
}

export default MobileDrawer
