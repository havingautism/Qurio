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
        await saveSettings({ supabaseUrl, supabaseKey })
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
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm px-4">
      <div className="w-full max-w-md bg-white dark:bg-[#191a1a] rounded-2xl shadow-2xl border border-gray-200 dark:border-zinc-800 p-6 md:p-8 space-y-8 animate-in zoom-in-95 duration-200">
        <div className="text-center space-y-2">
          <div className="mx-auto w-12 h-12 bg-primary-100 dark:bg-primary-900/30 rounded-xl flex items-center justify-center text-primary-600 dark:text-primary-400 mb-4">
            <Database size={24} />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            {t('settings.supabaseSetup.title') || 'Connect to Supabase'}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs mx-auto">
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
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                <LinkIcon size={16} />
              </div>
              <input
                type="text"
                value={supabaseUrl}
                onChange={e => setSupabaseUrl(e.target.value)}
                placeholder="https://your-project.supabase.co"
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-gray-900 dark:text-gray-100 placeholder-gray-400"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Supabase Key (Anon)
            </label>
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                <Key size={16} />
              </div>
              <input
                type="password"
                value={supabaseKey}
                onChange={e => setSupabaseKey(e.target.value)}
                placeholder="your-anon-key"
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-gray-900 dark:text-gray-100 placeholder-gray-400"
              />
            </div>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm flex items-start gap-2">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex flex-col gap-3">
          <button
            onClick={handleSave}
            disabled={isTesting || !supabaseUrl || !supabaseKey}
            className="w-full py-2.5 rounded-lg text-sm font-semibold bg-primary-600 hover:bg-primary-700 text-white shadow-lg shadow-primary-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
                  localStorage.removeItem('supabaseUrl')
                  localStorage.removeItem('supabaseKey')
                  window.location.reload()
                }}
                className="flex-1 py-2 rounded-lg text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                {t('settings.initModal.clearAndRestart') || 'Clear & Restart'}
              </button>
              <button
                onClick={onConfigured} // Just close modal
                className="flex-1 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
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
