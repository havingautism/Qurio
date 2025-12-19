const basePath = process.env.NEXT_PUBLIC_BASE_PATH?.replace(/\/$/, '')

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  ...(basePath ? { basePath } : {}),
  webpack(config) {
    config.module.rules.push({
      test: /\.svg$/i,
      resourceQuery: /url/,
      type: 'asset/resource',
    })
    return config
  },
}

export default nextConfig
