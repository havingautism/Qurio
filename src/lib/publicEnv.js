const PUBLIC_ENV = {
  PUBLIC_OPENAI_API_KEY: import.meta.env.PUBLIC_OPENAI_API_KEY,
  PUBLIC_OPENAI_BASE_URL: import.meta.env.PUBLIC_OPENAI_BASE_URL,
  PUBLIC_SILICONFLOW_API_KEY: import.meta.env.PUBLIC_SILICONFLOW_API_KEY,
  PUBLIC_SILICONFLOW_BASE_URL: import.meta.env.PUBLIC_SILICONFLOW_BASE_URL,
  PUBLIC_GLM_API_KEY: import.meta.env.PUBLIC_GLM_API_KEY,
  PUBLIC_GLM_BASE_URL: import.meta.env.PUBLIC_GLM_BASE_URL,
  PUBLIC_MODELSCOPE_API_KEY: import.meta.env.PUBLIC_MODELSCOPE_API_KEY,
  PUBLIC_MODELSCOPE_BASE_URL: import.meta.env.PUBLIC_MODELSCOPE_BASE_URL,
  PUBLIC_MODELSCOPE_PROXY_TARGET: import.meta.env.PUBLIC_MODELSCOPE_PROXY_TARGET,
  PUBLIC_KIMI_API_KEY: import.meta.env.PUBLIC_KIMI_API_KEY,
  PUBLIC_KIMI_BASE_URL: import.meta.env.PUBLIC_KIMI_BASE_URL,
  PUBLIC_KIMI_PROXY_TARGET: import.meta.env.PUBLIC_KIMI_PROXY_TARGET,
  PUBLIC_GOOGLE_API_KEY: import.meta.env.PUBLIC_GOOGLE_API_KEY,
  PUBLIC_TAVILY_API_KEY: import.meta.env.PUBLIC_TAVILY_API_KEY,
  PUBLIC_BACKEND_URL: import.meta.env.PUBLIC_BACKEND_URL,
  PUBLIC_NOTION_OAUTH_URL: import.meta.env.PUBLIC_NOTION_OAUTH_URL,
}

export const getPublicEnv = key => {
  if (Object.prototype.hasOwnProperty.call(PUBLIC_ENV, key)) {
    const value = PUBLIC_ENV[key]
    if (value !== undefined && value !== null && value !== '') return value
  }
  if (typeof process !== 'undefined' && process.env) {
    const value = process.env[key]
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
