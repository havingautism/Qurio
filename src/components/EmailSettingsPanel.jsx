/**
 * EmailSettingsPanel — IMAP email configuration panel for SettingsModal.
 *
 * Supports multiple email accounts: Gmail, Outlook, QQ Mail, 163 Mail via IMAP + App Password.
 * No OAuth2 or Google Cloud Console setup required.
 *
 * Features:
 *  - List all connected email accounts
 *  - Add new email account
 *  - Edit per-account settings (poll interval, summary model)
 *  - Delete individual accounts
 */

import {
  CheckCircle,
  ExternalLink,
  Loader2,
  Mail,
  Plus,
  RefreshCw,
  Trash2,
  Settings,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import { loadSettings } from '../lib/settings'
import { getModelsForProvider } from '../lib/models_api'
import { PROVIDER_KEYS, FALLBACK_MODEL_OPTIONS } from '../lib/modelConstants'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { renderProviderIcon, getModelIcon, getModelIconClassName } from '../lib/modelIcons'

// Provider to settings key mapping
const PROVIDER_TO_KEY = {
  openai: 'OpenAICompatibilityKey',
  openai_compatibility: 'OpenAICompatibilityKey',
  siliconflow: 'SiliconFlowKey',
  glm: 'GlmKey',
  deepseek: 'DeepSeekKey',
  volcengine: 'VolcengineKey',
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
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return url.toString()
}

const fetchConfigs = async backendUrl => {
  const res = await fetch(buildUrl(backendUrl, '/api/email/configs'))
  if (!res.ok) return []
  const data = await res.json()
  return data.configs || []
}

const connectEmail = async (backendUrl, payload) => {
  const res = await fetch(buildUrl(backendUrl, '/api/email/connect'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.detail || `Connection failed: ${res.status}`)
  return data
}

const saveConfig = async (backendUrl, configId, payload) => {
  const res = await fetch(buildUrl(backendUrl, `/api/email/config/${configId}`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.detail || `Save failed: ${res.status}`)
  return data
}

const deleteConfig = async (backendUrl, configId) => {
  const res = await fetch(buildUrl(backendUrl, `/api/email/config/${configId}`), {
    method: 'DELETE',
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.detail || `Delete failed: ${res.status}`)
  }
}

const triggerPoll = async backendUrl => {
  const res = await fetch(buildUrl(backendUrl, '/api/email/poll'), { method: 'POST' })
  const data = await res.json()
  if (!res.ok) throw new Error(data.detail || `Sync failed: ${res.status}`)
  return data
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const EmailSettingsPanel = ({ backendUrl }) => {
  const { t } = useTranslation()
  const globalSettings = useMemo(() => loadSettings(), [])

  const [configs, setConfigs] = useState([])
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [savingId, setSavingId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [polling, setPolling] = useState(false)
  const [error, setError] = useState(null)
  const [successMsg, setSuccessMsg] = useState(null)

  // Add form state
  const [showAddForm, setShowAddForm] = useState(false)
  const [provider, setProvider] = useState('gmail')
  const [emailAddr, setEmailAddr] = useState('')
  const [appPassword, setAppPassword] = useState('')
  const [addSummaryProvider, setAddSummaryProvider] = useState(
    globalSettings.liteModelProvider || 'openai_compatibility',
  )
  const [addSummaryModel, setAddSummaryModel] = useState(globalSettings.liteModel || 'gpt-4o-mini')
  const [addModelSource, setAddModelSource] = useState('list')
  const [addCustomModel, setAddCustomModel] = useState('')
  const [addAvailableModels, setAddAvailableModels] = useState([])
  const [addFetchingModels, setAddFetchingModels] = useState(false)

  // Edit form state
  const [editingConfig, setEditingConfig] = useState(null)
  const [editPollInterval, setEditPollInterval] = useState(15)
  const [editSummaryProvider, setEditSummaryProvider] = useState('openai_compatibility')
  const [editSummaryModel, setEditSummaryModel] = useState('gpt-4o-mini')
  const [editModelSource, setEditModelSource] = useState('list')
  const [editCustomModel, setEditCustomModel] = useState('')
  const [availableModels, setAvailableModels] = useState([])
  const [fetchingModels, setFetchingModels] = useState(false)

  // Provider definitions with i18n keys
  const PROVIDERS = useMemo(
    () => [
      {
        id: 'gmail',
        label: t('settings.email.providers.gmail.label'),
        hint: t('settings.email.providers.gmail.hint'),
        hintUrl: 'https://myaccount.google.com/apppasswords',
        hintText: t('settings.email.providers.gmail.hintText'),
      },
      {
        id: 'outlook',
        label: t('settings.email.providers.outlook.label'),
        hint: t('settings.email.providers.outlook.hint'),
        hintUrl: 'https://account.microsoft.com/security',
        hintText: t('settings.email.providers.outlook.hintText'),
      },
      {
        id: 'qq',
        label: t('settings.email.providers.qq.label'),
        hint: t('settings.email.providers.qq.hint'),
        hintUrl: 'https://mail.qq.com',
        hintText: t('settings.email.providers.qq.hintText'),
      },
      {
        id: '163',
        label: t('settings.email.providers.163.label'),
        hint: t('settings.email.providers.163.hint'),
        hintUrl: 'https://mail.163.com',
        hintText: t('settings.email.providers.163.hintText'),
      },
    ],
    [t],
  )

  // Poll interval options with i18n
  const POLL_INTERVAL_OPTIONS = useMemo(
    () => [
      { label: t('settings.email.pollIntervals.5min'), value: 5 },
      { label: t('settings.email.pollIntervals.15min'), value: 15 },
      { label: t('settings.email.pollIntervals.30min'), value: 30 },
      { label: t('settings.email.pollIntervals.1hour'), value: 60 },
      { label: t('settings.email.pollIntervals.2hours'), value: 120 },
    ],
    [t],
  )

  // Filter providers that have a configured API key
  const enabledSummaryProviders = useMemo(() => {
    return PROVIDER_KEYS.filter(pk => {
      const keyName = PROVIDER_TO_KEY[pk]
      return !!globalSettings[keyName]
    })
  }, [globalSettings])

  const selectedProvider = PROVIDERS.find(p => p.id === provider) || PROVIDERS[0]

  // Load models when summary provider changes (for edit form)
  useEffect(() => {
    let active = true
    const fetchModels = async () => {
      if (!editSummaryProvider) return
      setFetchingModels(true)
      try {
        const apiKey = globalSettings[PROVIDER_TO_KEY[editSummaryProvider]]
        const models = await getModelsForProvider(editSummaryProvider, { apiKey })
        if (active) {
          // Use fallback if models are empty
          const finalModels =
            models?.length > 0 ? models : FALLBACK_MODEL_OPTIONS[editSummaryProvider] || []
          setAvailableModels(finalModels)
        }
      } catch (err) {
        console.error('Failed to fetch models:', err)
        if (active) {
          // Use fallback on error
          setAvailableModels(FALLBACK_MODEL_OPTIONS[editSummaryProvider] || [])
        }
      } finally {
        if (active) setFetchingModels(false)
      }
    }
    fetchModels()
    return () => {
      active = false
    }
  }, [editSummaryProvider, globalSettings])

  // Load models when add form summary provider changes
  useEffect(() => {
    let active = true
    const fetchModels = async () => {
      if (!addSummaryProvider) return
      setAddFetchingModels(true)
      try {
        const apiKey = globalSettings[PROVIDER_TO_KEY[addSummaryProvider]]
        const models = await getModelsForProvider(addSummaryProvider, { apiKey })
        if (active) {
          // Use fallback if models are empty
          const finalModels =
            models?.length > 0 ? models : FALLBACK_MODEL_OPTIONS[addSummaryProvider] || []
          setAddAvailableModels(finalModels)
        }
      } catch (err) {
        console.error('Failed to fetch models for add form:', err)
        if (active) {
          // Use fallback on error
          setAddAvailableModels(FALLBACK_MODEL_OPTIONS[addSummaryProvider] || [])
        }
      } finally {
        if (active) setAddFetchingModels(false)
      }
    }
    fetchModels()
    return () => {
      active = false
    }
  }, [addSummaryProvider, globalSettings])

  // Load existing configs on mount
  const loadConfigs = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchConfigs(backendUrl)
      setConfigs(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [backendUrl])

  useEffect(() => {
    loadConfigs()
  }, [loadConfigs])

  // Validate add form
  const isAddFormValid = useMemo(() => {
    const hasBasicFields = emailAddr.trim() && appPassword.trim() && addSummaryProvider
    const hasModel = addModelSource === 'list' ? !!addSummaryModel : !!addCustomModel.trim()
    return hasBasicFields && hasModel
  }, [emailAddr, appPassword, addSummaryProvider, addModelSource, addSummaryModel, addCustomModel])

  // Validate edit form
  const isEditFormValid = useMemo(() => {
    const hasProvider = !!editSummaryProvider
    const hasModel = editModelSource === 'list' ? !!editSummaryModel : !!editCustomModel.trim()
    return hasProvider && hasModel
  }, [editSummaryProvider, editModelSource, editSummaryModel, editCustomModel])

  // Add new email account
  const handleConnect = async () => {
    if (!isAddFormValid) {
      setError(t('settings.email.errors.emailRequired'))
      return
    }
    setConnecting(true)
    setError(null)
    const finalModel = addModelSource === 'list' ? addSummaryModel : addCustomModel
    try {
      await connectEmail(backendUrl, {
        provider,
        email: emailAddr.trim(),
        app_password: appPassword.trim(),
        poll_interval_minutes: 15,
        summary_provider: addSummaryProvider,
        summary_model: finalModel,
      })
      await loadConfigs()
      setShowAddForm(false)
      setEmailAddr('')
      setAppPassword('')
      setAddModelSource('list')
      setAddCustomModel('')
      // Reset to global defaults
      setAddSummaryProvider(globalSettings.liteModelProvider || 'openai_compatibility')
      setAddSummaryModel(globalSettings.liteModel || 'gpt-4o-mini')
      setSuccessMsg(t('settings.email.success.connected'))
      setTimeout(() => setSuccessMsg(null), 3000)
    } catch (e) {
      setError(t('settings.email.errors.connectFailed', { message: e.message }))
    } finally {
      setConnecting(false)
    }
  }

  // Start editing a config
  const startEdit = config => {
    setEditingConfig(config)
    setEditPollInterval(config.poll_interval_minutes ?? 15)
    setEditSummaryProvider(config.summary_provider ?? 'openai_compatibility')
    const modelValue = config.summary_model ?? 'gpt-4o-mini'
    setEditSummaryModel(modelValue)
    // Detect if model is from list or custom (will be verified when models load)
    setEditModelSource('list')
    setEditCustomModel('')
  }

  // Cancel editing
  const cancelEdit = () => {
    setEditingConfig(null)
  }

  // Save config edits
  const handleSaveEdit = async () => {
    if (!editingConfig || !isEditFormValid) {
      setError(t('settings.email.errors.modelRequired'))
      return
    }
    setSavingId(editingConfig.id)
    setError(null)
    const finalModel = editModelSource === 'list' ? editSummaryModel : editCustomModel
    try {
      await saveConfig(backendUrl, editingConfig.id, {
        poll_interval_minutes: editPollInterval,
        summary_provider: editSummaryProvider,
        summary_model: finalModel,
      })
      await loadConfigs()
      setEditingConfig(null)
      setSuccessMsg(t('settings.email.success.saved'))
      setTimeout(() => setSuccessMsg(null), 2000)
    } catch (e) {
      setError(t('settings.email.errors.saveFailed', { message: e.message }))
    } finally {
      setSavingId(null)
    }
  }

  // Delete a config
  const handleDelete = async config => {
    if (!window.confirm(t('settings.email.disconnectConfirm', { email: config.email }))) return
    setDeletingId(config.id)
    setError(null)
    try {
      await deleteConfig(backendUrl, config.id)
      await loadConfigs()
      setSuccessMsg(t('settings.email.disconnected'))
      setTimeout(() => setSuccessMsg(null), 2000)
    } catch (e) {
      setError(t('settings.email.errors.deleteFailed', { message: e.message }))
    } finally {
      setDeletingId(null)
    }
  }

  // Manually trigger a poll
  const handlePoll = async () => {
    setPolling(true)
    setError(null)
    setSuccessMsg(null)
    try {
      const result = await triggerPoll(backendUrl)
      setSuccessMsg(t('settings.email.syncComplete', { count: result.polled || 0 }))
      setTimeout(() => setSuccessMsg(null), 3000)
    } catch (e) {
      setError(t('settings.email.errors.syncFailed', { message: e.message }))
    } finally {
      setPolling(false)
    }
  }

  // Provider badge component
  const ProviderBadge = ({ providerId }) => {
    const providerData = PROVIDERS.find(p => p.id === providerId)
    const colors = {
      gmail: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
      outlook: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
      qq: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
      163: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    }
    return (
      <span
        className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${colors[providerId] || colors.gmail}`}
      >
        {providerData?.label || providerId}
      </span>
    )
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

  return (
    <div className="flex w-full flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h3 className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
          <Mail size={18} className="text-blue-500" />
          {t('settings.email.title')}
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {t('settings.email.description')}
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-blue-600/80 dark:text-blue-400/70">
          {t('settings.email.limitHint')}
        </p>
      </div>

      {/* Connected accounts list */}
      {configs.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-900 dark:text-white">
              {t('settings.email.connectedAccounts')} ({configs.length})
            </span>
            <button
              onClick={handlePoll}
              disabled={polling}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-zinc-700 dark:text-gray-300 dark:hover:bg-zinc-800"
            >
              {polling ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              {polling ? t('settings.email.syncing') : t('settings.email.syncNow')}
            </button>
          </div>

          {configs.map(config => (
            <div
              key={config.id}
              className="glass-elite-panel dark:glass-elite-panel flex flex-col gap-6 rounded-2xl border border-gray-200/50 bg-white/30 p-6 shadow-sm backdrop-blur-xl dark:border-zinc-800 dark:bg-zinc-900/30"
            >
              {/* Config header */}
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-full ${
                      config.is_enabled
                        ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
                        : 'bg-gray-100 text-gray-400 dark:bg-zinc-800 dark:text-zinc-500'
                    }`}
                  >
                    <Mail size={18} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {config.email}
                      </p>
                      <ProviderBadge providerId={config.provider} />
                    </div>
                    <p className="text-xs text-gray-500 dark:text-zinc-400">
                      {t('settings.email.pollInterval', { minutes: config.poll_interval_minutes })}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {editingConfig?.id !== config.id && (
                    <>
                      <button
                        onClick={() => startEdit(config)}
                        disabled={savingId === config.id || deletingId === config.id}
                        className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-zinc-700 dark:text-gray-300 dark:hover:bg-zinc-800"
                      >
                        <Settings size={13} />
                        {t('settings.email.settings')}
                      </button>
                      <button
                        onClick={() => handleDelete(config)}
                        disabled={savingId === config.id || deletingId === config.id}
                        className="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-900/30 dark:text-red-400 dark:hover:bg-red-900/20"
                      >
                        {deletingId === config.id ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <Trash2 size={13} />
                        )}
                        {t('settings.email.disconnect')}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Edit form (inline) */}
              {editingConfig?.id === config.id && (
                <div className="mt-4 space-y-4 border-t border-gray-100 pt-4 dark:border-zinc-800">
                  {/* Poll Interval */}
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                      {t('settings.email.pollIntervalLabel')}
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {POLL_INTERVAL_OPTIONS.map(opt => (
                        <button
                          key={opt.value}
                          onClick={() => setEditPollInterval(opt.value)}
                          className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                            editPollInterval === opt.value
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
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-3">
                      <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                        {t('settings.email.summaryModel')}
                      </label>
                      <div className="flex rounded-lg border border-gray-200 bg-gray-100/30 p-0.5 backdrop-blur-md dark:border-zinc-700 dark:bg-zinc-800/50">
                        <button
                          type="button"
                          onClick={() => {
                            setEditModelSource('list')
                            const existsInList = availableModels.some(
                              m => m.value === editSummaryModel,
                            )
                            if (!existsInList) setEditSummaryModel('')
                          }}
                          className={clsx(
                            'rounded-md px-2 py-0.5 text-xs font-medium transition-all',
                            editModelSource === 'list'
                              ? 'bg-white text-gray-900 shadow-sm dark:bg-zinc-700 dark:text-gray-100'
                              : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300',
                          )}
                        >
                          {t('agents.model.sourceList')}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditModelSource('custom')
                            const nextValue = editSummaryModel || editCustomModel || ''
                            setEditCustomModel(nextValue)
                            setEditSummaryModel(nextValue)
                          }}
                          className={clsx(
                            'rounded-md px-2 py-0.5 text-xs font-medium transition-all',
                            editModelSource === 'custom'
                              ? 'bg-white text-gray-900 shadow-sm dark:bg-zinc-700 dark:text-gray-100'
                              : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300',
                          )}
                        >
                          {t('agents.model.sourceCustom')}
                        </button>
                      </div>
                    </div>

                    <div className="rounded-lg border border-gray-200/50 bg-white/20 p-3 backdrop-blur-md dark:border-zinc-700 dark:bg-zinc-900/30">
                      <div className="flex flex-col gap-3">
                        {/* Provider selector */}
                        <div className="flex flex-col gap-1.5">
                          <span className="text-xs font-semibold tracking-wide text-gray-400 uppercase">
                            {t('agents.model.providers')}
                          </span>
                          <Select
                            value={editSummaryProvider}
                            onValueChange={val => {
                              setEditSummaryProvider(val)
                              if (editModelSource === 'list') {
                                setEditSummaryModel('')
                              }
                            }}
                            disabled={!enabledSummaryProviders.length}
                          >
                            <SelectTrigger className="h-9 w-full border-gray-200 dark:border-zinc-700">
                              <SelectValue>
                                <div className="flex items-center gap-2">
                                  {renderProviderIcon(editSummaryProvider, 'h-4 w-4')}
                                  <span className="capitalize">
                                    {editSummaryProvider.replace('_', ' ')}
                                  </span>
                                </div>
                              </SelectValue>
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

                        {/* Model selector */}
                        <div className="flex flex-col gap-1.5">
                          <span className="text-xs font-semibold tracking-wide text-gray-400 uppercase">
                            {t('agents.model.models')}
                          </span>
                          {editModelSource === 'list' ? (
                            <Select
                              value={editSummaryModel}
                              onValueChange={setEditSummaryModel}
                              disabled={!availableModels.length}
                            >
                              <SelectTrigger className="h-9 w-full border-gray-200 dark:border-zinc-700">
                                {fetchingModels ? (
                                  <div className="flex items-center gap-2">
                                    <Loader2 size={13} className="animate-spin" />
                                    <span>{t('settings.email.loadingModels')}</span>
                                  </div>
                                ) : (
                                  <SelectValue placeholder={t('settings.email.model')} />
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
                                      <div className="flex items-center gap-2">
                                        {getModelIcon(m.value) && (
                                          <img
                                            src={getModelIcon(m.value)}
                                            alt=""
                                            className={clsx(
                                              'h-4 w-4 shrink-0',
                                              getModelIconClassName(m.value),
                                            )}
                                          />
                                        )}
                                        <span>{m.label}</span>
                                      </div>
                                    </SelectItem>
                                  ))
                                ) : (
                                  <SelectItem value="__none__" disabled>
                                    {t('settings.email.noModels')}
                                  </SelectItem>
                                )}
                              </SelectContent>
                            </Select>
                          ) : (
                            <input
                              type="text"
                              value={editCustomModel}
                              onChange={e => {
                                setEditCustomModel(e.target.value)
                                setEditSummaryModel(e.target.value)
                              }}
                              placeholder={t('agents.model.customPlaceholder')}
                              className="focus:ring-primary-500/20 focus:border-primary-500 h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 placeholder-gray-400 transition-all focus:ring-2 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-100 dark:placeholder-zinc-600"
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Edit actions */}
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={cancelEdit}
                      className="glass-elite-panel dark:glass-elite-panel relative flex items-center gap-4 overflow-hidden rounded-2xl border border-gray-200/50 bg-white/30 p-4 backdrop-blur-xl transition-all hover:bg-white/40 dark:border-zinc-800 dark:bg-zinc-900/30 dark:hover:bg-zinc-900/50"
                    >
                      <X size={13} />
                      {t('common.cancel')}
                    </button>
                    <button
                      onClick={handleSaveEdit}
                      disabled={savingId === config.id || !isEditFormValid}
                      className="bg-primary-500 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                      {savingId === config.id && <Loader2 size={13} className="animate-spin" />}
                      {savingId === config.id ? t('settings.email.saving') : t('common.save')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add new account form */}
      {showAddForm ? (
        <div className="flex flex-col gap-5 rounded-xl border border-gray-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">
              {t('settings.email.connectForm.title')}
            </p>
            <button
              onClick={() => {
                setShowAddForm(false)
                setEmailAddr('')
                setAppPassword('')
                // Reset to global defaults
                setAddSummaryProvider(globalSettings.liteModelProvider || 'openai_compatibility')
                setAddSummaryModel(globalSettings.liteModel || 'gpt-4o-mini')
              }}
              className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-zinc-800 dark:hover:text-gray-200"
            >
              <X size={16} />
            </button>
          </div>

          {/* Provider selector */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
              {t('settings.email.connectForm.providerLabel')}
            </label>
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
                {t('settings.email.connectForm.emailLabel')}
              </label>
              <input
                type="email"
                value={emailAddr}
                onChange={e => setEmailAddr(e.target.value)}
                placeholder={t('settings.email.connectForm.emailPlaceholder')}
                className="focus:ring-primary-500/20 focus:border-primary-500 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 transition-all focus:ring-2 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-100 dark:placeholder-zinc-600"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                {t('settings.email.connectForm.passwordLabel')}
                <span className="ml-1 font-normal text-gray-400">
                  {t('settings.email.connectForm.passwordHint')}
                </span>
              </label>
              <input
                type="password"
                value={appPassword}
                onChange={e => setAppPassword(e.target.value)}
                placeholder={t('settings.email.connectForm.passwordPlaceholder')}
                className="focus:ring-primary-500/20 focus:border-primary-500 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 transition-all focus:ring-2 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-100 dark:placeholder-zinc-600"
              />
            </div>
          </div>

          {/* Summary Model Selection */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                {t('settings.email.summaryModel')}
              </label>
              <div className="flex rounded-lg border border-gray-200 bg-gray-100 p-0.5 dark:border-zinc-700 dark:bg-zinc-800">
                <button
                  type="button"
                  onClick={() => {
                    setAddModelSource('list')
                    const existsInList = addAvailableModels.some(m => m.value === addSummaryModel)
                    if (!existsInList) setAddSummaryModel('')
                  }}
                  className={clsx(
                    'rounded-md px-2 py-0.5 text-xs font-medium transition-all',
                    addModelSource === 'list'
                      ? 'bg-white text-gray-900 shadow-sm dark:bg-zinc-700 dark:text-gray-100'
                      : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300',
                  )}
                >
                  {t('agents.model.sourceList')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAddModelSource('custom')
                    const nextValue = addSummaryModel || addCustomModel || ''
                    setAddCustomModel(nextValue)
                    setAddSummaryModel(nextValue)
                  }}
                  className={clsx(
                    'rounded-md px-2 py-0.5 text-xs font-medium transition-all',
                    addModelSource === 'custom'
                      ? 'bg-white text-gray-900 shadow-sm dark:bg-zinc-700 dark:text-gray-100'
                      : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300',
                  )}
                >
                  {t('agents.model.sourceCustom')}
                </button>
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900">
              <div className="flex flex-col gap-3">
                {/* Provider selector */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold tracking-wide text-gray-400 uppercase">
                    {t('agents.model.providers')}
                  </span>
                  <Select
                    value={addSummaryProvider}
                    onValueChange={val => {
                      setAddSummaryProvider(val)
                      if (addModelSource === 'list') {
                        setAddSummaryModel('')
                      }
                    }}
                    disabled={!enabledSummaryProviders.length}
                  >
                    <SelectTrigger className="h-9 w-full border-gray-200 dark:border-zinc-700">
                      <SelectValue>
                        <div className="flex items-center gap-2">
                          {renderProviderIcon(addSummaryProvider, 'h-4 w-4')}
                          <span className="capitalize">{addSummaryProvider.replace('_', ' ')}</span>
                        </div>
                      </SelectValue>
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

                {/* Model selector */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold tracking-wide text-gray-400 uppercase">
                    {t('agents.model.models')}
                  </span>
                  {addModelSource === 'list' ? (
                    <Select
                      value={addSummaryModel}
                      onValueChange={setAddSummaryModel}
                      disabled={!addAvailableModels.length}
                    >
                      <SelectTrigger className="h-9 w-full border-gray-200 dark:border-zinc-700">
                        {addFetchingModels ? (
                          <div className="flex items-center gap-2">
                            <Loader2 size={13} className="animate-spin" />
                            <span>{t('settings.email.loadingModels')}</span>
                          </div>
                        ) : (
                          <SelectValue placeholder={t('settings.email.model')} />
                        )}
                      </SelectTrigger>
                      <SelectContent className="dark:border-zinc-700 dark:bg-zinc-900">
                        {addAvailableModels.length > 0 ? (
                          addAvailableModels.map(m => (
                            <SelectItem
                              key={m.value}
                              value={m.value}
                              className="dark:hover:bg-zinc-800"
                            >
                              <div className="flex items-center gap-2">
                                {getModelIcon(m.value) && (
                                  <img
                                    src={getModelIcon(m.value)}
                                    alt=""
                                    className={clsx(
                                      'h-4 w-4 shrink-0',
                                      getModelIconClassName(m.value),
                                    )}
                                  />
                                )}
                                <span>{m.label}</span>
                              </div>
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value="__none__" disabled>
                            {t('settings.email.noModels')}
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  ) : (
                    <input
                      type="text"
                      value={addCustomModel}
                      onChange={e => {
                        setAddCustomModel(e.target.value)
                        setAddSummaryModel(e.target.value)
                      }}
                      placeholder={t('agents.model.customPlaceholder')}
                      className="focus:ring-primary-500/20 focus:border-primary-500 h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 placeholder-gray-400 transition-all focus:ring-2 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-100 dark:placeholder-zinc-600"
                    />
                  )}
                </div>
              </div>
            </div>
          </div>

          <button
            onClick={handleConnect}
            disabled={connecting || !isAddFormValid}
            className="flex items-center justify-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {connecting ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
            {connecting
              ? t('settings.email.connectForm.connecting')
              : t('settings.email.connectForm.connectButton')}
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-200 bg-white py-4 text-sm font-medium text-gray-600 transition-colors hover:border-gray-300 hover:bg-gray-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-400 dark:hover:border-zinc-600 dark:hover:bg-zinc-800"
        >
          <Plus size={16} />
          {t('settings.email.addEmail')}
        </button>
      )}

      {/* Empty state */}
      {configs.length === 0 && !showAddForm && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-center dark:border-zinc-700 dark:bg-zinc-900">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-zinc-800">
            <Mail size={24} className="text-gray-400 dark:text-zinc-500" />
          </div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {t('settings.email.noAccounts')}
          </p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {t('settings.email.noAccountsHint')}
          </p>
        </div>
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
