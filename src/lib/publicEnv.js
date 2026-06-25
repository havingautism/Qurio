/**
 * Public environment variables accessor.
 * Reads values injected at build time from .env (import.meta.env.PUBLIC_*).
 * Electron runtime always returns undefined (backend URL comes from bridge).
 */

// Static map of build-time env vars (injected by RSBuild/Vite)
const PUBLIC_ENV = {
  PUBLIC_OPENAI_API_KEY: import.meta.env.PUBLIC_OPENAI_API_KEY,
  PUBLIC_OPENAI_BASE_URL: import.meta.env.PUBLIC_OPENAI_BASE_URL,
  PUBLIC_OPENROUTER_API_KEY: import.meta.env.PUBLIC_OPENROUTER_API_KEY,
  PUBLIC_HUGGINGFACE_API_KEY: import.meta.env.PUBLIC_HUGGINGFACE_API_KEY,
  PUBLIC_SILICONFLOW_API_KEY: import.meta.env.PUBLIC_SILICONFLOW_API_KEY,
  PUBLIC_SILICONFLOW_BASE_URL: import.meta.env.PUBLIC_SILICONFLOW_BASE_URL,
  PUBLIC_GLM_API_KEY: import.meta.env.PUBLIC_GLM_API_KEY,
  PUBLIC_GLM_BASE_URL: import.meta.env.PUBLIC_GLM_BASE_URL,
  PUBLIC_DEEPSEEK_API_KEY: import.meta.env.PUBLIC_DEEPSEEK_API_KEY,
  PUBLIC_DEEPSEEK_BASE_URL: import.meta.env.PUBLIC_DEEPSEEK_BASE_URL,
  PUBLIC_VOLCENGINE_API_KEY: import.meta.env.PUBLIC_VOLCENGINE_API_KEY,
  PUBLIC_VOLCENGINE_BASE_URL: import.meta.env.PUBLIC_VOLCENGINE_BASE_URL,
  PUBLIC_MODELSCOPE_API_KEY: import.meta.env.PUBLIC_MODELSCOPE_API_KEY,
  PUBLIC_MODELSCOPE_BASE_URL: import.meta.env.PUBLIC_MODELSCOPE_BASE_URL,
  PUBLIC_MODELSCOPE_PROXY_TARGET: import.meta.env.PUBLIC_MODELSCOPE_PROXY_TARGET,
  PUBLIC_KIMI_API_KEY: import.meta.env.PUBLIC_KIMI_API_KEY,
  PUBLIC_KIMI_BASE_URL: import.meta.env.PUBLIC_KIMI_BASE_URL,
  PUBLIC_KIMI_PROXY_TARGET: import.meta.env.PUBLIC_KIMI_PROXY_TARGET,
  PUBLIC_GOOGLE_API_KEY: import.meta.env.PUBLIC_GOOGLE_API_KEY,
  PUBLIC_TAVILY_API_KEY: import.meta.env.PUBLIC_TAVILY_API_KEY,
  PUBLIC_SERPAPI_API_KEY: import.meta.env.PUBLIC_SERPAPI_API_KEY,
  PUBLIC_BACKEND_URL: import.meta.env.PUBLIC_BACKEND_URL,
  PUBLIC_NOTION_OAUTH_URL: import.meta.env.PUBLIC_NOTION_OAUTH_URL,
}

const isElectronRuntime = () => {
  if (typeof window === 'undefined') return false
  const hasBackendOverrideInQuery = window.location.search.includes('backend_url=')
  return (
    window.location.protocol === 'file:' ||
    navigator.userAgent.includes('Electron') ||
    hasBackendOverrideInQuery
  )
}

// Look up an env var by key. Returns undefined if not set, empty, or Electron runtime.
export const getPublicEnv = key => {
  if (key === 'PUBLIC_BACKEND_URL' && isElectronRuntime()) {
    return undefined
  }

  if (isElectronRuntime()) return undefined

  if (Object.prototype.hasOwnProperty.call(PUBLIC_ENV, key)) {
    const value = PUBLIC_ENV[key]
    if (value !== undefined && value !== null && value !== '') return value
  }
  if (typeof globalThis.process !== 'undefined' && globalThis.process?.env) {
    const value = globalThis.process.env[key]
    if (value !== undefined && value !== null && value !== '') return value
  }
  return undefined
}

export const getNodeEnv = () => {
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.MODE) {
    return import.meta.env.MODE
  }
  return 'development'
}
