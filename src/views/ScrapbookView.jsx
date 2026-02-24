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
  all: '全部',
  xhs: '小红书',
  wechat: '微信',
  youtube: 'YouTube',
  bilibili: 'Bilibili',
  twitter: 'X/推特',
  telegram: 'Telegram',
  rss: 'RSS',
  manual: '手动',
  unknown: '其他',
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
          <DialogTitle>随手记 AI 模型</DialogTitle>
          <DialogDescription>
            留空则继承全局默认模型。需先在「设置 → 账号」配置 API Key，对应 Provider 才会出现。
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
                  未检测到配置了 API Key 的 provider，请先在「设置 → 账号」中添加。
                </p>
              ) : (
                <Select
                  value={provider || '__none__'}
                  onValueChange={val => handleProviderChange(val === '__none__' ? '' : val)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="继承全局">
                      {provider ? (
                        <div className="flex items-center gap-3">
                          {renderProviderIcon(provider, { size: 16 })}
                          <span>{provider}</span>
                        </div>
                      ) : (
                        <span>继承全局</span>
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">
                      <span className="text-[var(--color-text-secondary)]">继承全局</span>
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
                    {modelSource === 'custom' ? '从列表选择' : '手动输入'}
                  </button>
                </div>
                {modelSource === 'custom' ? (
                  <Input
                    value={customModel}
                    onChange={e => setCustomModel(e.target.value)}
                    placeholder="输入 model 名称"
                    className="w-full"
                  />
                ) : isLoadingModels ? (
                  <div className="flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm text-[var(--color-text-secondary)] shadow-sm">
                    <Loader2 size={16} className="animate-spin text-[var(--color-accent)]" />
                    正在加载模型列表...
                  </div>
                ) : modelsForProvider.length === 0 ? (
                  <p className="py-2 text-xs text-[var(--color-text-tertiary)]">
                    暂无可用模型，点击「手动输入」
                  </p>
                ) : (
                  <Select
                    value={model || '__none__'}
                    onValueChange={val => setModel(val === '__none__' ? '' : val)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="-- 选择模型 --">
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
                          <span className="text-[var(--color-text-secondary)]">-- 选择模型 --</span>
                        )}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">
                        <span className="text-[var(--color-text-secondary)]">-- 选择模型 --</span>
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
            重置为全局
          </Button>
          <Button
            onClick={handleSave}
            disabled={isLoadingModels}
            className="flex-1 rounded-xl bg-zinc-900 text-white shadow-md hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            保存
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
    setLoadingMsg('正在获取内容...')

    const modelConfig = resolveScrapbookModelConfig()
    if (!modelConfig.apiKey) {
      setError('请先在设置中配置模型 API Key，或在右上角齿轮图标中覆盖模型配置')
      setIsLoading(false)
      setLoadingMsg('')
      return
    }
    setLoadingMsg('正在读取网页内容...')
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
          <DialogTitle>新建随手记</DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
          {[
            { id: 'url', label: '粘贴链接' },
            { id: 'manual', label: '手动输入' },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => {
                setTab(t.id)
                setError('')
              }}
              className={clsx(
                'flex-1 border-b-2 py-3 text-sm font-medium transition-colors',
                tab === t.id
                  ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                  : 'border-transparent text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto p-5">
          {tab === 'url' ? (
            <div className="space-y-3">
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-[var(--color-text-secondary)]">
                  内容链接
                </span>
                <Input
                  ref={urlInputRef}
                  type="url"
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !isLoading && handleUrlSave()}
                  placeholder="https://mp.weixin.qq.com/... 或任意链接"
                  disabled={isLoading}
                  className="w-full text-sm"
                />
              </div>
              <p className="text-xs text-[var(--color-text-tertiary)]">
                支持小红书、微信公众号、YouTube、Bilibili、Twitter 等。系统将自动抓取原文，随时通过
                AI 提取深度长摘要。
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
                <span className="text-xs font-medium text-[var(--color-text-secondary)]">平台</span>
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
                <span className="text-xs font-medium text-[var(--color-text-secondary)]">标题</span>
                <Input
                  type="text"
                  value={manualTitle}
                  onChange={e => setManualTitle(e.target.value)}
                  placeholder="文章标题"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-[var(--color-text-secondary)]">摘要</span>
                <Textarea
                  value={manualSummary}
                  onChange={e => setManualSummary(e.target.value)}
                  placeholder="2-3 句话概括核心内容"
                  rows={3}
                  className="resize-none"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-[var(--color-text-secondary)]">
                  原文内容（可选）
                </span>
                <Textarea
                  value={manualContent}
                  onChange={e => setManualContent(e.target.value)}
                  placeholder="粘贴原文..."
                  rows={4}
                  className="resize-none"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-[var(--color-text-secondary)]">
                  标签（逗号分隔）
                </span>
                <Input
                  type="text"
                  value={manualTags}
                  onChange={e => setManualTags(e.target.value)}
                  placeholder="AI, 技术, 产品"
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
            取消
          </Button>
          <Button
            onClick={tab === 'url' ? handleUrlSave : handleManualSave}
            disabled={isLoading || (tab === 'url' && !url.trim())}
            className="flex items-center justify-center gap-2 rounded-xl bg-zinc-900 text-white shadow-md hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {isLoading ? <Loader2 size={15} className="animate-spin" /> : null}
            {isLoading ? '处理中...' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry Card
// ─────────────────────────────────────────────────────────────────────────────

const EntryCard = ({ entry, onDelete }) => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { showConfirmation } = useAppContext()
  const [isDeleting, setIsDeleting] = useState(false)
  const tags = Array.isArray(entry.tags) ? entry.tags : []
  const displayTitle = stripGeneratedTitlePrefix(entry.title) || '无标题'
  const platformColor = PLATFORM_COLORS[entry.platform] || PLATFORM_COLORS.unknown
  const dateStr = entry.created_at
    ? new Date(entry.created_at).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
    : ''

  const handleDelete = e => {
    e.preventDefault()
    e.stopPropagation()
    showConfirmation({
      title: '删除随手记',
      message: `确定要删除「${entry.title || '这条随手记'}」吗？删除后无法恢复。`,
      confirmText: '删除',
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
      className="group relative flex cursor-pointer flex-col rounded-3xl border border-white/40 bg-white/40 px-5 py-3 shadow-sm backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:bg-white/60 hover:shadow-md dark:border-white/10 dark:bg-black/40 dark:hover:bg-black/50"
    >
      {/* Platform badge + date + delete in one row */}
      <div className="mb-2 flex items-center gap-2">
        <span className={clsx('rounded-full px-2 py-0.5 text-xs font-medium', platformColor)}>
          {getPlatformLabel(entry.platform)}
        </span>
        <span className="ml-auto text-xs text-[var(--color-text-tertiary)]">{dateStr}</span>
        <button
          onClick={handleDelete}
          disabled={isDeleting}
          className="rounded-full p-1 text-[var(--color-text-tertiary)] opacity-0 transition-all group-hover:opacity-100 hover:bg-red-100 hover:text-red-500 dark:hover:bg-red-900/30"
        >
          {isDeleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
        </button>
      </div>

      {/* Thumbnail */}
      {entry.thumbnail && (
        <img
          src={entry.thumbnail}
          alt=""
          className="mb-3 h-32 w-full rounded-xl object-cover"
          onError={e => {
            e.target.style.display = 'none'
          }}
        />
      )}

      {/* Title */}
      <h3 className="mb-2 line-clamp-2 text-[15px] leading-snug font-semibold tracking-tight text-[var(--color-text-primary)]">
        {entry.emoji ? `${entry.emoji} ` : ''}
        {displayTitle}
      </h3>

      {/* Summary */}
      {entry.summary && (
        <div className="relative mb-3 flex-1 rounded-xl border border-white/10 bg-gray-200/70 px-3 py-2.5 dark:border-white/10 dark:bg-white/5">
          {/* <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium tracking-[0.08em] text-[var(--color-text-tertiary)] uppercase">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]/80" />
            {t('common.summary')}
          </div> */}
          <div className="pointer-events-none max-h-[4.6rem] overflow-hidden text-xs leading-relaxed text-[var(--color-text-secondary)]">
            <div className="prose prose-sm dark:prose-invert max-w-none text-xs leading-relaxed text-[var(--color-text-secondary)] [&_blockquote]:my-1 [&_blockquote]:border-l-2 [&_blockquote]:pl-2 [&_h1]:my-1 [&_h1]:text-xs [&_h1]:font-medium [&_h2]:my-1 [&_h2]:text-xs [&_h2]:font-medium [&_h3]:my-1 [&_h3]:text-xs [&_h3]:font-medium [&_ol]:my-1 [&_ol]:pl-4 [&_p]:my-1 [&_pre]:hidden [&_strong]:font-medium [&_table]:hidden [&_ul]:my-1 [&_ul]:pl-4 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
              <Streamdown>{entry.summary}</Streamdown>
            </div>
          </div>
          {/* <div className="pointer-events-none absolute right-2 bottom-2 left-2 h-6 bg-gradient-to-t from-black/35 to-transparent dark:from-black/40" /> */}
        </div>
      )}

      {/* Footer */}
      <div className="mt-auto flex flex-wrap items-center gap-2">
        {tags.slice(0, 3).map(tag => (
          <span
            key={tag}
            className="inline-flex items-center gap-0.5 rounded-full bg-[var(--color-bg-primary)] px-2 py-0.5 text-xs text-[var(--color-text-tertiary)] ring-1 ring-[var(--color-border)]"
          >
            <Tag size={10} />
            {tag}
          </span>
        ))}
        {entry.source_url && (
          <a
            href={entry.source_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="ml-auto inline-flex items-center gap-1.5 rounded-xl bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white shadow-md transition-all hover:-translate-y-0.5 hover:bg-zinc-800 hover:shadow-lg dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            <Globe size={13} />
            <span>访问原文</span>
            <ExternalLink size={12} className="opacity-70" />
          </a>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ScrapbookView (main)
// ─────────────────────────────────────────────────────────────────────────────

export default function ScrapbookView() {
  const { isSidebarPinned } = useAppContext()
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
        'relative flex h-full flex-col overflow-hidden bg-[var(--color-bg-primary)] transition-all duration-300',
        isSidebarPinned ? 'ml-0 sm:ml-72' : 'ml-0 sm:ml-16',
      )}
    >
      <div className="pointer-events-none absolute inset-0 z-0 opacity-40 dark:opacity-20">
        <ColorBendsBackground />
      </div>

      <div className="relative z-10 flex h-full flex-col bg-white/40 backdrop-blur-3xl dark:bg-black/40">
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex-shrink-0 border-b border-black/5 px-6 py-5 dark:border-white/10">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--color-accent)] to-indigo-500 text-white shadow-[var(--color-accent)]/20 shadow-lg">
                <BookOpen size={20} className="flex-shrink-0" />
              </div>
              <h1 className="flex-shrink-0 text-2xl font-bold tracking-tight text-[var(--color-text-primary)]">
                随手记
              </h1>
            </div>

            {/* Search */}
            <div className="relative mx-6 hidden max-w-md flex-1 sm:block">
              <Search
                size={16}
                className="absolute top-1/2 left-3.5 -translate-y-1/2 text-[var(--color-text-tertiary)]"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="搜索标题或摘要..."
                className="w-full rounded-2xl border border-white/40 bg-white/50 py-2.5 pr-4 pl-10 text-sm text-[var(--color-text-primary)] shadow-inner backdrop-blur-md transition-all placeholder:text-[var(--color-text-tertiary)] hover:bg-white/80 focus:bg-white focus:ring-2 focus:ring-[var(--color-accent)]/30 focus:outline-none dark:border-white/10 dark:bg-black/40 dark:hover:bg-black/60 dark:focus:bg-black/80"
              />
            </div>

            {/* Gear icon — model config */}
            <div className="relative flex-shrink-0">
              <button
                onClick={() => setShowModelConfig(true)}
                title="AI 模型配置"
                className={clsx(
                  'flex h-10 w-10 items-center justify-center rounded-2xl border border-white/40 bg-white/40 shadow-sm backdrop-blur-md transition-all hover:-translate-y-0.5 hover:bg-white/80 dark:border-white/10 dark:bg-black/40 dark:hover:bg-black/60',
                  showModelConfig
                    ? 'text-[var(--color-accent)]'
                    : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]',
                )}
              >
                <Settings2 size={18} />
              </button>
              <ModelConfigPanel
                isOpen={showModelConfig}
                onClose={() => setShowModelConfig(false)}
              />
            </div>
          </div>

          <div className="relative mb-4 sm:hidden">
            <Search
              size={16}
              className="absolute top-1/2 left-3.5 -translate-y-1/2 text-[var(--color-text-tertiary)]"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="搜索标题或摘要..."
              className="w-full rounded-2xl border border-white/40 bg-white/50 py-2.5 pr-4 pl-10 text-sm text-[var(--color-text-primary)] shadow-inner backdrop-blur-md transition-all placeholder:text-[var(--color-text-tertiary)] hover:bg-white/80 focus:bg-white focus:ring-2 focus:ring-[var(--color-accent)]/30 focus:outline-none dark:border-white/10 dark:bg-black/40 dark:hover:bg-black/60 dark:focus:bg-black/80"
            />
          </div>

          {/* Platform filter pills */}
          <div className="flex flex-wrap gap-2">
            {ALL_PLATFORMS.map(p => (
              <button
                key={p}
                onClick={() => setActivePlatform(p)}
                className={clsx(
                  'rounded-full px-4 py-1.5 text-xs font-semibold tracking-wide shadow-sm transition-all',
                  activePlatform === p
                    ? 'bg-[var(--color-text-primary)] text-[var(--color-bg-primary)] ring-1 ring-black/5 dark:ring-white/10'
                    : 'bg-white/50 text-[var(--color-text-secondary)] ring-1 ring-black/5 hover:bg-white/80 hover:text-[var(--color-text-primary)] dark:bg-black/40 dark:ring-white/10 dark:hover:bg-black/60',
                )}
              >
                {PLATFORM_PILL_LABELS[p]}
              </button>
            ))}
          </div>
        </div>

        {/* ── Content ────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 py-6 pb-24">
          {isLoading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 size={32} className="animate-spin text-[var(--color-accent)]" />
            </div>
          ) : filteredEntries.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-white/50 shadow-sm backdrop-blur-md dark:bg-black/40">
                <BookOpen size={36} className="text-[var(--color-text-tertiary)] drop-shadow-sm" />
              </div>
              <p className="text-sm font-medium text-[var(--color-text-secondary)]">
                {searchQuery ? '没有找到匹配的内容' : '还没有随手记，点击右下角 + 开始收藏'}
              </p>
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredEntries.map(entry => (
                <EntryCard key={entry.id} entry={entry} onDelete={handleDelete} />
              ))}
            </div>
          )}
        </div>

        {/* ── FAB ────────────────────────────────────────────────────────── */}
        <button
          onClick={() => setShowAddModal(true)}
          className="absolute right-8 bottom-8 flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-900 text-white shadow-xl shadow-zinc-900/20 backdrop-blur-xl transition-all hover:-translate-y-1 hover:bg-zinc-800 hover:shadow-2xl active:scale-95 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          <Plus size={26} />
        </button>

        {/* ── Add Modal ──────────────────────────────────────────────────── */}
        <AddModal
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          onAdded={handleAdded}
        />
      </div>
    </div>
  )
}
