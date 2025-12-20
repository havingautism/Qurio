import Head from 'next/head'
import '../src/index.css'

export default function App({ Component, pageProps }) {
  return (
    <>
      <Head>
        <title>Qurio</title>
        <meta name="description" content="Qurio" />
        <link rel="icon" href="/Qurio-logo-app-webtab.png" />
        <link rel="apple-touch-icon" href="/Qurio-logo-app.png" />
      </Head>
      <Component {...pageProps} />
    </>
  )
}
