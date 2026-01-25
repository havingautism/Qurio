import { Popover, PopoverButton, PopoverPanel, Transition } from '@headlessui/react'
import clsx from 'clsx'
import { Check, ChevronUp } from 'lucide-react'
import React, { Fragment, useRef, useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import duckduckgoIcon from '../assets/search-icons/duckduckgo.svg'
import tavilyIcon from '../assets/search-icons/tavily-color.svg'
import wikipediaIcon from '../assets/search-icons/Wikipedia.svg'
import MobileDrawer from './MobileDrawer'
import { loadSettings } from '../lib/settings'

const SEARCH_SOURCES = [
  {
    id: 'duckduckgo',
    name: 'DuckDuckGo',
    icon: duckduckgoIcon,
    description: 'Privacy-focused search',
  },
  {
    id: 'wikipedia',
    name: 'Wikipedia',
    icon: wikipediaIcon,
    description: 'Encyclopedia articles',
  },
  {
    id: 'tavily',
    name: 'Tavily',
    icon: tavilyIcon,
    description: 'Smart web search',
  },
]

const SearchSourceSelector = ({ selectedSource, onSelect, isMobile, disabled }) => {
  // const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const [hasTavilyKey, setHasTavilyKey] = useState(false)
  const buttonRef = useRef(null)

  useEffect(() => {
    // Check for Tavily key on mount and when window gains focus (in case user updated settings)
    const checkSettings = () => {
      const settings = loadSettings()
      setHasTavilyKey(!!settings.tavilyApiKey)
    }

    checkSettings()
    window.addEventListener('focus', checkSettings)
    window.addEventListener('settings-changed', checkSettings)
    return () => {
      window.removeEventListener('focus', checkSettings)
      window.removeEventListener('settings-changed', checkSettings)
    }
  }, [])

  const sortedSources = React.useMemo(() => {
    // Clone to avoid mutating the original constant during sorts if it were mutable
    const sources = [...SEARCH_SOURCES]
    return sources.sort((a, b) => {
      const isTavilyA = a.id === 'tavily'
      const isTavilyB = b.id === 'tavily'

      if (hasTavilyKey) {
        // If key exists, Tavily goes first
        if (isTavilyA) return -1
        if (isTavilyB) return 1
      } else {
        // If no key, Tavily goes last
        if (isTavilyA) return 1
        if (isTavilyB) return -1
      }
      return 0 // Keep original order for others
    })
  }, [hasTavilyKey])

  const selected = SEARCH_SOURCES.find(s => s.id === selectedSource) || sortedSources[0]

  const handleSelect = id => {
    onSelect(id)
    setIsOpen(false)
  }

  const renderContent = () => (
    <div className="flex flex-col gap-1 p-3 focus:outline-none">
      <div className="px-2 mb-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
        Search Source
      </div>
      {sortedSources.map(source => {
        const isTavily = source.id === 'tavily'
        const isDisabled = isTavily && !hasTavilyKey

        return (
          <button
            key={source.id}
            onClick={() => !isDisabled && handleSelect(source.id)}
            disabled={isDisabled}
            className={clsx(
              'flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left group',
              selectedSource === source.id
                ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-900 dark:text-primary-100'
                : isDisabled
                  ? 'text-gray-400 dark:text-gray-600'
                  : 'hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-700 dark:text-gray-200',
              isDisabled &&
                'opacity-50 cursor-not-allowed hover:bg-transparent dark:hover:bg-transparent',
            )}
            title={isDisabled ? 'API Key required in Settings' : ''}
          >
            <div className="w-8 h-8 rounded-full bg-white dark:bg-zinc-700 shadow-sm flex items-center justify-center border border-gray-100 dark:border-zinc-600 shrink-0">
              <img
                src={source.icon}
                alt={source.name}
                className={clsx('w-5 h-5 object-contain', isDisabled && 'grayscale')}
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm truncate">{source.name}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 truncate opacity-80 group-hover:opacity-100">
                {isDisabled ? 'API Key Missing' : source.description}
              </div>
            </div>
            {selectedSource === source.id && (
              <Check size={16} className="text-primary-600 dark:text-primary-400 shrink-0" />
            )}
          </button>
        )
      })}
    </div>
  )

  if (isMobile) {
    return (
      <>
        <button
          onClick={() => !disabled && setIsOpen(true)}
          disabled={disabled}
          className="flex items-center gap-1.5 p-2 rounded-full text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-zinc-800 border border-transparent hover:border-gray-300 dark:hover:border-zinc-700 transition-all disabled:opacity-50"
        >
          <img src={selected.icon} alt="" className="w-3.5 h-3.5 object-contain opacity-75" />
          {/* <span className="truncate max-w-[80px]">{selected.name}</span> */}
          <ChevronUp size={12} className="opacity-50" />
        </button>

        <MobileDrawer isOpen={isOpen} onClose={() => setIsOpen(false)} title="Search Source">
          {renderContent()}
        </MobileDrawer>
      </>
    )
  }

  return (
    <Popover className="relative">
      {({ open }) => (
        <>
          <PopoverButton
            disabled={disabled}
            ref={buttonRef}
            className={clsx(
              'flex items-center gap-1.5 p-2 rounded-full text-xs font-medium border transition-all focus:outline-none disabled:opacity-50',
              open
                ? 'bg-white dark:bg-zinc-800 text-primary-600 border-primary-200 dark:border-primary-800 shadow-sm'
                : 'text-gray-900 dark:text-white bg-gray-50/50 dark:bg-zinc-800/50 border-transparent hover:bg-gray-100 dark:hover:bg-zinc-800 hover:border-gray-200 dark:hover:border-zinc-700',
            )}
          >
            <img src={selected.icon} alt="" className="w-3.5 h-3.5 object-contain " />
            <span className="truncate max-w-[80px]">{selected.name}</span>
            <ChevronUp
              size={12}
              className={clsx('transition-transform duration-200 opacity-50', open && 'rotate-180')}
            />
          </PopoverButton>

          <Transition
            as={Fragment}
            enter="transition ease-out duration-200"
            enterFrom="opacity-0 translate-y-2 scale-95"
            enterTo="opacity-100 translate-y-0 scale-100"
            leave="transition ease-in duration-150"
            leaveFrom="opacity-100 translate-y-0 scale-100"
            leaveTo="opacity-0 translate-y-2 scale-95"
          >
            <PopoverPanel className="absolute top-full left-0 mb-2 w-64 origin-bottom-left rounded-2xl bg-white dark:bg-[#1C1C1E] border border-gray-200 dark:border-zinc-800 shadow-xl focus:outline-none z-50">
              {renderContent()}
            </PopoverPanel>
          </Transition>
        </>
      )}
    </Popover>
  )
}

export default React.memo(SearchSourceSelector)
