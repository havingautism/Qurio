import { Bug, ChevronDown, ChevronUp, Play, RotateCcw, Zap } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import useChatStore from '../lib/chatStore'

/**
 * Retry Test Panel Component
 *
 * Development-only panel for testing the retry mechanism in deep research.
 * Allows simulating failures at specific steps to verify retry behavior.
 *
 * Usage:
 * - Toggle test mode on/off
 * - Configure which step should fail
 * - Set how many attempts should fail before success
 * - Choose the error type to simulate
 */
const RetryTestPanel = () => {
  const { t } = useTranslation()
  const { retryTestConfig, setRetryTestConfig } = useChatStore()

  const [isExpanded, setIsExpanded] = useState(false)

  const handleChange = field => value => {
    setRetryTestConfig({ [field]: value })
  }

  const resetConfig = () => {
    setRetryTestConfig({
      enabled: false,
      failAtStep: 0,
      failAttempts: 1,
      errorType: 'network',
    })
  }

  // Error type options with icons and max retries
  const errorTypes = [
    {
      value: 'network',
      label: t('retryTest.errorTypes.network'),
      description: t('retryTest.errorTypes.networkDesc'),
      icon: '🌐',
      color: 'blue',
      maxRetries: 3, // Allow 3 retries after initial failure
    },
    {
      value: 'timeout',
      label: t('retryTest.errorTypes.timeout'),
      description: t('retryTest.errorTypes.timeoutDesc'),
      icon: '⏱️',
      color: 'amber',
      maxRetries: 2, // Allow 2 retries after initial failure
    },
    {
      value: 'rate_limit',
      label: t('retryTest.errorTypes.rate_limit'),
      description: t('retryTest.errorTypes.rate_limitDesc'),
      icon: '🚦',
      color: 'yellow',
      maxRetries: 3, // Allow 3 retries after initial failure
    },
    {
      value: 'api_error',
      label: t('retryTest.errorTypes.api_error'),
      description: t('retryTest.errorTypes.api_errorDesc'),
      icon: '⚠️',
      color: 'orange',
      maxRetries: 2, // Allow 2 retries after initial failure (search_failed)
    },
    {
      value: 'invalid_auth',
      label: t('retryTest.errorTypes.invalid_auth'),
      description: t('retryTest.errorTypes.invalid_authDesc'),
      icon: '🔒',
      color: 'red',
      maxRetries: 0, // No retries (permanent error)
    },
  ]

  const colorClasses = {
    blue: {
      bg: 'bg-blue-50 dark:bg-blue-950/30',
      border: 'border-blue-200 dark:border-blue-800',
      text: 'text-blue-700 dark:text-blue-300',
      dot: 'bg-blue-500',
    },
    amber: {
      bg: 'bg-amber-50 dark:bg-amber-950/30',
      border: 'border-amber-200 dark:border-amber-800',
      text: 'text-amber-700 dark:text-amber-300',
      dot: 'bg-amber-500',
    },
    yellow: {
      bg: 'bg-yellow-50 dark:bg-yellow-950/30',
      border: 'border-yellow-200 dark:border-yellow-800',
      text: 'text-yellow-700 dark:text-yellow-300',
      dot: 'bg-yellow-500',
    },
    orange: {
      bg: 'bg-orange-50 dark:bg-orange-950/30',
      border: 'border-orange-200 dark:border-orange-800',
      text: 'text-orange-700 dark:text-orange-300',
      dot: 'bg-orange-500',
    },
    red: {
      bg: 'bg-red-50 dark:bg-red-950/30',
      border: 'border-red-200 dark:border-red-800',
      text: 'text-red-700 dark:text-red-300',
      dot: 'bg-red-500',
    },
  }

  return (
    <div
      className={`rounded-xl overflow-hidden border transition-all duration-200 ${
        retryTestConfig.enabled
          ? 'border-violet-200 dark:border-violet-800 bg-violet-50/50 dark:bg-violet-950/20'
          : 'border-gray-200 dark:border-gray-800 bg-gray-50/30 dark:bg-gray-900/30'
      }`}
    >
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`w-full flex items-center justify-between px-4 py-3 transition-colors ${
          retryTestConfig.enabled
            ? 'hover:bg-violet-100/50 dark:hover:bg-violet-900/20'
            : 'hover:bg-gray-100/50 dark:hover:bg-gray-800/50'
        }`}
      >
        <div className="flex items-center gap-2.5">
          <div
            className={`p-1.5 rounded-lg transition-colors ${
              retryTestConfig.enabled
                ? 'bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
            }`}
          >
            <Bug size={14} />
          </div>
          <span className={`text-sm font-semibold ${retryTestConfig.enabled ? 'text-violet-900 dark:text-violet-100' : 'text-gray-700 dark:text-gray-300'}`}>
            {retryTestConfig.enabled ? t('retryTest.panelTitleActive') : t('retryTest.panelTitle')}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {retryTestConfig.enabled && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-violet-500 text-white font-medium flex items-center gap-1">
              <Zap size={10} />
              {t('retryTest.on')}
            </span>
          )}
          {isExpanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
        </div>
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="px-4 pb-4 space-y-4">
          {/* Enable Toggle */}
          <div className="flex items-center justify-between py-2">
            <label
              className={`text-sm font-medium ${retryTestConfig.enabled ? 'text-violet-900 dark:text-violet-100' : 'text-gray-700 dark:text-gray-300'}`}
            >
              {t('retryTest.enableTestMode')}
            </label>
            <button
              onClick={() => handleChange('enabled')(!retryTestConfig.enabled)}
              className={`relative w-11 h-6 rounded-full transition-all duration-200 ${
                retryTestConfig.enabled ? 'bg-violet-500 shadow-lg shadow-violet-500/30' : 'bg-gray-300 dark:bg-gray-600'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 bg-white w-5 h-5 rounded-full transition-transform duration-200 shadow-sm ${
                  retryTestConfig.enabled ? 'translate-x-5' : ''
                }`}
              />
            </button>
          </div>

          {/* Divider */}
          <div className="h-px bg-gray-200 dark:bg-gray-700" />

          {/* Configuration Grid */}
          <div className="grid grid-cols-2 gap-3">
            {/* Fail At Step */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                {t('retryTest.failAtStep')}
              </label>
              <input
                type="number"
                min="0"
                max="10"
                value={retryTestConfig.failAtStep}
                onChange={e => handleChange('failAtStep')(parseInt(e.target.value) || 0)}
                disabled={!retryTestConfig.enabled}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all outline-none"
              />
              <p className="text-[10px] text-gray-500 dark:text-gray-400">{t('retryTest.failAtStepHint')}</p>
            </div>

            {/* Fail Attempts */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                {t('retryTest.failAttempts')}
              </label>
              <input
                type="number"
                min="1"
                max="5"
                value={retryTestConfig.failAttempts}
                onChange={e => handleChange('failAttempts')(parseInt(e.target.value) || 1)}
                disabled={!retryTestConfig.enabled}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all outline-none"
              />
              <p className="text-[10px] text-gray-500 dark:text-gray-400">
                {t('retryTest.failAttemptsHint')} {retryTestConfig.errorType && (
                  <span className="text-violet-600 dark:text-violet-400 font-medium">
                    {t('retryTest.maxRetries')}: {errorTypes.find(e => e.value === retryTestConfig.errorType)?.maxRetries || 2}
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Error Type Selection - Compact Card Style */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400">{t('retryTest.errorType')}</label>
            <div className="grid grid-cols-2 gap-2">
              {errorTypes.map(type => {
                const colors = colorClasses[type.color]
                const isSelected = retryTestConfig.errorType === type.value
                return (
                  <label
                    key={type.value}
                    className={`relative flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-all ${
                      isSelected
                        ? `${colors.bg} ${colors.border} border-2`
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    } ${!retryTestConfig.enabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                  >
                    <input
                      type="radio"
                      name="errorType"
                      value={type.value}
                      checked={retryTestConfig.errorType === type.value}
                      onChange={() => handleChange('errorType')(type.value)}
                      disabled={!retryTestConfig.enabled}
                      className="sr-only"
                    />
                    <span className="text-sm">{type.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className={`text-xs font-semibold truncate ${isSelected ? colors.text : 'text-gray-700 dark:text-gray-300'}`}>
                        {type.label}
                      </div>
                      <div className={`text-[9px] ${isSelected ? colors.text : 'text-gray-400 dark:text-gray-500'} mt-0.5`}>
                        {t('retryTest.maxRetries')}: {type.maxRetries}
                      </div>
                    </div>
                    {isSelected && <div className={`w-2 h-2 rounded-full ${colors.dot}`} />}
                  </label>
                )
              })}
            </div>
          </div>

          {/* Current Config Summary - Minimal */}
          {retryTestConfig.enabled && (
            <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2 mb-1.5">
                <Bug size={12} className="text-gray-500 dark:text-gray-400" />
                <span className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Config
                </span>
              </div>
              <div className="text-xs font-mono text-gray-700 dark:text-gray-300 space-y-0.5">
                <div>
                  <span className="text-gray-500 dark:text-gray-400">enabled:</span>{' '}
                  <span className={retryTestConfig.enabled ? 'text-green-600 dark:text-green-400' : 'text-gray-600 dark:text-gray-400'}>
                    {String(retryTestConfig.enabled)}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">failAtStep:</span>{' '}
                  <span className="text-violet-600 dark:text-violet-400">{retryTestConfig.failAtStep}</span>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">failAttempts:</span>{' '}
                  <span className="text-violet-600 dark:text-violet-400">{retryTestConfig.failAttempts}</span>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">errorType:</span>{' '}
                  <span className="text-violet-600 dark:text-violet-400">{retryTestConfig.errorType}</span>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2">
            <button
              onClick={() => handleChange('enabled')(!retryTestConfig.enabled)}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all shadow-sm ${
                retryTestConfig.enabled
                  ? 'bg-red-500 hover:bg-red-600 text-white shadow-red-500/20'
                  : 'bg-violet-500 hover:bg-violet-600 text-white shadow-violet-500/20'
              }`}
            >
              {retryTestConfig.enabled ? (
                <>
                  <RotateCcw size={16} />
                  {t('retryTest.disableTestMode')}
                </>
              ) : (
                <>
                  <Play size={16} />
                  {t('retryTest.enableTestModeBtn')}
                </>
              )}
            </button>
            <button
              onClick={resetConfig}
              className="p-2.5 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 transition-colors"
              title={t('retryTest.resetConfig')}
            >
              <RotateCcw size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default RetryTestPanel
