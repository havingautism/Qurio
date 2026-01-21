import { X } from 'lucide-react'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'

const MobileDrawer = ({ isOpen, onClose, title, icon: Icon, children }) => {
  return (
    <Drawer open={isOpen} onOpenChange={onClose}>
      <DrawerContent className="max-h-[85dvh] sm:max-h-[80vh]">
        {/* Header */}
        <DrawerHeader className="px-5 pb-3 border-b border-gray-100 dark:border-zinc-800/50 mx-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {Icon && (
                <div className="flex items-center justify-center w-9 h-9 bg-primary-500/10 dark:bg-primary-500/20 rounded-xl text-primary-500">
                  <Icon size={18} strokeWidth={2} />
                </div>
              )}
              <DrawerTitle className="text-lg font-bold text-gray-900 dark:text-gray-100 leading-none m-0 p-0">
                {title}
              </DrawerTitle>
            </div>
            <button
              onClick={onClose}
              className="p-2 -mr-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-xl transition-all duration-200 active:scale-95"
            >
              <X size={20} strokeWidth={2} />
            </button>
          </div>
        </DrawerHeader>

        {/* Content */}
        <div className="overflow-y-auto min-h-0 px-3 pb-8 sm:px-2 mt-2">{children}</div>
      </DrawerContent>
    </Drawer>
  )
}

export default MobileDrawer
