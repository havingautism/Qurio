import { defineConfig, loadEnv } from '@rsbuild/core'
import { pluginReact } from '@rsbuild/plugin-react'
import { pluginNodePolyfill } from '@rsbuild/plugin-node-polyfill'

export default defineConfig(({ env }) => {
  const envVars = loadEnv({
    mode: env.envMode,
    prefixes: ['PUBLIC_'],
  })

  const openAIBaseUrl = envVars.parsed.PUBLIC_OPENAI_BASE_URL || process.env.PUBLIC_OPENAI_BASE_URL
  const glmBaseUrl = envVars.parsed.PUBLIC_GLM_BASE_URL || process.env.PUBLIC_GLM_BASE_URL
  const kimiBaseUrl = envVars.parsed.PUBLIC_KIMI_BASE_URL || process.env.PUBLIC_KIMI_BASE_URL
  // Base path for GitHub Pages (set to "/Qurio/" for project page). Allow override via env.
  // In development, use root path to avoid issues with chunk loading
  const isDev = env.mode === 'development'
  const assetPrefix = isDev ? '/' : (process.env.PUBLIC_BASE_PATH || '/Qurio/')

  return {
    plugins: [pluginReact(), pluginNodePolyfill()],
    html: {
      template: './index.html',
    },
    output: {
      assetPrefix,
    },
    source: {
      entry: {
        index: './src/main.jsx',
      },
      define: {
        ...envVars.publicVars,
      },
    },
    server: {
      host: '0.0.0.0',
      proxy:
        openAIBaseUrl || glmBaseUrl || kimiBaseUrl
          ? {
              ...(openAIBaseUrl && {
                '/api/openaiCompatible': {
                  target: openAIBaseUrl,
                  changeOrigin: true,
                  pathRewrite: { '^/api/openaiCompatible': '' },
                },
              }),
              ...(glmBaseUrl && {
                '/api/glm': {
                  target: glmBaseUrl,
                  changeOrigin: true,
                  pathRewrite: { '^/api/glm': '' },
                },
              }),
              ...(kimiBaseUrl && {
                '/api/kimi': {
                  target: kimiBaseUrl,
                  changeOrigin: true,
                  pathRewrite: { '^/api/kimi': '' },
                },
              }),
            }
          : undefined,
    },
  }
})
