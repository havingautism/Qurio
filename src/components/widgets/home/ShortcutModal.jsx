import { Globe, Image, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import useScrollLock from '../../../hooks/useScrollLock'
import { useAppContext } from '../../../App'
import { getDirectFaviconUrl, getFaviconFallbackUrl } from '../../../lib/homeWidgetsService'
import CustomEmojiPicker from '../../CustomEmojiPicker'

const DEFAULT_EMOJI = '😀'

const ShortcutModal = ({ isOpen, onClose, shortcut, onSave, onDelete, currentPosition }) => {
  const { t } = useTranslation()
  const { showConfirmation } = useAppContext()
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [iconType, setIconType] = useState('favicon')
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
      setIconType('favicon')
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
      showConfirmation({
        title: t('confirmation.deleteShortcutTitle') || 'Delete Shortcut',
        message:
          t('confirmation.deleteShortcutMessage') ||
          'Are you sure you want to delete this shortcut?',
        confirmText: t('common.delete', 'Delete'),
        isDangerous: true,
        onConfirm: () => onDelete(shortcut.id),
      })
    }
  }

  const modalContent = (
    <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm transition-all duration-300 sm:p-6">
      <div className="animate-in fade-in zoom-in-95 flex max-h-[85dvh] w-full flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl ring-1 ring-black/5 duration-200 sm:max-w-md dark:border-white/10 dark:bg-[#1C1C1E]">
        {/* Header */}
        <div className="flex h-14 items-center justify-between border-b border-gray-100 bg-white/50 px-5 backdrop-blur-md dark:border-white/5 dark:bg-white/5">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">
            {shortcut?.id ? t('views.widgets.editShortcut') : t('views.widgets.newShortcut')}
          </h3>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-gray-500 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/10"
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="max-h-[70vh] flex-1 space-y-6 overflow-y-auto p-5">
          {/* 1. Preview Section */}
          <div className="flex flex-col items-center justify-center py-2">
            <div className="mb-3 flex h-20 w-20 items-center justify-center rounded-[20px] bg-white shadow-lg ring-1 ring-black/5 dark:ring-white/10">
              {iconType === 'favicon' && (
                <div className="flex h-10 w-10 items-center justify-center">
                  {url ? (
                    <img
                      key={url + useFaviconFallback}
                      src={
                        useFaviconFallback ? getFaviconFallbackUrl(url) : getDirectFaviconUrl(url)
                      }
                      alt=""
                      className="h-full w-full object-contain"
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
              {iconType === 'emoji' && <span className="text-4xl leading-none">{iconEmoji}</span>}
              {iconType === 'custom' &&
                (iconUrl ? (
                  <img
                    src={iconUrl}
                    alt=""
                    className="h-10 w-10 object-contain"
                    onError={e => (e.target.style.display = 'none')}
                  />
                ) : (
                  <Image size={32} className="text-gray-400 opacity-50" />
                ))}
            </div>
            <p className="max-w-[200px] truncate text-sm font-medium text-gray-900 dark:text-white">
              {title || t('views.widgets.shortcutTitle')}
            </p>
            <p className="mt-0.5 max-w-[200px] truncate text-xs text-gray-500 dark:text-gray-400">
              {url || 'https://example.com'}
            </p>
          </div>

          {/* 2. Basic Info */}
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="ml-1 text-xs font-semibold tracking-wider text-gray-500 uppercase dark:text-gray-400">
                {t('views.widgets.details')}
              </label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder={t('views.widgets.shortcutTitlePlaceholder')}
                className="focus:ring-primary-500/50 focus:border-primary-500 w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 font-medium text-gray-900 placeholder-gray-400 transition-all focus:ring-2 focus:outline-none disabled:bg-gray-50/20 dark:border-white/10 dark:bg-white/5 dark:text-white"
                autoFocus={!shortcut}
              />
              <input
                type="url"
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder={t('views.widgets.urlPlaceholder')}
                className="focus:ring-primary-500/50 focus:border-primary-500 w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 font-mono text-sm font-medium text-gray-900 placeholder-gray-400 transition-all focus:ring-2 focus:outline-none disabled:bg-gray-50/20 dark:border-white/10 dark:bg-white/5 dark:text-white"
              />
            </div>
          </div>

          {/* 3. Icon Selector */}
          <div className="space-y-3">
            <label className="ml-1 text-xs font-semibold tracking-wider text-gray-500 uppercase dark:text-gray-400">
              {t('views.widgets.appearance')}
            </label>

            {/* Segmented Control */}
            <div className="flex rounded-xl bg-gray-100 p-1 dark:bg-white/5">
              {[
                { id: 'favicon', label: t('views.icons.favicon') },
                { id: 'emoji', label: t('views.icons.emoji') },
                { id: 'custom', label: t('views.icons.custom') },
              ].map(type => (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => setIconType(type.id)}
                  className={`flex-1 rounded-lg py-1.5 text-sm font-medium transition-all ${
                    iconType === type.id
                      ? 'bg-white text-gray-900 shadow-sm dark:bg-[#2C2C2E] dark:text-white'
                      : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                  }`}
                >
                  {type.label}
                </button>
              ))}
            </div>

            {/* Dynamic Input Area */}
            <div className="flex min-h-[100px] justify-center">
              {iconType === 'custom' && (
                <div className="w-full pt-2">
                  <div className="relative mb-2">
                    <Image
                      size={18}
                      className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-gray-400"
                    />
                    <input
                      type="url"
                      value={iconUrl}
                      onChange={e => setIconUrl(e.target.value)}
                      placeholder={t('views.widgets.iconUrlPlaceholder')}
                      className="focus:ring-primary-500/50 focus:border-primary-500 w-full rounded-xl border border-gray-200 bg-white py-2.5 pr-4 pl-10 text-sm text-gray-900 placeholder-gray-400 transition-all focus:ring-2 focus:outline-none disabled:bg-gray-50/20 dark:border-white/10 dark:bg-white/5 dark:text-white"
                    />
                  </div>
                  <p className="px-1 text-xs text-gray-500">{t('views.widgets.imageUrlHint')}</p>
                </div>
              )}
              {iconType === 'emoji' && (
                <CustomEmojiPicker
                  onEmojiSelect={({ native }) => setIconEmoji(native)}
                  className="w-full"
                />
              )}
              {iconType === 'favicon' && (
                <div className="w-full rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500 dark:border-white/10 dark:bg-white/5 dark:text-gray-400">
                  {t('views.widgets.faviconHint')}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-gray-100 bg-gray-50/50 p-5 dark:border-white/5 dark:bg-white/5">
          {shortcut?.id ? (
            <button
              onClick={handleDelete}
              className="rounded-xl p-2.5 text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-500/10"
              title={t('common.delete')}
            >
              <Trash2 size={20} />
            </button>
          ) : (
            <div /> /* Spacer */
          )}

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="rounded-xl px-5 py-2.5 font-medium text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleSave}
              disabled={!title.trim() || !url.trim()}
              className="bg-primary-500 hover:bg-primary-600 shadow-primary-500/30 rounded-xl px-6 py-2.5 font-medium text-white shadow-lg transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t('common.save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  return createPortal(modalContent, document.body)
}

export default ShortcutModal
