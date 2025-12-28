import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MoreHorizontal, RefreshCw, SlidersHorizontal } from 'lucide-react'
import WidgetCard from './WidgetCard'
import { useAppContext } from '../../../App'
import { getProvider } from '../../../lib/providers'
import { loadSettings } from '../../../lib/settings'

const getTodayKey = () => new Date().toISOString().slice(0, 10)
const CATEGORY_STORAGE_KEY = 'homeDailyTipCategory'

const MODEL_SEPARATOR = '::'

const parseStoredModel = value => {
  if (!value) return { provider: '', modelId: '' }
  const index = value.indexOf(MODEL_SEPARATOR)
  if (index === -1) return { provider: '', modelId: value }
  return {
    provider: value.slice(0, index),
    modelId: value.slice(index + MODEL_SEPARATOR.length),
  }
}

const TipsWidget = () => {
  const { t, i18n } = useTranslation()
  const { defaultAgent } = useAppContext()
  const [tip, setTip] = useState(t('views.widgets.tipsContent'))
  const [isLoading, setIsLoading] = useState(false)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [refreshNonce, setRefreshNonce] = useState(0)
  const [categoryKey, setCategoryKey] = useState(
    localStorage.getItem(CATEGORY_STORAGE_KEY) || 'general',
  )
  const menuRef = useRef(null)
  const requestRef = useRef(false)
  const forceRefreshRef = useRef(false)

  const categories = useMemo(
    () => [
      { key: 'general', label: t('views.widgets.tipsCategoryGeneral') },
      { key: 'productivity', label: t('views.widgets.tipsCategoryProductivity') },
      { key: 'wellness', label: t('views.widgets.tipsCategoryWellness') },
      { key: 'learning', label: t('views.widgets.tipsCategoryLearning') },
      { key: 'creativity', label: t('views.widgets.tipsCategoryCreativity') },
    ],
    [t],
  )

  useEffect(() => {
    setTip(t('views.widgets.tipsContent'))
  }, [t])

  useEffect(() => {
    const handleClickOutside = event => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsMenuOpen(false)
      }
    }

    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isMenuOpen])

  useEffect(() => {
    const fetchDailyTip = async () => {
      if (requestRef.current) return
      requestRef.current = true

      const today = getTodayKey()
      const languageKey = i18n.language || 'en'
      const cacheKey = `homeDailyTip:${languageKey}:${categoryKey}`
      const cacheDateKey = `homeDailyTipDate:${languageKey}:${categoryKey}`
      const cachedDate = localStorage.getItem(cacheDateKey)
      const cachedTip = localStorage.getItem(cacheKey)
      if (!forceRefreshRef.current && cachedDate === today && cachedTip) {
        setTip(cachedTip)
        requestRef.current = false
        return
      }

      const settings = loadSettings()
      const modelValue = defaultAgent?.defaultModel || defaultAgent?.liteModel
      const parsedModel = parseStoredModel(modelValue)
      const providerName = parsedModel.provider || defaultAgent?.provider
      const modelId = parsedModel.modelId
      if (!providerName || !modelId) {
        requestRef.current = false
        return
      }
      const provider = getProvider(providerName)
      const credentials = provider.getCredentials(settings)
      if (!credentials?.apiKey || !provider.generateDailyTip) {
        requestRef.current = false
        return
      }

      const language =
        settings.llmAnswerLanguage || (languageKey === 'zh-CN' ? 'Simplified Chinese' : 'English')
      const categoryLabel =
        categories.find(category => category.key === categoryKey)?.label ||
        t('views.widgets.tipsCategoryGeneral')

      setIsLoading(true)
      try {
        const nextTip = await provider.generateDailyTip(
          language,
          categoryLabel,
          credentials.apiKey,
          credentials.baseUrl,
          modelId,
        )
        const trimmedTip = typeof nextTip === 'string' ? nextTip.trim() : ''
        if (trimmedTip) {
          localStorage.setItem(cacheKey, trimmedTip)
          localStorage.setItem(cacheDateKey, today)
          setTip(trimmedTip)
        }
      } catch (error) {
        console.error('Failed to fetch daily tip:', error)
      } finally {
        setIsLoading(false)
        forceRefreshRef.current = false
        requestRef.current = false
      }
    }

    fetchDailyTip()
  }, [categories, categoryKey, i18n.language, refreshNonce, t])

  const handleRefresh = () => {
    forceRefreshRef.current = true
    setRefreshNonce(prev => prev + 1)
    setIsMenuOpen(false)
  }

  const handleCategoryChange = nextKey => {
    setCategoryKey(nextKey)
    localStorage.setItem(CATEGORY_STORAGE_KEY, nextKey)
    setIsMenuOpen(false)
  }

  return (
    <WidgetCard
      title={t('views.widgets.tipsTitle')}
      action={
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setIsMenuOpen(prev => !prev)}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
          >
            <MoreHorizontal size={16} />
          </button>
          {isMenuOpen && (
            <div className="absolute right-0 top-full mt-2 w-56 max-h-[60vh] overflow-y-auto rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-[#1e1e1e] shadow-xl z-50 transition-all animate-in fade-in zoom-in-95 duration-200">
              <div className="p-1">
                <button
                  type="button"
                  onClick={handleRefresh}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg transition-colors group"
                >
                  <RefreshCw
                    size={14}
                    className="text-gray-500 dark:text-gray-400 group-hover:text-primary-500 transition-colors"
                  />
                  {t('views.widgets.tipsRefresh')}
                </button>
              </div>

              <div className="h-px bg-gray-100 dark:bg-white/5 my-0.5 mx-1" />

              <div className="p-1">
                <div className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 flex items-center gap-2 mb-0.5">
                  <SlidersHorizontal size={12} />
                  {t('views.widgets.tipsCategory')}
                </div>
                {categories.map(category => {
                  const isActive = category.key === categoryKey
                  return (
                    <button
                      key={category.key}
                      type="button"
                      onClick={() => handleCategoryChange(category.key)}
                      className={`w-full flex items-center justify-between px-3 py-2 text-sm rounded-lg transition-colors group ${
                        isActive
                          ? 'bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400'
                          : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5'
                      }`}
                    >
                      <span className="font-medium">{category.label}</span>
                      {isActive && <div className="w-1.5 h-1.5 rounded-full bg-primary-500" />}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      }
      className={`h-full min-h-[160px] ${isMenuOpen ? 'relative z-40' : ''}`}
    >
      <div className="flex flex-col justify-center h-full gap-2">
        {isLoading ? (
          <div className="flex items-center gap-1 text-lg font-medium text-gray-500 dark:text-gray-400">
            <span className="inline-flex w-1.5 h-1.5 rounded-full bg-current animate-bounce [animation-delay:-0.2s]" />
            <span className="inline-flex w-1.5 h-1.5 rounded-full bg-current animate-bounce [animation-delay:-0.1s]" />
            <span className="inline-flex w-1.5 h-1.5 rounded-full bg-current animate-bounce" />
          </div>
        ) : (
          <p className="text-lg font-medium text-gray-800 dark:text-gray-200">{tip}</p>
        )}
      </div>
    </WidgetCard>
  )
}

export default TipsWidget
