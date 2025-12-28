import { Globe, Image, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import useScrollLock from '../../../hooks/useScrollLock'
import { getDirectFaviconUrl, getFaviconFallbackUrl } from '../../../lib/homeWidgetsService'
import CustomEmojiPicker from '../../CustomEmojiPicker'

const DEFAULT_EMOJI = '😀'

const ShortcutModal = ({ isOpen, onClose, shortcut, onSave, onDelete, currentPosition }) => {
  const { t } = useTranslation()
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [iconType, setIconType] = useState('emoji')
  const [iconEmoji, setIconEmoji] = useState(DEFAULT_EMOJI)
  const [iconUrl, setIconUrl] = useState('')
  const [useFaviconFallback, setUseFaviconFallback] = useState(false)

  useScrollLock(isOpen)

  useEffect(() => {
    if (shortcut) {
      setTitle(shortcut.title || '')
      setUrl(shortcut.url || '')
      setIconType(shortcut.icon_type || 'emoji')
      setIconEmoji(shortcut.icon_name || DEFAULT_EMOJI)
      setIconUrl(shortcut.icon_url || '')
      setUseFaviconFallback(false)
    } else {
      setTitle('')
      setUrl('')
      setIconType('emoji')
      setIconEmoji(DEFAULT_EMOJI)
      setIconUrl('')
      setUseFaviconFallback(false)
    }
  }, [shortcut])

  if (!isOpen) return null
  if (typeof document === 'undefined') return null

  const handleSave = () => {
    if (!title.trim() || !url.trim()) return

    const payload = {
      id: shortcut?.id,
      title: title.trim(),
      url: url.trim(),
      icon_type: iconType,
      icon_name: iconType === 'emoji' ? iconEmoji : null,
      icon_url: iconType === 'custom' ? iconUrl.trim() : null,
      position: shortcut?.position ?? currentPosition ?? 0,
    }
    onSave(payload)
  }

  const handleDelete = () => {
    if (onDelete && shortcut?.id) {
      onDelete(shortcut.id)
    }
  }

  const modalContent = (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 sm:p-6 transition-all duration-300">
      <div className="w-full sm:max-w-md bg-white dark:bg-[#1C1C1E] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-gray-200 dark:border-white/10 ring-1 ring-black/5 animate-in fade-in zoom-in-95 duration-200 max-h-[85dvh]">
        {/* Header */}
        <div className="h-14 border-b border-gray-100 dark:border-white/5 flex items-center justify-between px-5 bg-white/50 dark:bg-white/5 backdrop-blur-md">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">
            {shortcut?.id
              ? t('views.widgets.editShortcut', 'Edit Shortcut')
              : t('views.widgets.newShortcut', 'New Shortcut')}
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-white/10 text-gray-500 dark:text-gray-400 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto max-h-[70vh] p-5 space-y-6">
          {/* 1. Preview Section */}
          <div className="flex flex-col items-center justify-center py-2">
            <div className="w-20 h-20 flex items-center justify-center rounded-[20px] bg-white  shadow-lg mb-3 ring-1 ring-black/5 dark:ring-white/10">
              {iconType === 'emoji' && <span className="text-4xl leading-none">{iconEmoji}</span>}
              {iconType === 'favicon' && (
                <div className="w-10 h-10 flex items-center justify-center">
                  {url ? (
                    <img
                      key={url + useFaviconFallback}
                      src={
                        useFaviconFallback ? getFaviconFallbackUrl(url) : getDirectFaviconUrl(url)
                      }
                      alt=""
                      className="w-full h-full object-contain"
                      onError={e => {
                        if (!useFaviconFallback) {
                          setUseFaviconFallback(true)
                        } else {
                          e.target.style.display = 'none'
                        }
                      }}
                    />
                  ) : (
                    <Globe size={32} className="text-gray-400 opacity-50" />
                  )}
                </div>
              )}
              {iconType === 'custom' &&
                (iconUrl ? (
                  <img
                    src={iconUrl}
                    alt=""
                    className="w-10 h-10 object-contain"
                    onError={e => (e.target.style.display = 'none')}
                  />
                ) : (
                  <Image size={32} className="text-gray-400 opacity-50" />
                ))}
            </div>
            <p className="text-sm font-medium text-gray-900 dark:text-white max-w-[200px] truncate">
              {title || t('views.widgets.shortcutTitle', 'Shortcut Name')}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 max-w-[200px] truncate mt-0.5">
              {url || 'https://example.com'}
            </p>
          </div>

          {/* 2. Basic Info */}
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 ml-1">
                {t('views.widgets.details', 'Details')}
              </label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder={t('views.widgets.shortcutTitlePlaceholder', 'Title e.g. GitHub')}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 transition-all font-medium"
                autoFocus={!shortcut}
              />
              <input
                type="url"
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="https://example.com"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 transition-all font-medium font-mono text-sm"
              />
            </div>
          </div>

          {/* 3. Icon Selector */}
          <div className="space-y-3">
            <label className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 ml-1">
              {t('views.widgets.appearance', 'Appearance')}
            </label>

            {/* Segmented Control */}
            <div className="flex p-1 bg-gray-100 dark:bg-white/5 rounded-xl">
              {[
                { id: 'emoji', label: t('views.icons.emoji', 'Emoji') },
                { id: 'favicon', label: t('views.icons.favicon', 'Favicon') },
                { id: 'custom', label: t('views.icons.custom', 'Image') },
              ].map(type => (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => setIconType(type.id)}
                  className={`flex-1 py-1.5 text-sm font-medium rounded-lg transition-all ${
                    iconType === type.id
                      ? 'bg-white dark:bg-[#2C2C2E] text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                  }`}
                >
                  {type.label}
                </button>
              ))}
            </div>

            {/* Dynamic Input Area */}
            <div className="min-h-[100px] flex justify-center">
              {iconType === 'emoji' && (
                <CustomEmojiPicker
                  onEmojiSelect={({ native }) => setIconEmoji(native)}
                  className="w-full"
                />
              )}

              {iconType === 'custom' && (
                <div className="w-full pt-2">
                  <div className="relative mb-2">
                    <Image
                      size={18}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                    />
                    <input
                      type="url"
                      value={iconUrl}
                      onChange={e => setIconUrl(e.target.value)}
                      placeholder="https://example.com/image.png"
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 transition-all text-sm"
                    />
                  </div>
                  <p className="text-xs text-gray-500 px-1">
                    {t('views.widgets.imageUrlHint', 'Paste a direct link to an image.')}
                  </p>
                </div>
              )}

              {iconType === 'favicon' && (
                <div className="text-center py-6 px-4 text-gray-500 dark:text-gray-400 text-sm bg-gray-50 dark:bg-white/5 rounded-xl w-full border border-dashed border-gray-200 dark:border-white/10">
                  {t(
                    'views.widgets.faviconHint',
                    'We will automatically fetch the icon from the URL you provided.',
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-gray-100 dark:border-white/5 bg-gray-50/50 dark:bg-white/5 flex items-center justify-between gap-3">
          {shortcut?.id ? (
            <button
              onClick={handleDelete}
              className="text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 p-2.5 rounded-xl transition-colors"
              title={t('common.delete', 'Delete')}
            >
              <Trash2 size={20} />
            </button>
          ) : (
            <div /> /* Spacer */
          )}

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl text-gray-600 dark:text-gray-300 font-medium hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
            >
              {t('common.cancel', 'Cancel')}
            </button>
            <button
              onClick={handleSave}
              disabled={!title.trim() || !url.trim()}
              className="px-6 py-2.5 rounded-xl bg-primary-500 hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium shadow-lg shadow-primary-500/30 transition-all active:scale-95"
            >
              {t('common.save', 'Save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  return createPortal(modalContent, document.body)
}

export default ShortcutModal
