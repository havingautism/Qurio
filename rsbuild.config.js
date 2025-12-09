import { defineConfig, loadEnv } from '@rsbuild/core'
import { pluginReact } from '@rsbuild/plugin-react'

export default defineConfig(({ env }) => {
  const envVars = loadEnv({
    mode: env.envMode,
    prefixes: ['PUBLIC_'],
  })

  const openAIBaseUrl = envVars.parsed.PUBLIC_OPENAI_BASE_URL || process.env.PUBLIC_OPENAI_BASE_URL
  // Base path for GitHub Pages (set to "/Qurio/" for project page). Allow override via env.
  const assetPrefix = process.env.PUBLIC_BASE_PATH || '/Qurio/'

  return {
    plugins: [pluginReact()],
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
      proxy: openAIBaseUrl
        ? {
            '/api/openaiCompatible': {
              target: openAIBaseUrl,
              changeOrigin: true,
              pathRewrite: { '^/api/openaiCompatible': '' },
            },
          }
        : undefined,
    },
  }
})
