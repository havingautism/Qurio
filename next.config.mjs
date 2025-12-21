import path from 'path'
import { fileURLToPath } from 'url'

const basePath = process.env.NEXT_PUBLIC_BASE_PATH?.replace(/\/$/, '')
const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  ...(basePath ? { basePath } : {}),
  webpack(config) {
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      'katex/dist/katex.min.css': path.join(__dirname, 'src', 'lib', 'katexCssShim.js'),
    }
    config.module.rules.push({
      test: /\.svg$/i,
      resourceQuery: /url/,
      type: 'asset/resource',
    })
    return config
  },
}

export default nextConfig
