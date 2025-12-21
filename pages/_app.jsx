import Head from 'next/head'
import { Geist, JetBrains_Mono, Noto_Sans_SC } from 'next/font/google'
import 'katex/dist/katex.min.css'
import '../src/index.css'

const getBasePath = () => {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ''
  return basePath.replace(/\/$/, '')
}

const notoSansSC = Noto_Sans_SC({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-noto-sc',
})

const geist = Geist({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-geist-sans',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jetbrains-mono',
})

export default function App({ Component, pageProps }) {
  const basePath = getBasePath()
  const fontVariables = `${geist.variable} ${notoSansSC.variable} ${jetbrainsMono.variable}`

  return (
    <>
      <Head>
        <title>Qurio</title>
        <meta name="description" content="Qurio" />
        <meta name="theme-color" content="#18181b" />
        <link rel="manifest" href={`${basePath}/manifest.json`} />
        <link rel="icon" href={`${basePath}/Qurio-logo-app-webtab.png`} />
        <link rel="apple-touch-icon" href={`${basePath}/Qurio-logo-app.png`} />
      </Head>
      <main className={fontVariables}>
        <Component {...pageProps} />
      </main>
    </>
  )
}
