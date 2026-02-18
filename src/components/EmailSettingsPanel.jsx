/**
 * EmailSettingsPanel — IMAP email configuration panel for SettingsModal.
 *
 * Supports Gmail, Outlook, QQ Mail, 163 Mail via IMAP + App Password.
 * No OAuth2 or Google Cloud Console setup required.
 *
 * Flow:
 *  1. User selects provider (Gmail / Outlook / QQ / 163)
 *  2. User enters email address + App Password
 *  3. Click "Connect" → POST /api/email/connect → backend tests IMAP login
 *  4. On success, show poll interval + summary model config
 *  5. Save settings → PUT /api/email/config
 */

import {
  CheckCircle,
  ExternalLink,
  Loader2,
  Mail,
  RefreshCw,
  Trash2,
  ChevronDown,
} from 'lucide-react'
import { useCallback, useEffect, useState, useMemo } from 'react'
import { loadSettings } from '../lib/settings'
import { getModelsForProvider } from '../lib/models_api'
import { PROVIDER_KEYS } from '../lib/modelConstants'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { renderProviderIcon } from '../lib/modelIcons'

// Provider to settings key mapping
const PROVIDER_TO_KEY = {
  openai: 'OpenAICompatibilityKey',
  openai_compatibility: 'OpenAICompatibilityKey',
  siliconflow: 'SiliconFlowKey',
  glm: 'GlmKey',
  modelscope: 'ModelScopeKey',
  kimi: 'KimiKey',
  gemini: 'googleApiKey',
  nvidia: 'NvidiaKey',
  minimax: 'MinimaxKey',
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

const buildUrl = (backendUrl, path, params = {}) => {
  const url = new URL(`${backendUrl}${path}`)
  const settings = loadSettings()
  const dbProvider = settings.databaseProvider || ''
  if (dbProvider) url.searchParams.set('dbProvider', dbProvider)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return url.toString()
}

const fetchConfig = async backendUrl => {
  const res = await fetch(buildUrl(backendUrl, '/api/email/config'))
  if (!res.ok) return null
  const data = await res.json()
  return data.config || null
}

const connectEmail = async (backendUrl, payload) => {
  const res = await fetch(buildUrl(backendUrl, '/api/email/connect'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.detail || `连接失败: ${res.status}`)
  return data
}

const saveConfig = async (backendUrl, payload) => {
  const res = await fetch(buildUrl(backendUrl, '/api/email/config'), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.detail || `保存失败: ${res.status}`)
  return data
}

const deleteConfig = async backendUrl => {
  const res = await fetch(buildUrl(backendUrl, '/api/email/config'), { method: 'DELETE' })
  if (!res.ok) throw new Error(`删除失败: ${res.status}`)
}

const triggerPoll = async backendUrl => {
  const res = await fetch(buildUrl(backendUrl, '/api/email/poll'), { method: 'POST' })
  const data = await res.json()
  if (!res.ok) throw new Error(data.detail || `同步失败: ${res.status}`)
  return data
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROVIDERS = [
  {
    id: 'gmail',
    label: 'Gmail',
    hint: 'myaccount.google.com/apppasswords',
    hintUrl: 'https://myaccount.google.com/apppasswords',
    hintText: '需要开启两步验证，然后生成"应用专用密码"',
  },
  {
    id: 'outlook',
    label: 'Outlook / Hotmail',
    hint: 'account.microsoft.com/security',
    hintUrl: 'https://account.microsoft.com/security',
    hintText: '在 Microsoft 账户安全设置中生成应用密码',
  },
  {
    id: 'qq',
    label: 'QQ 邮箱',
    hint: 'mail.qq.com → 设置 → 账户 → IMAP/SMTP',
    hintUrl: 'https://mail.qq.com',
    hintText: '在 QQ 邮箱设置中开启 IMAP 并生成授权码',
  },
  {
    id: '163',
    label: '163 邮箱',
    hint: 'mail.163.com → 设置 → POP3/SMTP/IMAP',
    hintUrl: 'https://mail.163.com',
    hintText: '在 163 邮箱设置中开启 IMAP 并生成授权码',
  },
]

const POLL_INTERVAL_OPTIONS = [
  { label: '5 分钟', value: 5 },
  { label: '15 分钟', value: 15 },
  { label: '30 分钟', value: 30 },
  { label: '1 小时', value: 60 },
  { label: '2 小时', value: 120 },
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const EmailSettingsPanel = ({ backendUrl }) => {
  const [config, setConfig] = useState(null)
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [polling, setPolling] = useState(false)
  const [error, setError] = useState(null)
  const [successMsg, setSuccessMsg] = useState(null)

  // Connect form state
  const [provider, setProvider] = useState('gmail')
  const [emailAddr, setEmailAddr] = useState('')
  const [appPassword, setAppPassword] = useState('')

  // Settings form state
  const [pollInterval, setPollInterval] = useState(15)
  const [summaryProvider, setSummaryProvider] = useState('openai')
  const [summaryModel, setSummaryModel] = useState('gpt-4o-mini')
  const [availableModels, setAvailableModels] = useState([])
  const [fetchingModels, setFetchingModels] = useState(false)

  const globalSettings = useMemo(() => loadSettings(), [])

  // Filter providers that have a configured API key
  const enabledSummaryProviders = useMemo(() => {
    return PROVIDER_KEYS.filter(pk => {
      const keyName = PROVIDER_TO_KEY[pk]
      return !!globalSettings[keyName]
    })
  }, [globalSettings])

  const selectedProvider = PROVIDERS.find(p => p.id === provider) || PROVIDERS[0]

  // Load models when provider changes
  useEffect(() => {
    let active = true
    const fetchModels = async () => {
      if (!summaryProvider) return
      setFetchingModels(true)
      try {
        const apiKey = globalSettings[PROVIDER_TO_KEY[summaryProvider]]
        const models = await getModelsForProvider(summaryProvider, { apiKey })
        if (active) {
          setAvailableModels(models || [])
          // If current model not in list, pick first one
          if (models?.length > 0 && !models.find(m => m.value === summaryModel)) {
            // setSummaryModel(models[0].value) // Don't auto-set to avoid overriding DB value on load
          }
        }
      } catch (err) {
        console.error('Failed to fetch models:', err)
      } finally {
        if (active) setFetchingModels(false)
      }
    }
    fetchModels()
    return () => {
      active = false
    }
  }, [summaryProvider, globalSettings])

  // Load existing config on mount
  const loadConfig = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchConfig(backendUrl)
      if (data) {
        setConfig(data)
        setPollInterval(data.poll_interval_minutes ?? 15)
        setSummaryProvider(data.summary_provider ?? 'openai')
        setSummaryModel(data.summary_model ?? 'gpt-4o-mini')
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [backendUrl])

  useEffect(() => {
    loadConfig()
  }, [loadConfig])

  // Test IMAP credentials and save config
  const handleConnect = async () => {
    if (!emailAddr.trim() || !appPassword.trim()) {
      setError('请填写邮箱地址和应用专用密码')
      return
    }
    setConnecting(true)
    setError(null)
    try {
      await connectEmail(backendUrl, {
        provider,
        email: emailAddr.trim(),
        app_password: appPassword.trim(),
        poll_interval_minutes: pollInterval,
        summary_provider: summaryProvider,
        summary_model: summaryModel,
      })
      await loadConfig()
      setSuccessMsg('邮箱连接成功！')
      setTimeout(() => setSuccessMsg(null), 3000)
    } catch (e) {
      setError(e.message)
    } finally {
      setConnecting(false)
    }
  }

  // Save settings only (no re-authentication)
  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      await saveConfig(backendUrl, {
        poll_interval_minutes: pollInterval,
        summary_provider: summaryProvider,
        summary_model: summaryModel,
      })
      setSuccessMsg('设置已保存！')
      setTimeout(() => setSuccessMsg(null), 2000)
      await loadConfig()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  // Manually trigger a poll
  const handlePoll = async () => {
    setPolling(true)
    setError(null)
    setSuccessMsg(null)
    try {
      const result = await triggerPoll(backendUrl)
      setSuccessMsg(`同步完成！抓取到 ${result.polled || 0} 个账号。`)
      setTimeout(() => setSuccessMsg(null), 3000)
    } catch (e) {
      setError(e.message)
    } finally {
      setPolling(false)
    }
  }

  // Disconnect
  const handleDisconnect = async () => {
    if (!window.confirm('确认断开邮箱连接？这将停止邮件通知。')) return
    setSaving(true)
    setError(null)
    try {
      await deleteConfig(backendUrl)
      setConfig(null)
      setEmailAddr('')
      setAppPassword('')
      setSuccessMsg('已断开邮箱连接')
      setTimeout(() => setSuccessMsg(null), 2000)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={24} className="animate-spin text-gray-400" />
      </div>
    )
  }

  const isConnected = Boolean(config?.email)

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h3 className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
          <Mail size={18} className="text-blue-500" />
          邮件通知
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          连接邮箱账号，Qurio 会定时拉取新邮件并用 AI 生成摘要推送为通知。使用 IMAP
          协议，需要应用专用密码（非登录密码）。
        </p>
      </div>

      {/* Connection status */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-9 w-9 items-center justify-center rounded-full ${
                isConnected
                  ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
                  : 'bg-gray-100 text-gray-400 dark:bg-zinc-800 dark:text-zinc-500'
              }`}
            >
              <Mail size={18} />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {isConnected ? '邮箱已连接' : '邮箱未连接'}
              </p>
              {isConnected && config?.email && (
                <p className="text-xs text-gray-500 dark:text-zinc-400">{config.email}</p>
              )}
            </div>
          </div>

          {isConnected && (
            <div className="flex items-center gap-2">
              <button
                onClick={handlePoll}
                disabled={polling || saving}
                className="border-primary-200 text-primary-600 hover:bg-primary-50 dark:border-primary-900/40 dark:text-primary-400 dark:hover:bg-primary-900/20 flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
              >
                {polling ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                立即同步
              </button>
              <button
                onClick={loadConfig}
                disabled={saving || polling}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-zinc-700 dark:text-gray-300 dark:hover:bg-zinc-800"
              >
                刷新配置
              </button>
              <button
                onClick={handleDisconnect}
                disabled={saving || polling}
                className="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-900/30 dark:text-red-400 dark:hover:bg-red-900/20"
              >
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                断开
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Connect form — only show when not connected */}
      {!isConnected && (
        <div className="flex flex-col gap-5 rounded-xl border border-gray-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">连接邮箱</p>

          {/* Provider selector */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-gray-700 dark:text-gray-300">邮箱类型</label>
            <div className="flex flex-wrap gap-2">
              {PROVIDERS.map(p => (
                <button
                  key={p.id}
                  onClick={() => setProvider(p.id)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                    provider === p.id
                      ? 'border-primary-500 bg-primary-50 text-primary-600 dark:border-primary-400 dark:bg-primary-900/20 dark:text-primary-400'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-zinc-700 dark:text-gray-300 dark:hover:bg-zinc-800'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Provider hint */}
          <div className="rounded-lg bg-blue-50 px-3 py-2.5 dark:bg-blue-950/30">
            <p className="text-xs text-blue-700 dark:text-blue-300">{selectedProvider.hintText}</p>
            <a
              href={selectedProvider.hintUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-1 flex items-center gap-1 text-xs text-blue-500 hover:underline"
            >
              <ExternalLink size={11} />
              {selectedProvider.hint}
            </a>
          </div>

          {/* Email + password inputs */}
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                邮箱地址
              </label>
              <input
                type="email"
                value={emailAddr}
                onChange={e => setEmailAddr(e.target.value)}
                placeholder="例如: yourname@gmail.com"
                className="focus:ring-primary-500/20 focus:border-primary-500 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 transition-all focus:ring-2 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-100 dark:placeholder-zinc-600"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                应用专用密码
                <span className="ml-1 font-normal text-gray-400">（非登录密码）</span>
              </label>
              <input
                type="password"
                value={appPassword}
                onChange={e => setAppPassword(e.target.value)}
                placeholder="xxxx xxxx xxxx xxxx"
                className="focus:ring-primary-500/20 focus:border-primary-500 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 transition-all focus:ring-2 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-100 dark:placeholder-zinc-600"
              />
            </div>
          </div>

          <button
            onClick={handleConnect}
            disabled={connecting || !emailAddr.trim() || !appPassword.trim()}
            className="flex items-center justify-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {connecting ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
            {connecting ? '正在连接…' : '连接邮箱'}
          </button>
        </div>
      )}

      {/* Settings — only show when connected */}
      {isConnected && (
        <>
          {/* Poll Interval */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-gray-900 dark:text-white">检查频率</label>
            <p className="text-xs text-gray-500 dark:text-gray-400">Qurio 多久检查一次新邮件</p>
            <div className="flex flex-wrap gap-2">
              {POLL_INTERVAL_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setPollInterval(opt.value)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                    pollInterval === opt.value
                      ? 'border-primary-500 bg-primary-50 text-primary-600 dark:border-primary-400 dark:bg-primary-900/20 dark:text-primary-400'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-zinc-700 dark:text-gray-300 dark:hover:bg-zinc-800'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Summary Model Selection */}
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-semibold text-gray-900 dark:text-white">
                AI 摘要模型
              </label>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                用于生成邮件摘要的模型，复用全局设置中的 API Key。
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                  Provider
                </label>
                <Select value={summaryProvider} onValueChange={setSummaryProvider}>
                  <SelectTrigger className="w-full border-gray-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
                    <SelectValue placeholder="选择厂商" />
                  </SelectTrigger>
                  <SelectContent className="dark:border-zinc-700 dark:bg-zinc-900">
                    {enabledSummaryProviders.map(pk => (
                      <SelectItem key={pk} value={pk} className="dark:hover:bg-zinc-800">
                        <div className="flex items-center gap-2">
                          {renderProviderIcon(pk, 'h-4 w-4')}
                          <span className="capitalize">{pk.replace('_', ' ')}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                  Model
                </label>
                <Select value={summaryModel} onValueChange={setSummaryModel}>
                  <SelectTrigger className="w-full border-gray-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
                    {fetchingModels ? (
                      <div className="flex items-center gap-2">
                        <Loader2 size={13} className="animate-spin" />
                        <span>加载中...</span>
                      </div>
                    ) : (
                      <SelectValue placeholder="选择模型" />
                    )}
                  </SelectTrigger>
                  <SelectContent className="dark:border-zinc-700 dark:bg-zinc-900">
                    {availableModels.length > 0 ? (
                      availableModels.map(m => (
                        <SelectItem
                          key={m.value}
                          value={m.value}
                          className="dark:hover:bg-zinc-800"
                        >
                          {m.label}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value={summaryModel} disabled>
                        {summaryModel || '无可用模型'}
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {!enabledSummaryProviders.includes(summaryProvider) && (
              <p className="text-[10px] text-amber-600 dark:text-amber-400">
                提示：该厂商尚未在全局设置中配置 API Key。请先前往全局设置中完成配置。
              </p>
            )}
          </div>

          {/* Save Button */}
          <div className="flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-primary-500 flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              保存设置
            </button>
          </div>
        </>
      )}

      {/* Error / Success messages */}
      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </p>
      )}
      {successMsg && (
        <p className="flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400">
          <CheckCircle size={13} />
          {successMsg}
        </p>
      )}
    </div>
  )
}

export default EmailSettingsPanel
