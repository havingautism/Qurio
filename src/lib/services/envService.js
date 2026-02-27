/**
 * Environment Service
 * Handles checks and configuration for the backend environment (e.g. browser binaries).
 */
import { loadSettings } from '../settings'

const getBackendUrl = () => {
  const settings = loadSettings()
  return settings.backendUrl || 'http://127.0.0.1:3002'
}

/**
 * Check if the scraper engine (browser binaries) is installed.
 */
export const checkEnvStatus = async () => {
  try {
    const res = await fetch(`${getBackendUrl()}/api/env/status`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } catch (err) {
    return { status: 'error', message: err.message, chromium_installed: false }
  }
}

/**
 * Trigger the installation of browser binaries (playwright install chromium).
 */
export const installScraperEngine = async () => {
  try {
    const res = await fetch(`${getBackendUrl()}/api/env/install-browsers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.detail || `HTTP ${res.status}`)
    }
    return { data: await res.json(), error: null }
  } catch (err) {
    return { data: null, error: err.message || 'Failed to trigger installation' }
  }
}
