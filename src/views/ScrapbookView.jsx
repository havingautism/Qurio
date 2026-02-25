/**
 * ScrapbookView — URL-first scrapbook interface.
 *
 * ┌─ Header ────────────────────────────────────────────────────────┐
 * │  随手记   [search]                          [gear/model config] │
 * ├─ Platform filter pills ─────────────────────────────────────────┤
 * ├─ Card grid ─────────────────────────────────────────────────────┤
 * └─ FAB (+) ───────────────────────────────────────────────────────┘
 *
 * Add modal:
 *  - Tab "链接"  → paste URL → AI auto-fetches & generates title/summary
 *  - Tab "手动"  → manual title / summary / content input
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  BookOpen,
  ExternalLink,
  Globe,
  Loader2,
  Plus,
  Search,
  Settings2,
  Tag,
  Trash2,
  X,
  Video,
  Image as ImageIcon,
  Menu,
} from 'lucide-react'
import clsx from 'clsx'
import {
  createScrapbookEntry,
  deleteScrapbookEntry,
  getPlatformLabel,
  listScrapbookEntries,
  PLATFORM_LABELS,
  resolveScrapbookModelConfig,
} from '../lib/scrapbookService'
import { useNavigate } from '@tanstack/react-router'
import { useAppContext } from '../App'
import { loadSettings, saveSettings } from '../lib/settings'
import { PROVIDER_KEYS, FALLBACK_MODEL_OPTIONS } from '../lib/modelConstants'
import { getModelsForProvider } from '../lib/models_api'
import { getPublicEnv } from '../lib/publicEnv'
import { saveRemoteSettings } from '../lib/supabase'
import { Streamdown } from 'streamdown'

import ColorBendsBackground from '../components/ui/ColorBendsBackground'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { getModelIcon, getModelIconClassName, renderProviderIcon } from '../lib/modelIcons'

// ENV_VARS — same as AgentModal, used in hasApiKey check
const ENV_VARS = {
  openAIKey: getPublicEnv('PUBLIC_OPENAI_API_KEY'),
  googleApiKey: getPublicEnv('PUBLIC_GOOGLE_API_KEY'),
  siliconflowKey: getPublicEnv('PUBLIC_SILICONFLOW_API_KEY'),
  glmKey: getPublicEnv('PUBLIC_GLM_API_KEY'),
  deepseekKey: getPublicEnv('PUBLIC_DEEPSEEK_API_KEY'),
  volcengineKey: getPublicEnv('PUBLIC_VOLCENGINE_API_KEY'),
  modelscopeKey: getPublicEnv('PUBLIC_MODELSCOPE_API_KEY'),
  kimiKey: getPublicEnv('PUBLIC_KIMI_API_KEY'),
  nvidiaKey: getPublicEnv('PUBLIC_NVIDIA_API_KEY'),
  minimaxKey: getPublicEnv('PUBLIC_MINIMAX_API_KEY'),
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const ALL_PLATFORMS = [
  'all',
  'xhs',
  'wechat',
  'youtube',
  'bilibili',
  'twitter',
  'telegram',
  'rss',
  'manual',
  'unknown',
]

const PLATFORM_PILL_LABELS = {
  all: 'scrapbook.platforms.all',
  xhs: 'scrapbook.platforms.xhs',
  wechat: 'scrapbook.platforms.wechat',
  youtube: 'scrapbook.platforms.youtube',
  bilibili: 'scrapbook.platforms.bilibili',
  twitter: 'scrapbook.platforms.twitter',
  telegram: 'scrapbook.platforms.telegram',
  rss: 'scrapbook.platforms.rss',
  manual: 'scrapbook.platforms.manual',
  unknown: 'scrapbook.platforms.unknown',
}

const PLATFORM_COLORS = {
  xhs: 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400',
  wechat: 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400',
  youtube: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300',
  bilibili: 'bg-pink-50 text-pink-600 dark:bg-pink-900/20 dark:text-pink-400',
  twitter: 'bg-sky-50 text-sky-600 dark:bg-sky-900/20 dark:text-sky-400',
  telegram: 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400',
  rss: 'bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400',
  manual: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
  unknown: 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500',
}

const stripGeneratedTitlePrefix = value => {
  if (!value) return ''
  const trimmed = String(value).trim()
  return trimmed.replace(/^(?:title|标题)\s*[:：-]\s*/i, '').trim() || trimmed
}

// ─────────────────────────────────────────────────────────────────────────────
// Model Config Panel (inside ScrapbookView header)
// ─────────────────────────────────────────────────────────────────────────────

const ModelConfigPanel = ({ isOpen, onClose }) => {
  const { t } = useTranslation()
  const initSettings = loadSettings()

  const [provider, setProvider] = useState(
    initSettings.scrapbookProvider || initSettings.defaultModelProvider || '',
  )
  const [model, setModel] = useState(initSettings.scrapbookModel || initSettings.defaultModel || '')
  const [modelSource, setModelSource] = useState('list')
  const [customModel, setCustomModel] = useState('')
  const [groupedModels, setGroupedModels] = useState({})
  const [availableProviders, setAvailableProviders] = useState([])
  const [isLoadingModels, setIsLoadingModels] = useState(false)

  useEffect(() => {
    if (isOpen) {
      const s = loadSettings()
      const keys = {
        gemini: s.googleApiKey,
        openai_compatibility: s.OpenAICompatibilityKey,
        siliconflow: s.SiliconFlowKey,
        glm: s.GlmKey,
        deepseek: s.DeepSeekKey,
        volcengine: s.VolcengineKey,
        modelscope: s.ModelScopeKey,
        kimi: s.KimiKey,
        nvidia: s.NvidiaKey,
        minimax: s.MinimaxKey,
      }
      const enabledProviders = PROVIDER_KEYS.filter(key => {
        const hasApiKey =
          keys[key] ||
          ENV_VARS[`${key}Key`] ||
          ENV_VARS[`${key}ApiKey`] ||
          (key === 'gemini' && ENV_VARS.googleApiKey) ||
          (key === 'openai_compatibility' && ENV_VARS.openAIKey)
        return hasApiKey
      })
      setAvailableProviders(enabledProviders)

      setProvider(s.scrapbookProvider || s.defaultModelProvider || '')
      setModel(s.scrapbookModel || s.defaultModel || '')
      setModelSource(s.scrapbookModelSource || 'list')
      setCustomModel(s.scrapbookModelSource === 'custom' ? s.scrapbookModel || '' : '')
    }
  }, [isOpen])

  useEffect(() => {
    if (isOpen && provider && provider !== '__none__' && !groupedModels[provider]) {
      const fetchProviderModels = async () => {
        setIsLoadingModels(true)
        const s = loadSettings()
        const keys = {
          gemini: s.googleApiKey,
          openai_compatibility: s.OpenAICompatibilityKey,
          openai_compatibility_url: s.OpenAICompatibilityUrl,
          siliconflow: s.SiliconFlowKey,
          glm: s.GlmKey,
          deepseek: s.DeepSeekKey,
          volcengine: s.VolcengineKey,
          modelscope: s.ModelScopeKey,
          kimi: s.KimiKey,
          nvidia: s.NvidiaKey,
          minimax: s.MinimaxKey,
        }
        const providerCreds = {
          gemini: { apiKey: keys.gemini },
          openai_compatibility: {
            apiKey: keys.openai_compatibility,
            baseUrl: keys.openai_compatibility_url,
          },
          siliconflow: { apiKey: keys.siliconflow, baseUrl: 'https://api.siliconflow.cn/v1' },
          glm: { apiKey: keys.glm },
          deepseek: { apiKey: keys.deepseek, baseUrl: 'https://api.deepseek.com/v1' },
          volcengine: {
            apiKey: keys.volcengine,
            baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
          },
          modelscope: { apiKey: keys.modelscope },
          kimi: { apiKey: keys.kimi },
          nvidia: { apiKey: keys.nvidia, baseUrl: 'https://integrate.api.nvidia.com/v1' },
          minimax: { apiKey: keys.minimax, baseUrl: 'https://api.minimax.io/v1' },
        }
        try {
          const models = await getModelsForProvider(provider, providerCreds[provider] || {})
          setGroupedModels(prev => ({
            ...prev,
            [provider]: models?.length ? models : FALLBACK_MODEL_OPTIONS[provider] || [],
          }))
        } catch {
          setGroupedModels(prev => ({
            ...prev,
            [provider]: FALLBACK_MODEL_OPTIONS[provider] || [],
          }))
        }
        setIsLoadingModels(false)
      }
      fetchProviderModels()
    }
  }, [isOpen, provider, groupedModels])

  const handleProviderChange = p => {
    setProvider(p)
    setModel('')
    setCustomModel('')
    setModelSource('list')
  }

  const modelsForProvider = groupedModels[provider] || []

  const handleSave = () => {
    const finalModel = modelSource === 'custom' ? customModel : model
    const newSettings = {
      scrapbookProvider: provider,
      scrapbookModel: finalModel,
      scrapbookModelSource: modelSource,
    }
    saveSettings(newSettings)
    saveRemoteSettings(newSettings)
    onClose()
  }

  const handleReset = () => {
    const newSettings = { scrapbookProvider: '', scrapbookModel: '', scrapbookModelSource: 'list' }
    saveSettings(newSettings)
    saveRemoteSettings(newSettings)
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t('settings.modelConfig')}</DialogTitle>
          <DialogDescription>
            {t('settings.modelConfigDesc', '为不同任务选择不同的模型。留空则继承全局默认模型。')}
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          <div className="space-y-4">
            {/* Provider */}
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold tracking-wide text-[var(--color-text-secondary)] uppercase">
                Provider
              </span>
              {availableProviders.length === 0 ? (
                <p className="py-1 text-xs text-amber-600 dark:text-amber-400">
                  {t('settings.noProvidersHint')}
                </p>
              ) : (
                <Select
                  value={provider || '__none__'}
                  onValueChange={val => handleProviderChange(val === '__none__' ? '' : val)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t('settings.inheritGlobal', '继承全局')}>
                      {provider ? (
                        <div className="flex items-center gap-3">
                          {renderProviderIcon(provider, { size: 16 })}
                          <span>{provider}</span>
                        </div>
                      ) : (
                        <span>{t('settings.inheritGlobal', '继承全局')}</span>
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">
                      <span className="text-[var(--color-text-secondary)]">
                        {t('settings.inheritGlobal', '继承全局')}
                      </span>
                    </SelectItem>
                    {availableProviders.map(p => (
                      <SelectItem key={p} value={p}>
                        <div className="flex items-center gap-3">
                          {renderProviderIcon(p, { size: 16 })}
                          <span>{p}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Model */}
            {provider && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold tracking-wide text-[var(--color-text-secondary)] uppercase">
                    Model
                  </span>
                  <button
                    onClick={() => setModelSource(s => (s === 'custom' ? 'list' : 'custom'))}
                    className="text-xs text-[var(--color-accent)] hover:underline"
                  >
                    {modelSource === 'custom'
                      ? t('settings.selectFromList', '从列表选择')
                      : t('settings.manualInput', '手动输入')}
                  </button>
                </div>
                {modelSource === 'custom' ? (
                  <Input
                    value={customModel}
                    onChange={e => setCustomModel(e.target.value)}
                    placeholder={t('settings.inputModelName', '输入 model 名称')}
                    className="w-full"
                  />
                ) : isLoadingModels ? (
                  <div className="flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm text-[var(--color-text-secondary)] shadow-sm">
                    <Loader2 size={16} className="animate-spin text-[var(--color-accent)]" />
                    {t('settings.loadingModels', '正在加载模型列表...')}
                  </div>
                ) : modelsForProvider.length === 0 ? (
                  <p className="py-2 text-xs text-[var(--color-text-tertiary)]">
                    {t('settings.noModelsAvailableHint', '暂无可用模型，点击「手动输入」')}
                  </p>
                ) : (
                  <Select
                    value={model || '__none__'}
                    onValueChange={val => setModel(val === '__none__' ? '' : val)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={t('settings.selectModel', '-- 选择模型 --')}>
                        {model ? (
                          <div className="flex items-center gap-2 truncate">
                            {getModelIcon(model) && (
                              <img
                                src={getModelIcon(model)}
                                alt=""
                                className={clsx('h-4 w-4 shrink-0', getModelIconClassName(model))}
                              />
                            )}
                            <span className="truncate">
                              {modelsForProvider.find(m => m.value === model)?.label || model}
                            </span>
                          </div>
                        ) : (
                          <span className="text-[var(--color-text-secondary)]">
                            {t('settings.selectModel', '-- 选择模型 --')}
                          </span>
                        )}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">
                        <span className="text-[var(--color-text-secondary)]">
                          {t('settings.selectModel', '-- 选择模型 --')}
                        </span>
                      </SelectItem>
                      {modelsForProvider.map(m => (
                        <SelectItem key={m.value} value={m.value}>
                          <div className="flex items-center gap-2 truncate">
                            {getModelIcon(m.value) && (
                              <img
                                src={getModelIcon(m.value)}
                                alt=""
                                className={clsx('h-4 w-4', getModelIconClassName(m.value))}
                              />
                            )}
                            <span className="truncate">{m.label || m.value}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="mt-4 flex w-full items-center gap-2 sm:justify-between">
          <Button variant="outline" onClick={handleReset} className="flex-1">
            {t('settings.resetToGlobal', '重置为全局')}
          </Button>
          <Button
            onClick={handleSave}
            disabled={isLoadingModels}
            className="flex-1 rounded-xl bg-zinc-900 text-white shadow-md hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {t('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Add Modal
// ─────────────────────────────────────────────────────────────────────────────

const AddModal = ({ isOpen, onClose, onAdded }) => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [tab, setTab] = useState('url') // 'url' | 'manual'
  const [url, setUrl] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [loadingMsg, setLoadingMsg] = useState('')
  const [error, setError] = useState('')

  // Manual mode
  const [manualTitle, setManualTitle] = useState('')
  const [manualSummary, setManualSummary] = useState('')
  const [manualContent, setManualContent] = useState('')
  const [manualPlatform, setManualPlatform] = useState('manual')
  const [manualTags, setManualTags] = useState('')

  const urlInputRef = useRef(null)

  useEffect(() => {
    if (isOpen) {
      setTab('url')
      setUrl('')
      setError('')
      setIsLoading(false)
      setLoadingMsg('')
      setManualTitle('')
      setManualSummary('')
      setManualContent('')
      setManualTags('')
      setManualPlatform('manual')
      setTimeout(() => urlInputRef.current?.focus(), 100)
    }
  }, [isOpen])

  const handleUrlSave = async () => {
    if (!url.trim()) return
    setIsLoading(true)
    setError('')
    setLoadingMsg(t('loadingContent', '正在获取内容...'))

    const modelConfig = resolveScrapbookModelConfig()
    if (!modelConfig.apiKey) {
      setError(t('scrapbook.generate.missingApiKey'))
      setIsLoading(false)
      setLoadingMsg('')
      return
    }
    setLoadingMsg(t('loadingContent', '正在读取网页内容...'))
    const { data, error: err } = await createScrapbookEntry({ source_url: url.trim() }, modelConfig)
    setIsLoading(false)
    setLoadingMsg('')
    if (err) {
      setError(err)
      return
    }
    const createdId = data?.item?.id || data?.id
    onAdded(data)
    onClose()
    if (createdId) {
      navigate({ to: '/scrapbook/$entryId', params: { entryId: createdId } })
    }
  }

  const handleManualSave = async () => {
    if (!manualTitle.trim() && !manualContent.trim()) {
      setError('请填写标题或内容')
      return
    }
    setIsLoading(true)
    setError('')
    const tags = manualTags
      .split(',')
      .map(t => t.trim())
      .filter(Boolean)
    const { data, error: err } = await createScrapbookEntry({
      title: manualTitle,
      summary: manualSummary,
      content: manualContent,
      platform: manualPlatform,
      tags,
    })
    setIsLoading(false)
    if (err) {
      setError(err)
      return
    }
    const createdId = data?.item?.id || data?.id
    onAdded(data)
    onClose()
    if (createdId) {
      navigate({ to: '/scrapbook/$entryId', params: { entryId: createdId } })
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && onClose()}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-[480px]">
        <DialogHeader className="border-b border-[var(--color-border)] px-5 py-4">
          <DialogTitle>{t('scrapbook.modal.saveText', '新建随手记')}</DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
          {[
            { id: 'url', label: t('scrapbook.modal.addFromUrl') },
            { id: 'manual', label: t('scrapbook.modal.addManual') },
          ].map(tObj => (
            <button
              key={tObj.id}
              onClick={() => {
                setTab(tObj.id)
                setError('')
              }}
              className={clsx(
                'flex-1 border-b-2 py-3 text-sm font-medium transition-colors',
                tab === tObj.id
                  ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                  : 'border-transparent text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]',
              )}
            >
              {tObj.label}
            </button>
          ))}
        </div>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto p-5">
          {tab === 'url' ? (
            <div className="space-y-3">
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-[var(--color-text-secondary)]">
                  {t('scrapbook.modal.urlLabel')}
                </span>
                <Input
                  ref={urlInputRef}
                  type="url"
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !isLoading && handleUrlSave()}
                  placeholder={t('scrapbook.modal.urlPlaceholder')}
                  disabled={isLoading}
                  className="w-full text-sm"
                />
              </div>
              <p className="text-xs text-[var(--color-text-tertiary)]">
                {t('scrapbook.modal.urlHint')}
              </p>
              {isLoading && (
                <div className="flex items-center gap-2 text-sm text-[var(--color-accent)]">
                  <Loader2 size={16} className="animate-spin" />
                  <span>{loadingMsg}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-[var(--color-text-secondary)]">
                  {t('platform', '平台')}
                </span>
                <Select value={manualPlatform} onValueChange={setManualPlatform}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PLATFORM_LABELS).map(([v, l]) => (
                      <SelectItem key={v} value={v}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-[var(--color-text-secondary)]">
                  {t('scrapbook.modal.titleLabel')}
                </span>
                <Input
                  type="text"
                  value={manualTitle}
                  onChange={e => setManualTitle(e.target.value)}
                  placeholder={t('scrapbook.modal.titlePlaceholder')}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-[var(--color-text-secondary)]">
                  {t('scrapbook.modal.summaryLabel')}
                </span>
                <Textarea
                  value={manualSummary}
                  onChange={e => setManualSummary(e.target.value)}
                  placeholder={t('scrapbook.modal.summaryPlaceholder')}
                  rows={3}
                  className="resize-none"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-[var(--color-text-secondary)]">
                  {t('scrapbook.modal.contentLabel')}
                </span>
                <Textarea
                  value={manualContent}
                  onChange={e => setManualContent(e.target.value)}
                  placeholder={t('scrapbook.modal.contentPlaceholder')}
                  rows={4}
                  className="resize-none"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-[var(--color-text-secondary)]">
                  {t('scrapbook.detail.tagsTitle')}
                </span>
                <Input
                  type="text"
                  value={manualTags}
                  onChange={e => setManualTags(e.target.value)}
                  placeholder="AI, tech, product"
                />
              </div>
            </div>
          )}

          {error && (
            <p className="rounded-lg bg-red-50/50 px-3 py-2.5 text-xs text-red-600 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </p>
          )}
        </div>

        <DialogFooter className="flex gap-2 border-t border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-5 py-4 sm:justify-end">
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            {t('scrapbook.modal.cancel')}
          </Button>
          <Button
            onClick={tab === 'url' ? handleUrlSave : handleManualSave}
            disabled={isLoading || (tab === 'url' && !url.trim())}
            className="flex items-center justify-center gap-2 rounded-xl bg-zinc-900 text-white shadow-md hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {isLoading ? <Loader2 size={15} className="animate-spin" /> : null}
            {isLoading ? t('scrapbook.detail.saving') : t('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry Card
// ─────────────────────────────────────────────────────────────────────────────

const getThumbnailUrl = entry => {
  if (entry.thumbnail) return entry.thumbnail

  // Try to extract YouTube video ID from source_url if platform is youtube
  if (entry.platform === 'youtube' && entry.source_url) {
    const ytMatch = entry.source_url.match(
      /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i,
    )
    if (ytMatch && ytMatch[1]) {
      // Use mqdefault.jpg which is widely available and good enough for small thumbnails
      return `https://img.youtube.com/vi/${ytMatch[1]}/mqdefault.jpg`
    }
  }

  // Try to extract first markdown image from content or summary
  const imgRegex = /!\[.*?\]\((.*?)\)/
  if (entry.content) {
    const match = entry.content.match(imgRegex)
    if (match && match[1]) return match[1]
  }
  if (entry.summary) {
    const match = entry.summary.match(imgRegex)
    if (match && match[1]) return match[1]
  }

  return null
}

const EntryCard = ({ entry, onDelete }) => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { showConfirmation } = useAppContext()
  const [isDeleting, setIsDeleting] = useState(false)
  const displayTitle = stripGeneratedTitlePrefix(entry.title) || t('scrapbook.detail.untitled')
  const actualThumbnail = getThumbnailUrl(entry)

  // Date format: "昨天 02:24" or "2026/2/23"
  const dateStr = entry.created_at
    ? new Date(entry.created_at).toLocaleDateString('zh-CN', {
        month: 'numeric',
        day: 'numeric',
        year: 'numeric',
      })
    : ''

  const handleDelete = e => {
    e.preventDefault()
    e.stopPropagation()
    showConfirmation({
      title: t('scrapbook.detail.deleteConfirmTitle'),
      message: t('scrapbook.detail.deleteConfirmMsg'),
      confirmText: t('scrapbook.detail.deleteConfirmBtn'),
      isDangerous: true,
      onConfirm: async () => {
        setIsDeleting(true)
        const { error } = await deleteScrapbookEntry(entry.id)
        if (!error) onDelete(entry.id)
        else setIsDeleting(false)
      },
    })
  }

  return (
    <div
      onClick={() => navigate({ to: '/scrapbook/$entryId', params: { entryId: entry.id } })}
      className="group relative flex cursor-pointer gap-4 rounded-3xl bg-white px-5 py-4 shadow-[0_2px_10px_rgba(0,0,0,0.04)] transition-all duration-300 hover:shadow-[0_4px_20px_rgba(0,0,0,0.08)] active:scale-[0.98] dark:bg-zinc-900/40"
    >
      {/* Delete button (hover only on desktop, or long press on mobile - simplified to top right absolute for now) */}
      <button
        onClick={handleDelete}
        disabled={isDeleting}
        className="absolute top-2 right-2 rounded-full bg-white/80 p-1.5 text-gray-400 opacity-0 shadow-sm backdrop-blur-md transition-all group-hover:opacity-100 hover:bg-red-50 hover:text-red-500 md:top-3 md:right-3 dark:bg-zinc-800/80 dark:hover:bg-red-900/30"
      >
        {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
      </button>

      {/* Left Content */}
      <div className="flex min-w-0 flex-1 flex-col py-1">
        <h3 className="mb-2 line-clamp-2 text-base leading-snug font-bold tracking-tight text-gray-900 dark:text-gray-100">
          {displayTitle}
        </h3>

        {/* Summary Snippet - hidden if very long, keep to 2 lines max */}
        {entry.summary && (
          <p className="mb-3 line-clamp-2 text-[13px] leading-relaxed text-gray-500 dark:text-gray-400">
            {/* Using simple string replace for demo, Streamdown might break inline flow */}
            {entry.summary.replace(/[#*`_]/g, '').slice(0, 100)}...
          </p>
        )}

        {/* Bottom Metadata */}
        <div className="mt-auto flex items-center gap-2 text-xs text-gray-400">
          <div
            className={clsx(
              'flex items-center gap-1 rounded-sm px-1 py-0.5 font-medium',
              PLATFORM_COLORS[entry.platform] || PLATFORM_COLORS.unknown,
            )}
          >
            {getPlatformLabel(entry.platform)}
          </div>
          <span>{dateStr}</span>
        </div>
      </div>

      {/* Right Thumbnail */}
      {actualThumbnail && (
        <div className="relative shrink-0 overflow-hidden rounded-xl object-cover">
          <img
            src={actualThumbnail}
            alt=""
            className="h-28 w-[84px] object-cover"
            onError={e => {
              e.target.style.display = 'none'
            }}
          />
          {/* Media type indicator bottom right corner */}
          <div className="absolute right-1.5 bottom-1.5 rounded-md bg-black/40 p-0.5 text-white backdrop-blur-md">
            {['youtube', 'bilibili'].includes(entry.platform) ? (
              <Video size={10} fill="currentColor" className="text-white/90" />
            ) : (
              <ImageIcon size={10} className="text-white/90" />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ScrapbookView (main)
// ─────────────────────────────────────────────────────────────────────────────

export default function ScrapbookView() {
  const { t } = useTranslation()
  const { isSidebarPinned, toggleSidebar } = useAppContext()
  const [entries, setEntries] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [activePlatform, setActivePlatform] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [showModelConfig, setShowModelConfig] = useState(false)
  const modelConfigRef = useRef(null)

  const fetchEntries = useCallback(async () => {
    setIsLoading(true)
    const { data } = await listScrapbookEntries({
      platform: activePlatform !== 'all' ? activePlatform : undefined,
    })
    setEntries(data)
    setIsLoading(false)
  }, [activePlatform])

  useEffect(() => {
    fetchEntries()
  }, [fetchEntries])

  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) return entries
    const q = searchQuery.toLowerCase()
    return entries.filter(
      e => (e.title || '').toLowerCase().includes(q) || (e.summary || '').toLowerCase().includes(q),
    )
  }, [entries, searchQuery])

  const handleAdded = useCallback(
    newEntry => {
      if (newEntry) setEntries(prev => [newEntry, ...prev])
      else fetchEntries()
    },
    [fetchEntries],
  )

  const handleDelete = useCallback(id => {
    setEntries(prev => prev.filter(e => e.id !== id))
  }, [])

  return (
    <div
      className={clsx(
        'relative flex h-full flex-col overflow-hidden bg-[#f4f4f4] transition-all duration-300 dark:bg-black',
        isSidebarPinned ? 'ml-0 sm:ml-72' : 'ml-0 sm:ml-16',
      )}
    >
      <div className="pointer-events-none absolute inset-0 z-0 opacity-40 dark:opacity-20">
        <ColorBendsBackground />
      </div>

      <div className="relative z-10 flex h-full flex-col">
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex-shrink-0 px-4 pt-4 md:px-5 md:py-4">
          {/* Top Bar: Menu/Title + Actions */}
          <div className="mb-4 flex items-center justify-between">
            {/* Left Box: Menu Toggle & Title */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => toggleSidebar()}
                aria-label="Open sidebar"
                className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-gray-200/50 bg-white/90 p-0 leading-none text-gray-600 shadow-sm backdrop-blur-xl transition-all hover:bg-white hover:shadow-md md:hidden dark:border-zinc-800/50 dark:bg-zinc-900/90 dark:text-gray-300 dark:hover:bg-zinc-900"
              >
                <Menu size={21} strokeWidth={2} />
              </button>

              {/* BookOpen icon visible on all screens */}
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 text-white shadow-sm shadow-blue-500/20">
                <BookOpen size={16} className="flex-shrink-0" />
              </div>

              <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
                {t('scrapbook.title', '随手记')}
              </h1>
            </div>

            {/* Right Box: Search, Settings etc. */}
            <div className="flex items-center gap-3">
              <button
                // We'll reveal the search bar conditionally in a real app,
                // but for now, we'll keep the design clean with just an icon
                onClick={() => {
                  /* handle search toggle */
                  const wrapper = document.getElementById('mobile-search-wrapper')
                  if (wrapper) wrapper.classList.toggle('hidden')
                }}
                className="hover:text-black dark:hover:text-white"
              >
                <Search size={20} strokeWidth={2.5} />
              </button>

              {/* Gear icon — model config */}
              <div className="relative">
                <button
                  onClick={() => setShowModelConfig(true)}
                  title="AI 模型配置"
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-all hover:bg-gray-200/50 hover:text-black md:h-8 md:w-8 md:rounded-lg dark:text-gray-300 dark:hover:bg-zinc-800 dark:hover:text-white"
                >
                  <Settings2 size={20} strokeWidth={2.5} />
                </button>
                <ModelConfigPanel
                  isOpen={showModelConfig}
                  onClose={() => setShowModelConfig(false)}
                />
              </div>
            </div>
          </div>

          {/* Hidden by default Mobile Search Bar */}
          <div id="mobile-search-wrapper" className="mb-4 hidden">
            <div className="relative">
              <Search
                size={16}
                className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={t('scrapbook.list.searchPlaceholder', '搜索标题、内容摘要、标签...')}
                className="w-full rounded-full bg-white py-2 pr-4 pl-9 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:ring-1 focus:ring-gray-300 focus:outline-none dark:bg-zinc-900 dark:text-white dark:focus:ring-zinc-700"
              />
            </div>
          </div>

          {/* Platform filter pills (Scrollable array) */}
          <div className="scrollbar-none -mx-4 flex snap-x snap-mandatory overflow-x-auto px-4 pb-2 md:-mx-5 md:px-5">
            <div className="flex gap-2">
              {ALL_PLATFORMS.map(p => {
                const isActive = activePlatform === p
                return (
                  <button
                    key={p}
                    onClick={() => setActivePlatform(p)}
                    className={clsx(
                      'flex shrink-0 snap-start items-center justify-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium shadow-[0_1px_4px_rgba(0,0,0,0.03)] transition-all',
                      isActive
                        ? 'bg-white text-gray-900 shadow-sm dark:bg-zinc-800 dark:text-white'
                        : 'bg-white/60 text-gray-500 hover:bg-white hover:text-gray-900 dark:bg-zinc-900/40 dark:text-gray-400 dark:hover:bg-zinc-800 dark:hover:text-white',
                    )}
                  >
                    {/* Add small icon proxy based on platform if needed, here just rendering label */}
                    {p === 'all' && <BookOpen size={12} />}
                    {t(PLATFORM_PILL_LABELS[p])}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* ── Content ────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-4 pb-24 sm:px-6">
          {isLoading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 size={32} className="animate-spin text-gray-400" />
            </div>
          ) : filteredEntries.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-sm dark:bg-zinc-900">
                <BookOpen size={28} className="text-gray-300" />
              </div>
              <p className="text-sm font-medium text-gray-500">
                {searchQuery ? t('scrapbook.list.emptySearch') : t('scrapbook.list.emptyHint')}
              </p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredEntries.map(entry => (
                <EntryCard key={entry.id} entry={entry} onDelete={handleDelete} />
              ))}
            </div>
          )}
        </div>

        {/* ── FAB ────────────────────────────────────────────────────────── */}
        <button
          onClick={() => setShowAddModal(true)}
          className="absolute right-6 bottom-8 flex h-14 w-14 items-center justify-center rounded-[24px] bg-white text-gray-900 shadow-[0_8px_30px_rgba(0,0,0,0.12)] transition-all hover:scale-105 active:scale-95 dark:bg-zinc-800 dark:text-gray-100"
        >
          {/* Plus icon inside a colorful gradient container or just styled colorful */}
          <div className="flex items-center gap-1.5 bg-gradient-to-r from-blue-500 via-purple-500 to-red-500 bg-clip-text text-transparent">
            <Plus size={28} className="text-black dark:text-white" strokeWidth={2} />
          </div>
        </button>

        {/* ── Add Modal ──────────────────────────────────────────────────── */}
        <AddModal
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          onAdded={handleAdded}
        />
      </div>
      {/* End of z-10 relative flex h-full flex-col */}
    </div>
  )
}
