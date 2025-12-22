import { NextResponse } from 'next/server'

// Standard Next.js Middleware configuration
export const config = {
  matcher: ['/api/llm/:path*'],
}

export default async function middleware(request) {
  // 1. Prevent infinite proxy loops
  if (request.headers.get('x-edge-proxy') === 'true') {
    return NextResponse.next()
  }

  const url = request.nextUrl.clone()
  const headers = new Headers(request.headers)
  headers.set('x-edge-proxy', 'true')

  try {
    // 2. Establish a proxy link from Edge to Node API
    const upstreamResponse = await fetch(url.toString(), {
      method: request.method,
      headers,
      body: request.method !== 'GET' ? request.body : null,
      redirect: 'follow',
    })

    // 3. Stream the response body back to the client
    // This allows the connection to stay alive beyond the standard 30s timeout
    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      headers: {
        'x-proxy-active': 'true',
        'Content-Type':
          upstreamResponse.headers.get('Content-Type') || 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
        ...Object.fromEntries(upstreamResponse.headers.entries()),
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Edge Proxy middleware failed: ' + error.message },
      { status: 500 },
    )
  }
}
