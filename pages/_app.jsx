import Head from 'next/head'
import '../src/index.css'

const getBasePath = () => {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ''
  return basePath.replace(/\/$/, '')
}

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
      <Component {...pageProps} />
    </>
  )
}
