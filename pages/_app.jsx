import Head from 'next/head'
import {
  IBM_Plex_Sans,
  JetBrains_Mono,
  Playfair_Display,
} from 'next/font/google'
import localFont from 'next/font/local'
import 'katex/dist/katex.min.css'
import '../src/index.css'

const getBasePath = () => {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ''
  return basePath.replace(/\/$/, '')
}

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-ibm-plex-sans',
})

const ibmPlexSansSC = localFont({
  src: [
    { path: '../public/fonts/IBMPlexSansSC-Regular.woff2', weight: '400' },
    { path: '../public/fonts/IBMPlexSansSC-Medium.woff2', weight: '500' },
    { path: '../public/fonts/IBMPlexSansSC-SemiBold.woff2', weight: '600' },
    { path: '../public/fonts/IBMPlexSansSC-Bold.woff2', weight: '700' },
  ],
  display: 'swap',
  variable: '--font-ibm-plex-sans-sc',
})

const playfairDisplay = Playfair_Display({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-playfair-display',
})

const jetBrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-jetbrains-mono',
})

export default function App({ Component, pageProps }) {
  const basePath = getBasePath()
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
      <div
        className={`${ibmPlexSans.className} ${ibmPlexSans.variable} ${ibmPlexSansSC.variable} ${playfairDisplay.variable} ${jetBrainsMono.variable}`}
      >
        <Component {...pageProps} />
      </div>
    </>
  )
}
