import { useState, useEffect } from 'react'
import { loadSettings } from '../lib/settings'

/**
 * Reactive settings hook — mirrors consolidated settings (env + memory + session + localStorage)
 * into React state via custom 'settings-changed' event pub/sub.
 */
const useSettings = () => {
  // Lazy init: run loadSettings() only on first render
  const [settings, setSettings] = useState(() => loadSettings())

  useEffect(() => {
    const handleSettingsChange = () => {
      setSettings(loadSettings())
    }

    window.addEventListener('settings-changed', handleSettingsChange)
    return () => {
      window.removeEventListener('settings-changed', handleSettingsChange)
    }
  }, [])

  return settings
}

export default useSettings
