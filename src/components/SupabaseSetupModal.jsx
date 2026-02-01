import React, { useState, useEffect } from 'react'
import { Key, Link as LinkIcon, AlertTriangle, Check, Loader2, Database } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { clsx } from 'clsx'
import { saveSettings, loadSettings } from '../lib/settings'
import { testConnection } from '../lib/supabase'

// isManual: true if opened from settings (cancellable/clearable), false if initial setup (mandatory)
export default function SupabaseSetupModal({ isOpen, onConfigured, isManual = false }) {
  const { t } = useTranslation()
  // Load initial settings to pre-fill if available
  const initialSettings = loadSettings()
  const [supabaseUrl, setSupabaseUrl] = useState(initialSettings.supabaseUrl || '')
  const [supabaseKey, setSupabaseKey] = useState(initialSettings.supabaseKey || '')
  const [isTesting, setIsTesting] = useState(false)
  const [error, setError] = useState(null)
  if (!isOpen) return null
  const isMandatory = !isManual

  const handleSave = async () => {
    if (!supabaseUrl || !supabaseKey) {
      setError(t('settings.initModal.missingFields') || 'Please fill in all fields')
      return
    }

    setIsTesting(true)
    setError(null)

    try {
      const result = await testConnection(supabaseUrl, supabaseKey)

      if (result.success) {
        // Only save if FULL success (connection + tables)
        await saveSettings({
          databaseProvider: 'supabase',
          databaseConfig: {
            supabase: {
              url: supabaseUrl,
              key: supabaseKey,
            },
          },
          supabaseUrl,
          supabaseKey,
        })
        onConfigured()
      } else {
        // Show specific error from testConnection (includes missing tables)
        setError(
          result.message ||
            t('settings.initModal.connectionFailed') ||
            'Connection failed. Please check credentials and init.sql.',
        )
      }
    } catch (err) {
      setError(err.message || 'An unexpected error occurred')
    } finally {
      setIsTesting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm">
      <div className="animate-in zoom-in-95 w-full max-w-md space-y-8 rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl duration-200 md:p-8 dark:border-zinc-800 dark:bg-[#191a1a]">
        <div className="space-y-2 text-center">
          <div className="bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl">
            <Database size={24} />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            {t('settings.supabaseSetup.title') || 'Connect to Supabase'}
          </h2>
          <p className="mx-auto max-w-xs text-sm text-gray-500 dark:text-gray-400">
            {t('settings.supabaseSetup.description') ||
              'This application requires a Supabase connection to store your data. Please enter your project credentials below.'}
          </p>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Supabase URL
            </label>
            <div className="relative">
              <div className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400">
                <LinkIcon size={16} />
              </div>
              <input
                type="text"
                value={supabaseUrl}
                onChange={e => setSupabaseUrl(e.target.value)}
                placeholder="https://your-project.supabase.co"
                className="focus:ring-primary-500/20 focus:border-primary-500 w-full rounded-lg border border-gray-200 bg-gray-50 py-2.5 pr-4 pl-10 text-sm text-gray-900 placeholder-gray-400 transition-all focus:ring-2 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-100"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Supabase Key (Anon)
            </label>
            <div className="relative">
              <div className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400">
                <Key size={16} />
              </div>
              <input
                type="password"
                value={supabaseKey}
                onChange={e => setSupabaseKey(e.target.value)}
                placeholder="your-anon-key"
                className="focus:ring-primary-500/20 focus:border-primary-500 w-full rounded-lg border border-gray-200 bg-gray-50 py-2.5 pr-4 pl-10 text-sm text-gray-900 placeholder-gray-400 transition-all focus:ring-2 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-100"
              />
            </div>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex flex-col gap-3">
          <button
            onClick={handleSave}
            disabled={isTesting || !supabaseUrl || !supabaseKey}
            className="bg-primary-600 hover:bg-primary-700 shadow-primary-500/20 flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold text-white shadow-lg transition-all disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isTesting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Connecting...</span>
              </>
            ) : (
              <>
                <span>Connect & Continue</span>
                <Check size={16} />
              </>
            )}
          </button>

          {isManual && (
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setSupabaseUrl('')
                  setSupabaseKey('')
                  localStorage.removeItem('databaseProvider')
                  localStorage.removeItem('databaseSupabaseUrl')
                  localStorage.removeItem('databaseSupabaseKey')
                  localStorage.removeItem('supabaseUrl')
                  localStorage.removeItem('supabaseKey')
                  window.location.reload()
                }}
                className="flex-1 rounded-lg py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
              >
                {t('settings.initModal.clearAndRestart') || 'Clear & Restart'}
              </button>
              <button
                onClick={onConfigured} // Just close modal
                className="flex-1 rounded-lg py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-zinc-800"
              >
                {t('common.cancel') || 'Cancel'}
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 dark:text-gray-500">
          Settings are saved locally to your browser.
        </p>
      </div>
    </div>
  )
}
