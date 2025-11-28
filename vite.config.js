import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const config = loadEnv(mode, './')
  return {
  plugins: [react()],
  server: {
    host: true,
    proxy: {
      '/api/openaiCompatible': {
        target: config.VITE_OPENAI_BASE_URL,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/openaiCompatible/, ''),
      },
    },
  }
}})
