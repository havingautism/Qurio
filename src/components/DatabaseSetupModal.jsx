import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  Check,
  ChevronDown,
  ChevronRight,
  Database,
  FileUp,
  FolderOpen,
  Key,
  Pencil,
  Plus,
  RefreshCw,
  XCircle,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { clsx } from 'clsx'
import { loadSettings, saveSettings } from '../lib/settings'
import { renderProviderIcon } from '../lib/modelIcons'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const getBackendUrl = () => {
  const settings = loadSettings()
  return settings.backendUrl || 'http://127.0.0.1:3002'
}

const isElectronRuntime = () =>
  typeof window !== 'undefined' &&
  (window.location.protocol === 'file:' || navigator.userAgent.includes('Electron'))

const buildSqlitePath = (directory, providerId) => {
  const trimmedDir = String(directory || '').trim().replace(/[\\/]+$/, '')
  if (!trimmedDir) return ''
  const fileName = `${String(providerId || 'qurio-local').trim() || 'qurio-local'}.db`
  const separator = trimmedDir.includes('\\') ? '\\' : '/'
  return `${trimmedDir}${separator}${fileName}`
}

const extractSqliteDirectory = sqlitePath => {
  const value = String(sqlitePath || '').trim()
  if (!value) return ''
  const normalized = value.replace(/\\/g, '/')
  const index = normalized.lastIndexOf('/')
  if (index <= 0) return value
  const prefix = value.includes('\\') ? '\\' : '/'
  const parts = normalized.slice(0, index).split('/')
  return parts.join(prefix)
}

const isLikelySqliteFilePath = value => {
  const normalized = String(value || '').trim().toLowerCase()
  return (
    normalized.endsWith('.db') ||
    normalized.endsWith('.sqlite') ||
    normalized.endsWith('.sqlite3')
  )
}

export default function DatabaseSetupModal({ isOpen, onClose }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const electron = useMemo(() => isElectronRuntime(), [])
  const [dbAccessKey, setDbAccessKey] = useState('')
  const [providers, setProviders] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isAdding, setIsAdding] = useState(false)
  const [isInitializing, setIsInitializing] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isPickingDirectory, setIsPickingDirectory] = useState(false)
  const [isPickingSqliteFile, setIsPickingSqliteFile] = useState(false)
  const [registryMutable, setRegistryMutable] = useState(false)
  const [error, setError] = useState('')
  const [healthStatus, setHealthStatus] = useState('idle')
  const [healthMessage, setHealthMessage] = useState('')
  const [isProviderPanelOpen, setIsProviderPanelOpen] = useState(true)
  const [isEditingProvider, setIsEditingProvider] = useState(false)

  const [providerType, setProviderType] = useState('sqlite')
  const [providerId, setProviderId] = useState('')
  const [providerLabel, setProviderLabel] = useState('')
  const [supabaseUrl, setSupabaseUrl] = useState('')
  const [supabaseAnonKey, setSupabaseAnonKey] = useState('')
  const [sqliteDirectory, setSqliteDirectory] = useState('')
  const [sqliteImportFile, setSqliteImportFile] = useState('')
  const [providerAccessKey, setProviderAccessKey] = useState('')

  const selectedProvider = providers.find(item => item.id === selectedId)
  const requireAccessKey = Boolean(selectedProvider?.requiresAccessKey)
  const noProvidersInElectron = electron && providers.length === 0

  const resetProviderForm = () => {
    setProviderType('sqlite')
    setProviderId('')
    setProviderLabel('')
    setSupabaseUrl('')
    setSupabaseAnonKey('')
    setSqliteDirectory('')
    setSqliteImportFile('')
    setProviderAccessKey('')
    setIsEditingProvider(false)
  }

  useEffect(() => {
    if (!isOpen) return
    const settings = loadSettings()
    setDbAccessKey(settings.dbAccessKey || '')
    setSelectedId(settings.databaseProviderId || '')
    setError('')
    setHealthStatus('idle')
    setHealthMessage('')
    resetProviderForm()
    setIsProviderPanelOpen(true)
    checkBackendHealth()
    fetchProviders()
  }, [isOpen])

  const checkBackendHealth = async () => {
    try {
      setHealthStatus('loading')
      const response = await fetch(`${getBackendUrl()}/api/health`, { cache: 'no-store' })
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`.trim())
      }
      setHealthStatus('success')
      setHealthMessage(t('settings.backendHealthCheckSuccess'))
    } catch (err) {
      setHealthStatus('error')
      setHealthMessage(err.message || t('settings.backendHealthCheckFailed'))
    }
  }

  const fetchProviders = async () => {
    setIsLoading(true)
    setError('')
    try {
      const response = await fetch(`${getBackendUrl()}/api/db/providers`, { cache: 'no-store' })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload.detail || t('settings.databaseSetup.errors.loadProviders'))
      }
      const list = Array.isArray(payload.providers) ? payload.providers : []
      setRegistryMutable(Boolean(payload.mutable))
      setProviders(list)

      if (list.length > 0) {
        const current = loadSettings().databaseProviderId || ''
        const target = list.find(item => item.id === current)?.id || list[0].id
        setSelectedId(target)
      } else {
        setSelectedId('')
      }

      if (electron && Boolean(payload.mutable)) {
        setIsProviderPanelOpen(list.length === 0)
      }
    } catch (err) {
      setProviders([])
      setError(err.message || t('settings.databaseSetup.errors.loadProviders'))
    } finally {
      setIsLoading(false)
    }
  }

  const handleInitializeProvider = async id => {
    setIsInitializing(true)
    try {
      const response = await fetch(`${getBackendUrl()}/api/db/providers/${id}/initialize`, {
        method: 'POST',
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || payload.success === false) {
        throw new Error(
          payload.message || payload.detail || t('settings.databaseSetup.errors.initializeFailed'),
        )
      }
      setHealthMessage(payload.message || t('settings.databaseSetup.messages.initialized'))
      setHealthStatus('success')
      return true
    } catch (err) {
      setError(err.message || t('settings.databaseSetup.errors.initializeFailed'))
      return false
    } finally {
      setIsInitializing(false)
    }
  }

  const handlePickSqliteDirectory = async () => {
    try {
      setIsPickingDirectory(true)
      const picker = window.qurioRuntime?.selectDirectory
      if (typeof picker !== 'function') {
        setError(t('settings.databaseSetup.errors.folderPickerNotAvailable'))
        return
      }
      const selectedPath = await picker()
      if (selectedPath) {
        setSqliteImportFile('')
        setSqliteDirectory(selectedPath)
      }
    } catch {
      setError(t('settings.databaseSetup.errors.folderPickerNotAvailable'))
    } finally {
      setIsPickingDirectory(false)
    }
  }

  const handlePickSqliteFile = async () => {
    try {
      setIsPickingSqliteFile(true)
      const picker = window.qurioRuntime?.selectSqliteFile
      if (typeof picker !== 'function') {
        setError(t('settings.databaseSetup.errors.filePickerNotAvailable'))
        return
      }
      const selectedPath = await picker()
      if (selectedPath) {
        setSqliteImportFile(selectedPath)
        setSqliteDirectory('')
      }
    } catch {
      setError(t('settings.databaseSetup.errors.filePickerNotAvailable'))
    } finally {
      setIsPickingSqliteFile(false)
    }
  }

  const handleEditProvider = provider => {
    if (!provider) return
    setProviderType(provider.type || 'sqlite')
    setProviderId(provider.id || '')
    setProviderLabel(provider.label || provider.id || '')
    setSupabaseUrl(provider.url || '')
    setSupabaseAnonKey(provider.anonKey || '')
    if (isLikelySqliteFilePath(provider.path)) {
      setSqliteImportFile(provider.path || '')
      setSqliteDirectory('')
    } else {
      setSqliteImportFile('')
      setSqliteDirectory(extractSqliteDirectory(provider.path))
    }
    setProviderAccessKey('')
    setIsEditingProvider(true)
    setIsProviderPanelOpen(true)
    setError('')
  }

  const handleUpsertProvider = async () => {
    if (!providerId.trim()) {
      setError(t('settings.databaseSetup.errors.providerIdRequired'))
      return
    }
    if (providerType === 'supabase' && (!supabaseUrl.trim() || !supabaseAnonKey.trim())) {
      setError(t('settings.databaseSetup.errors.supabaseRequired'))
      return
    }
    if (providerType === 'sqlite' && !sqliteDirectory.trim() && !sqliteImportFile.trim()) {
      setError(t('settings.databaseSetup.errors.sqliteDirectoryRequired'))
      return
    }

    const payload =
      providerType === 'supabase'
        ? {
            id: providerId.trim(),
            type: 'supabase',
            label: providerLabel.trim() || providerId.trim(),
            url: supabaseUrl.trim(),
            anonKey: supabaseAnonKey.trim(),
            accessKey: providerAccessKey.trim() || undefined,
          }
        : {
            id: providerId.trim(),
            type: 'sqlite',
            label: providerLabel.trim() || providerId.trim(),
            path: sqliteImportFile.trim() || buildSqlitePath(sqliteDirectory, providerId),
            accessKey: providerAccessKey.trim() || undefined,
          }

    const confirmed = window.confirm(
      t('settings.databaseSetup.initializeConfirm', { id: payload.id }),
    )
    if (!confirmed) return

    setIsAdding(true)
    setError('')
    try {
      const response = await fetch(`${getBackendUrl()}/api/db/providers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(result.detail || t('settings.databaseSetup.errors.addProviderFailed'))
      }

      await fetchProviders()
      setSelectedId(payload.id)
      await handleInitializeProvider(payload.id)
      resetProviderForm()
      setIsProviderPanelOpen(false)
    } catch (err) {
      setError(err.message || t('settings.databaseSetup.errors.addProviderFailed'))
    } finally {
      setIsAdding(false)
    }
  }

  const handleDeleteProvider = async () => {
    const targetId = providerId.trim()
    if (!targetId) return
    const confirmed = window.confirm(
      t('settings.databaseSetup.deleteProviderConfirm', { id: targetId }),
    )
    if (!confirmed) return

    setIsDeleting(true)
    setError('')
    try {
      const response = await fetch(`${getBackendUrl()}/api/db/providers/${encodeURIComponent(targetId)}`, {
        method: 'DELETE',
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload.detail || t('settings.databaseSetup.errors.deleteProviderFailed'))
      }

      if (selectedId === targetId) {
        await saveSettings({
          dbAccessKey: dbAccessKey.trim(),
          databaseProviderId: '',
          databaseProvider: '',
        })
      }

      await fetchProviders()
      resetProviderForm()
      setHealthMessage(t('settings.databaseSetup.messages.providerDeleted'))
      setHealthStatus('success')
    } catch (err) {
      setError(err.message || t('settings.databaseSetup.errors.deleteProviderFailed'))
    } finally {
      setIsDeleting(false)
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    setError('')

    if (!selectedId) {
      setError(t('settings.databaseSetup.errors.selectProvider'))
      setIsSaving(false)
      return
    }

    if (requireAccessKey && !dbAccessKey.trim()) {
      setError(t('settings.databaseSetup.errors.accessKeyRequired'))
      setIsSaving(false)
      return
    }

    try {
      const headers = {
        'Content-Type': 'application/json',
      }
      if (dbAccessKey.trim()) {
        headers['x-db-access-key'] = dbAccessKey.trim()
      }

      const response = await fetch(`${getBackendUrl()}/api/db/query`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ providerId: selectedId, action: 'test' }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || payload.error) {
        throw new Error(
          payload.detail || payload.error || t('settings.databaseSetup.errors.accessKeyValidation'),
        )
      }
      if (!payload?.data?.success) {
        throw new Error(
          payload?.data?.message || t('settings.databaseSetup.errors.connectionFailed'),
        )
      }

      const provider = providers.find(item => item.id === selectedId)
      const resolvedType = provider?.type || ''
      await saveSettings({
        dbAccessKey: dbAccessKey.trim(),
        databaseProviderId: selectedId,
        databaseProvider: resolvedType,
      })
      window.dispatchEvent(new Event('database-settings-changed'))
      navigate({ to: '/new_chat' })
      setTimeout(() => window.location.reload(), 50)
    } catch (err) {
      setError(err.message || t('settings.databaseSetup.errors.validationFailed'))
      setIsSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-200 flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm">
      <div className="animate-in zoom-in-95 w-full max-w-xl max-h-[90vh] space-y-6 overflow-y-auto rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl duration-200 md:p-8 dark:border-zinc-800 dark:bg-[#191a1a]">
        <div className="space-y-2 text-center">
          <div className="bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl">
            <Database size={24} />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            {t('settings.databaseSetup.title') || 'Database Setup'}
          </h2>
          <p className="mx-auto max-w-xs text-sm text-gray-500 dark:text-gray-400">
            {electron
              ? t('settings.databaseSetup.electronDescription')
              : t('settings.databaseSetup.description') ||
                'Enter the access key to load database providers, then choose one to use.'}
          </p>
        </div>

        <div className="space-y-4">
          {healthStatus !== 'idle' && (
            <div
              className={clsx(
                'rounded-lg border px-3 py-2 text-xs',
                healthStatus === 'success' &&
                  'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-900/20 dark:text-emerald-300',
                healthStatus === 'error' &&
                  'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/50 dark:bg-rose-900/20 dark:text-rose-300',
                healthStatus === 'loading' &&
                  'border-gray-200 bg-gray-50 text-gray-600 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-gray-300',
              )}
            >
              {healthMessage || 'Checking backend...'}
            </div>
          )}

          {electron && registryMutable && (
            <div className="rounded-lg border border-gray-200 p-3 dark:border-zinc-700">
              <button
                type="button"
                onClick={() => setIsProviderPanelOpen(prev => !prev)}
                className="flex w-full items-center justify-between text-left text-xs font-semibold text-gray-700 dark:text-gray-200"
              >
                <span>
                  {isEditingProvider
                    ? t('settings.databaseSetup.editProvider')
                    : t('settings.databaseSetup.addProvider')}
                </span>
                {isProviderPanelOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>

              {isProviderPanelOpen && (
                <div className="mt-3 space-y-3">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div className="space-y-1">
                      <label className="text-[11px] text-gray-500 dark:text-gray-400">
                        {t('settings.databaseSetup.type')}
                      </label>
                      <Select value={providerType} onValueChange={setProviderType}>
                        <SelectTrigger className="h-9 w-full text-xs">
                          <SelectValue placeholder={t('settings.databaseSetup.selectType')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="sqlite">SQLite</SelectItem>
                          <SelectItem value="supabase">Supabase</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] text-gray-500 dark:text-gray-400">
                        {t('settings.databaseSetup.providerId')}
                      </label>
                      <input
                        value={providerId}
                        disabled={isEditingProvider}
                        onChange={e => setProviderId(e.target.value)}
                        placeholder={
                          providerType === 'supabase'
                            ? t('settings.databaseSetup.providerIdPlaceholderSupabase')
                            : t('settings.databaseSetup.providerIdPlaceholderSqlite')
                        }
                        className="h-9 w-full rounded-md border border-gray-200 px-2 text-xs disabled:cursor-not-allowed disabled:bg-gray-100 dark:border-zinc-700 dark:bg-zinc-900 dark:disabled:bg-zinc-800"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] text-gray-500 dark:text-gray-400">
                      {t('settings.databaseSetup.label')}
                    </label>
                    <input
                      value={providerLabel}
                      onChange={e => setProviderLabel(e.target.value)}
                      placeholder={
                        providerType === 'supabase'
                          ? t('settings.databaseSetup.labelPlaceholderSupabase')
                          : t('settings.databaseSetup.labelPlaceholderSqlite')
                      }
                      className="h-9 w-full rounded-md border border-gray-200 px-2 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                    />
                  </div>

                  {providerType === 'supabase' ? (
                    <>
                      <div className="space-y-1">
                        <label className="text-[11px] text-gray-500 dark:text-gray-400">
                          {t('settings.databaseSetup.supabaseUrl')}
                        </label>
                        <input
                          value={supabaseUrl}
                          onChange={e => setSupabaseUrl(e.target.value)}
                          placeholder="https://xxx.supabase.co"
                          className="h-9 w-full rounded-md border border-gray-200 px-2 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] text-gray-500 dark:text-gray-400">
                          {t('settings.databaseSetup.anonKey')}
                        </label>
                        <input
                          value={supabaseAnonKey}
                          onChange={e => setSupabaseAnonKey(e.target.value)}
                          placeholder="eyJ..."
                          className="h-9 w-full rounded-md border border-gray-200 px-2 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                        />
                      </div>
                    </>
                  ) : (
                    <div className="space-y-1">
                      <label className="text-[11px] text-gray-500 dark:text-gray-400">
                        {sqliteImportFile.trim()
                          ? t('settings.databaseSetup.sqliteFilePath')
                          : t('settings.databaseSetup.sqliteDirectory')}
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          value={sqliteImportFile || sqliteDirectory}
                          onChange={e => {
                            const value = e.target.value
                            if (sqliteImportFile.trim()) {
                              setSqliteImportFile(value)
                            } else {
                              setSqliteDirectory(value)
                            }
                          }}
                          placeholder={
                            sqliteImportFile.trim()
                              ? 'C:\\Users\\you\\QurioData\\existing.db'
                              : 'C:\\Users\\you\\QurioData'
                          }
                          className="h-9 w-full rounded-md border border-gray-200 px-2 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                        />
                        <button
                          type="button"
                          onClick={handlePickSqliteDirectory}
                          disabled={isPickingDirectory}
                          className="inline-flex h-9 shrink-0 items-center gap-1 rounded-md border border-gray-200 px-2 text-xs hover:bg-gray-50 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-800"
                        >
                          {isPickingDirectory ? (
                            <RefreshCw size={12} className="animate-spin" />
                          ) : (
                            <FolderOpen size={12} />
                          )}
                          {t('settings.databaseSetup.browseFolder')}
                        </button>
                        <button
                          type="button"
                          onClick={handlePickSqliteFile}
                          disabled={isPickingSqliteFile}
                          className="inline-flex h-9 shrink-0 items-center gap-1 rounded-md border border-gray-200 px-2 text-xs hover:bg-gray-50 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-800"
                        >
                          {isPickingSqliteFile ? (
                            <RefreshCw size={12} className="animate-spin" />
                          ) : (
                            <FileUp size={12} />
                          )}
                          {t('settings.databaseSetup.importDbFile')}
                        </button>
                      </div>
                      <p className="text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
                        {t('settings.databaseSetup.sqliteUsageHint')}
                        {' '}
                        {t('settings.databaseSetup.sqliteUsageHintCreate')}
                        {' '}
                        {t('settings.databaseSetup.sqliteUsageHintImport')}
                      </p>
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className="text-[11px] text-gray-500 dark:text-gray-400">
                      {t('settings.databaseSetup.providerAccessKeyOptional')}
                    </label>
                    <input
                      value={providerAccessKey}
                      onChange={e => setProviderAccessKey(e.target.value)}
                      placeholder={t('settings.databaseSetup.providerAccessKeyPlaceholder')}
                      className="h-9 w-full rounded-md border border-gray-200 px-2 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleUpsertProvider}
                      disabled={isAdding || isInitializing || isDeleting}
                      className="inline-flex items-center gap-2 rounded-md border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-60 dark:border-rose-900/40 dark:text-rose-300 dark:hover:bg-rose-900/20"
                    >
                      {isAdding || isInitializing ? (
                        <RefreshCw size={12} className="animate-spin" />
                      ) : isEditingProvider ? (
                        <Pencil size={12} />
                      ) : (
                        <Plus size={12} />
                      )}
                      {isEditingProvider
                        ? t('settings.databaseSetup.rebuildAndInitialize')
                        : t('settings.databaseSetup.initialize')}
                    </button>
                    {isEditingProvider && (
                      <>
                        <button
                          type="button"
                          onClick={resetProviderForm}
                          disabled={isDeleting}
                          className="inline-flex items-center gap-2 rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium hover:bg-gray-50 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-800"
                        >
                          {t('settings.databaseSetup.cancelEdit')}
                        </button>
                        <button
                          type="button"
                          onClick={handleDeleteProvider}
                          disabled={isDeleting || isAdding || isInitializing}
                          className="inline-flex items-center gap-2 rounded-md border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-60 dark:border-rose-900/40 dark:text-rose-300 dark:hover:bg-rose-900/20"
                        >
                          {isDeleting ? (
                            <RefreshCw size={12} className="animate-spin" />
                          ) : (
                            <XCircle size={12} />
                          )}
                          {t('settings.databaseSetup.deleteProvider')}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('settings.databaseSetup.provider') || 'Provider'}
              </label>
              {electron && registryMutable && selectedProvider && (
                <button
                  type="button"
                  onClick={() => handleEditProvider(selectedProvider)}
                  className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-[11px] hover:bg-gray-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                >
                  <Pencil size={12} />
                  {t('settings.databaseSetup.editProvider')}
                </button>
              )}
            </div>
            <div className="relative w-full">
              <Select value={selectedId} onValueChange={setSelectedId} disabled={noProvidersInElectron}>
                <SelectTrigger className="h-10 w-full pl-10">
                  <div className="absolute top-1/2 left-3 flex -translate-y-1/2 items-center">
                    <Database size={16} className="text-gray-400" />
                  </div>
                  <SelectValue
                    placeholder={
                      isLoading
                        ? t('settings.databaseSetup.loadingProviders')
                        : t('settings.databaseSetup.selectProvider') || 'Select provider'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {providers.map(provider => (
                    <SelectItem key={provider.id} value={provider.id}>
                      <div className="flex items-center gap-3">
                        {renderProviderIcon(provider.type || provider.id, {
                          size: 16,
                          alt: provider.label || provider.id,
                        })}
                        <span>{provider.label || provider.id}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {noProvidersInElectron && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                {t('settings.databaseSetup.noProviderHint')}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('settings.databaseSetup.accessKey') || 'Access Key'}
            </label>
            <div className="relative">
              <div className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400">
                <Key size={16} />
              </div>
              <input
                type="password"
                value={dbAccessKey}
                disabled={noProvidersInElectron}
                onChange={e => setDbAccessKey(e.target.value)}
                placeholder={
                  requireAccessKey
                    ? t('settings.databaseSetup.accessKeyPlaceholder') || 'Enter backend access key'
                    : t('settings.databaseSetup.accessKeyOptional')
                }
                className="focus:ring-primary-500/20 focus:border-primary-500 w-full rounded-lg border border-gray-200 bg-gray-50 py-2.5 pr-4 pl-10 text-sm text-gray-900 placeholder-gray-400 transition-all focus:ring-2 focus:outline-none disabled:cursor-not-allowed disabled:bg-gray-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-100 dark:disabled:bg-zinc-800"
              />
            </div>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
            <XCircle size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex flex-col gap-3">
          <button
            onClick={handleSave}
            disabled={!selectedId || isSaving || noProvidersInElectron}
            className="bg-primary-600 hover:bg-primary-700 shadow-primary-500/20 flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold text-white shadow-lg transition-all disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span>
              {isSaving
                ? t('settings.databaseSetup.saving') || 'Validating...'
                : t('settings.databaseSetup.saveAndReload') || 'Save & Reload'}
            </span>
            <Check size={16} />
          </button>
          <button
            onClick={onClose}
            className="flex w-full items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-zinc-800"
          >
            {t('common.close') || 'Close'}
          </button>
        </div>
      </div>
    </div>
  )
}
