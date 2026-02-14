import React, { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Check, Database, Key, XCircle } from 'lucide-react'
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
  return settings.backendUrl || 'http://localhost:3001'
}

export default function DatabaseSetupModal({ isOpen, onClose }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const initialSettings = loadSettings()
  const [dbAccessKey, setDbAccessKey] = useState(initialSettings.dbAccessKey || '')
  const [providers, setProviders] = useState([])
  const [selectedId, setSelectedId] = useState(initialSettings.databaseProviderId || '')
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [healthStatus, setHealthStatus] = useState('idle')
  const [healthMessage, setHealthMessage] = useState('')

  useEffect(() => {
    if (!isOpen) return
    setDbAccessKey(initialSettings.dbAccessKey || '')
    setSelectedId(initialSettings.databaseProviderId || '')
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
        throw new Error(payload.detail || 'Failed to load providers')
      }
      const list = Array.isArray(payload.providers) ? payload.providers : []
      setProviders(list)
      if (!selectedId && list.length > 0) {
        setSelectedId(list[0].id)
      }
    } catch (err) {
      setProviders([])
      setError(err.message || 'Failed to load providers')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    setError('')
    if (!dbAccessKey) {
      setError('Please enter access key.')
      setIsSaving(false)
      return
    }
    if (!selectedId) {
      setError('Please select a provider.')
      setIsSaving(false)
      return
    }
    try {
      // 1) Validate access key + provider by calling backend test
      const response = await fetch(`${getBackendUrl()}/api/db/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-db-access-key': dbAccessKey,
        },
        body: JSON.stringify({ providerId: selectedId, action: 'test' }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || payload.error) {
        throw new Error(payload.detail || payload.error || 'Access key validation failed.')
      }
      if (!payload?.data?.success) {
        throw new Error(payload?.data?.message || 'Database connection failed.')
      }

      // 2) Save settings only after validation passes
      const provider = providers.find(item => item.id === selectedId)
      const resolvedType = provider?.type || initialSettings.databaseProvider || ''
      await saveSettings({
        dbAccessKey,
        databaseProviderId: selectedId,
        databaseProvider: resolvedType,
      })
      window.dispatchEvent(new Event('database-settings-changed'))
      navigate({ to: '/new_chat' })
      setTimeout(() => window.location.reload(), 50)
    } catch (err) {
      setError(err.message || 'Validation failed.')
      setIsSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-200 flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm">
      <div className="animate-in zoom-in-95 w-full max-w-md space-y-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl duration-200 md:p-8 dark:border-zinc-800 dark:bg-[#191a1a]">
        <div className="space-y-2 text-center">
          <div className="bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl">
            <Database size={24} />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            {t('settings.databaseSetup.title') || 'Database Setup'}
          </h2>
          <p className="mx-auto max-w-xs text-sm text-gray-500 dark:text-gray-400">
            {t('settings.databaseSetup.description') ||
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

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('settings.databaseSetup.provider') || 'Provider'}
            </label>
            <div className="relative w-full">
              <Select value={selectedId} onValueChange={setSelectedId}>
                <SelectTrigger className="h-10 w-full pl-10">
                  <div className="absolute top-1/2 left-3 flex -translate-y-1/2 items-center">
                    <Database size={16} className="text-gray-400" />
                  </div>
                  <SelectValue
                    placeholder={t('settings.databaseSetup.selectProvider') || 'Select provider'}
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
                onChange={e => setDbAccessKey(e.target.value)}
                placeholder={
                  t('settings.databaseSetup.accessKeyPlaceholder') || 'Enter backend access key'
                }
                className="focus:ring-primary-500/20 focus:border-primary-500 w-full rounded-lg border border-gray-200 bg-gray-50 py-2.5 pr-4 pl-10 text-sm text-gray-900 placeholder-gray-400 transition-all focus:ring-2 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-100"
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
            disabled={!dbAccessKey || !selectedId || isSaving}
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
