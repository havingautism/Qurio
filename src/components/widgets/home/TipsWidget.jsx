import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MoreHorizontal } from 'lucide-react'
import WidgetCard from './WidgetCard'
import { useAppContext } from '../../../App'
import { getProvider } from '../../../lib/providers'
import { loadSettings } from '../../../lib/settings'

const getTodayKey = () => new Date().toISOString().slice(0, 10)

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
  const requestRef = useRef(false)

  useEffect(() => {
    setTip(t('views.widgets.tipsContent'))
  }, [t])

  useEffect(() => {
    const fetchDailyTip = async () => {
      if (requestRef.current) return
      requestRef.current = true

      const today = getTodayKey()
      const languageKey = i18n.language || 'en'
      const cacheKey = `homeDailyTip:${languageKey}`
      const cacheDateKey = `homeDailyTipDate:${languageKey}`
      const cachedDate = localStorage.getItem(cacheDateKey)
      const cachedTip = localStorage.getItem(cacheKey)
      if (cachedDate === today && cachedTip) {
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
        settings.llmAnswerLanguage ||
        (languageKey === 'zh-CN' ? 'Simplified Chinese' : 'English')

      setIsLoading(true)
      try {
        const nextTip = await provider.generateDailyTip(
          language,
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
        requestRef.current = false
      }
    }

    fetchDailyTip()
  }, [i18n.language])

  return (
    <WidgetCard
      title={t('views.widgets.tipsTitle')}
      action={<MoreHorizontal size={16} />}
      className="h-full min-h-[160px]"
    >
      <div className="flex flex-col justify-center h-full gap-2">
        <p className="text-lg font-medium text-gray-800 dark:text-gray-200">
          {isLoading ? t('views.widgets.tipsLoading') : tip}
        </p>
      </div>
    </WidgetCard>
  )
}

export default TipsWidget
