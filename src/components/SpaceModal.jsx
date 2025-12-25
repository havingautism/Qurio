import { useState, useEffect, useRef, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Settings, Info } from 'lucide-react'
import useScrollLock from '../hooks/useScrollLock'
import EmojiDisplay from './EmojiDisplay'
import CustomEmojiPicker from './CustomEmojiPicker'
import { useAppContext } from '../App'
import clsx from 'clsx'

const SpaceModal = ({ isOpen, onClose, editingSpace = null, onSave, onDelete }) => {
  const { t } = useTranslation()
  useScrollLock(isOpen)
  const { showConfirmation } = useAppContext()
  const [activeTab, setActiveTab] = useState('general')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [prompt, setPrompt] = useState('')

  const [emoji, setEmoji] = useState('🌍') // Default emoji
  const [temperature, setTemperature] = useState(1.0)
  const [topK, setTopK] = useState(null)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const pickerRef = useRef(null)
  const buttonRef = useRef(null)

  // Tab menu items - use constant keys for logic, translate labels for display
  const TAB_ITEMS = [
    { id: 'general', icon: Info },
    { id: 'advanced', icon: Settings },
  ]

  const menuItems = useMemo(
    () => TAB_ITEMS.map(item => ({ ...item, label: t(`spaceModal.${item.id}`) })),
    [t],
  )

  // Close picker when clicking outside
  useEffect(() => {
    const handleClickOutside = event => {
      if (
        pickerRef.current &&
        !pickerRef.current.contains(event.target) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target)
      ) {
        setShowEmojiPicker(false)
      }
    }

    if (showEmojiPicker) {
      document.addEventListener('click', handleClickOutside)
    }
    return () => document.removeEventListener('click', handleClickOutside)
  }, [showEmojiPicker])

  // Populate form when modal opens/changes
  useEffect(() => {
    if (isOpen) {
      if (editingSpace) {
        setName(editingSpace.label || '')
        setDescription(editingSpace.description || '')
        setPrompt(editingSpace.prompt || '')
        setEmoji(editingSpace.emoji || '🌍')
        setTemperature(editingSpace.temperature ?? 1.0)
        setTopK(editingSpace.top_k ?? null)
      } else {
        setName('')
        setDescription('')
        setPrompt('')
        setEmoji('🌍')
        setTemperature(1.0)
        setTopK(null)
      }
      setShowEmojiPicker(false)
      setError('')
      setIsSaving(false)
    }
  }, [isOpen, editingSpace])

  const handleSave = async () => {
    if (!name.trim()) {
      setError(t('spaceModal.nameRequired'))
      return
    }
    setIsSaving(true)
    setError('')
    try {
      await onSave?.({
        emoji,
        label: name.trim(),
        description: description.trim(),

        prompt: prompt.trim(),
        temperature,
        top_k: topK,
      })
    } catch (err) {
      setError(err.message || t('spaceModal.saveFailed'))
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!editingSpace?.id) return

    showConfirmation({
      title: t('spaceModal.deleteTitle'),
      message: t('spaceModal.deleteMessage', { name: editingSpace.label }),
      confirmText: t('spaceModal.deleteConfirm'),
      isDangerous: true,
      onConfirm: async () => {
        try {
          await onDelete?.(editingSpace.id)
        } catch (err) {
          setError(err.message || t('spaceModal.deleteFailed'))
        }
      },
    })
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-start md:items-center justify-center bg-black/50 backdrop-blur-sm p-0 md:p-4 overflow-y-auto md:overflow-hidden">
      <div className="w-full h-[100vh] md:max-w-2xl md:h-[80vh] bg-white dark:bg-[#191a1a] rounded-none md:rounded-2xl shadow-2xl flex flex-col overflow-hidden border-0 md:border border-gray-200 dark:border-zinc-800">
        {/* Header */}
        <div className="h-14 border-b border-gray-200 dark:border-zinc-800 flex items-center justify-between px-4 sm:px-6 shrink-0">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {editingSpace ? t('spaceModal.edit') : t('spaceModal.create')}
          </h3>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-500 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Tab Navigation */}
          <div className="px-2 sm:px-3 pt-2 pb-2 border-b border-gray-200 dark:border-zinc-800 bg-gray-50/50 dark:bg-[#191a1a] shrink-0">
            <nav className="flex gap-1">
              {menuItems.map(item => (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={clsx(
                    'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                    activeTab === item.id
                      ? 'bg-primary-100 dark:bg-zinc-800 text-primary-600 dark:text-primary-400'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-primary-100 dark:hover:bg-zinc-800',
                  )}
                >
                  <item.icon size={16} />
                  {item.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Tab Content */}
          <div className="flex-1 px-4 sm:px-6 py-6 overflow-y-auto min-h-0">
            {activeTab === 'general' && (
              <div className="flex flex-col gap-4 h-full">
                {/* Icon and Name Row - Fixed height */}
                <div className="flex flex-col gap-2 shrink-0">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t('spaceModal.iconName')}
                  </label>
                  <div className="flex items-center gap-3">
                    {/* Emoji Picker */}
                    <div className="relative">
                      <button
                        ref={buttonRef}
                        onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                        className="w-12 h-12 rounded-xl bg-gray-100 dark:bg-zinc-800 flex items-center justify-center text-2xl hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors border border-transparent focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none"
                      >
                        <EmojiDisplay emoji={emoji} />
                      </button>

                      {/* Picker Popover */}
                      {showEmojiPicker && (
                        <div
                          ref={pickerRef}
                          className="absolute top-full left-0 mt-2 z-50 shadow-2xl rounded-xl overflow-hidden"
                        >
                          <CustomEmojiPicker
                            onEmojiSelect={e => {
                              setEmoji(e.native)
                              setShowEmojiPicker(false)
                            }}
                          />
                        </div>
                      )}
                    </div>

                    {/* Name Input */}
                    <input
                      type="text"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder={t('spaceModal.namePlaceholder')}
                      className="flex-1 h-12 px-4 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-zinc-600"
                    />
                  </div>
                </div>

                {/* Description Input - Fixed height */}
                <div className="flex flex-col gap-2 shrink-0">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t('spaceModal.description')} <span className="text-gray-400 font-normal">({t('spaceModal.descriptionOptional')})</span>
                  </label>
                  <textarea
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder={t('spaceModal.descriptionPlaceholder')}
                    rows={2}
                    className="w-full px-4 py-2.5 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-zinc-600 resize-none"
                  />
                </div>

                {/* Prompt Input - Flexible height */}
                <div className="flex flex-col gap-2 flex-1 min-h-0">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t('spaceModal.spacePrompt')} <span className="text-gray-400 font-normal">({t('spaceModal.spacePromptOptional')})</span>
                  </label>
                  <textarea
                    value={prompt}
                    onChange={e => setPrompt(e.target.value)}
                    placeholder={t('spaceModal.promptPlaceholder')}
                    className="w-full flex-1 min-h-[120px] px-4 py-2.5 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-zinc-600 resize-none"
                  />
                </div>
              </div>
            )}

            {activeTab === 'advanced' && (
              <div className="flex flex-col gap-4">


                {/* Model Settings */}
                <div className="flex flex-col gap-4">
                  <div className="flex gap-4">
                    <div className="flex flex-col gap-2 flex-1">
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {t('spaceModal.temperature')} <span className="text-gray-400 font-normal">({temperature})</span>
                      </label>
                      <div className="h-10 flex items-center px-1">
                        <input
                          type="range"
                          min="0"
                          max="2"
                          step="0.1"
                          value={temperature}
                          onChange={e => setTemperature(parseFloat(e.target.value))}
                          className="w-full accent-black dark:accent-white cursor-pointer"
                        />
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 w-24">
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('spaceModal.topK')}</label>
                      <input
                        type="number"
                        min="0"
                        value={topK ?? ''}
                        onChange={e => {
                          const val = e.target.value
                          setTopK(val === '' ? null : parseInt(val))
                        }}
                        placeholder={t('spaceModal.topKPlaceholder')}
                        className="w-full h-10 px-3 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-zinc-600"
                      />
                    </div>
                  </div>
                </div>

                {/* Info Box */}
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <Info size={16} className="text-blue-600 dark:text-blue-400 mt-0.5" />
                    <div className="text-sm text-blue-800 dark:text-blue-200">
                      <p className="font-medium mb-1">{t('spaceModal.modelSettingsInfo')}</p>
                      <ul className="text-xs space-y-1">
                        <li>• <strong>{t('spaceModal.temperature')}:</strong> {t('spaceModal.temperatureInfo')}</li>
                        <li>• <strong>{t('spaceModal.topK')}:</strong> {t('spaceModal.topKInfo')}</li>
                        <li>• {t('spaceModal.overrideInfo')}</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {error && <div className="text-sm text-red-500">{error}</div>}
          </div>
        </div>

        {/* Footer */}
        <div className="h-16 border-t border-gray-200 dark:border-zinc-800 flex items-center justify-between px-4 sm:px-6 gap-3 bg-gray-50/50 dark:bg-[#191a1a] shrink-0">
          <div className="flex items-center gap-2">
            {editingSpace && (
              <button
                onClick={handleDelete}
                className="px-4 py-2 rounded-lg text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                {t('sidebar.delete')}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
            >
              {t('spaceModal.cancel')}
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-primary-500 text-white hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {isSaving ? t('spaceModal.saving') : editingSpace ? t('spaceModal.save') : t('spaceModal.createSpace')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SpaceModal
