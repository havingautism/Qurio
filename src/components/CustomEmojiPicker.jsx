import data from '@emoji-mart/data'
import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import EmojiDisplay from './EmojiDisplay'

const CustomEmojiPicker = ({ onEmojiSelect, className = '' }) => {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')

  // Extract categories and emojis from the data
  const categories = data.categories
  const emojis = data.emojis

  // Filter emojis based on search
  const filteredCategories = useMemo(() => {
    if (!search.trim()) return categories

    const lowerSearch = search.toLowerCase()

    // We want to return a structure similar to categories but filtered
    const result = categories
      .map(cat => {
        const filteredEmojiIds = cat.emojis.filter(id => {
          const emojiData = emojis[id]
          if (!emojiData) return false

          // Search by id, name, or keywords
          return (
            emojiData.id.toLowerCase().includes(lowerSearch) ||
            emojiData.name.toLowerCase().includes(lowerSearch) ||
            (emojiData.keywords && emojiData.keywords.some(k => k.includes(lowerSearch)))
          )
        })

        return { ...cat, emojis: filteredEmojiIds }
      })
      .filter(cat => cat.emojis.length > 0)

    return result
  }, [search, categories, emojis])

  return (
    <div
      className={`flex h-80 w-80 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-[#191a1a] ${className}`}
    >
      {/* Search Bar */}
      <div className="border-b border-gray-100 p-3 dark:border-zinc-800">
        <div className="relative">
          <Search size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('views.icons.searchPlaceholder')}
            className="focus:ring-primary-500/20 w-full rounded-lg bg-gray-100 py-2 pr-4 pl-9 text-sm text-gray-900 focus:ring-2 focus:outline-none dark:bg-zinc-800/50 dark:text-gray-100"
            autoFocus
          />
        </div>
      </div>

      {/* Emoji Content */}
      <div className="scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-zinc-700 flex-1 overflow-y-auto px-2 pb-2">
        {filteredCategories.map(category => (
          <div key={category.id} className="mb-4">
            <h3 className="sticky top-0 z-10 mb-2 bg-white/95 px-2 py-1 text-xs font-medium text-gray-500 backdrop-blur-sm dark:bg-[#191a1a]/95 dark:text-gray-400">
              {data.categories.find(c => c.id === category.id)?.name || category.id}
              {/* Note: data.categories strings might need localization or capitalized names if available, relying on ID or name for now */}
            </h3>
            <div className="grid grid-cols-7 gap-1">
              {category.emojis.map(emojiId => {
                const emojiData = emojis[emojiId]
                if (!emojiData) return null

                // Construct the native emoji string or use the ID if native not available (though data usually has skins)
                // For simplified usage, we grab the first skin's native char
                const nativeEmoji = emojiData.skins[0].native

                return (
                  <button
                    key={emojiId}
                    onClick={() => onEmojiSelect({ native: nativeEmoji, id: emojiId })}
                    title={emojiData.name}
                    className="flex h-9 w-9 items-center justify-center rounded transition-colors hover:bg-gray-100 dark:hover:bg-zinc-800"
                  >
                    <EmojiDisplay emoji={nativeEmoji} size="1.2em" />
                  </button>
                )
              })}
            </div>
          </div>
        ))}
        {filteredCategories.length === 0 && (
          <div className="py-8 text-center text-sm text-gray-400">{t('views.icons.noResults')}</div>
        )}
      </div>
    </div>
  )
}

export default CustomEmojiPicker
