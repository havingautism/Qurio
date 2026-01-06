import { useState, useEffect } from 'react'
import { loadSettings } from '../lib/settings'

/**
 * Hook to access application settings reactively.
 * Listens for the 'settings-changed' event dispatched by settings.js.
 * @returns {Object} The current settings object
 */
const useSettings = () => {
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
