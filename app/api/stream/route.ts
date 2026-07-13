import { AUDIUS_HOST, APP_NAME } from '@/lib/audius'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Audio streaming proxy.
 *
 * The browser only ever talks to our own Vercel domain, and this route fetches
 * the real audio from Audius server-side. This avoids two problems:
 *   1. Audius 302-redirects <audio> to rotating third-party CDN hosts that may
 *      be blocked/slow on some networks (causing 0:00 duration + silence).
 *   2. Cross-origin quirks with seeking.
 *
 * Range headers are forwarded so scrubbing (seek) keeps working.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return new Response('Missing id', { status: 400 })

  const upstreamUrl = `${AUDIUS_HOST}/v1/tracks/${id}/stream?app_name=${APP_NAME}`
  const range = request.headers.get('range')

  try {
    const upstream = await fetch(upstreamUrl, {
      headers: range ? { Range: range } : {},
      redirect: 'follow',
      cache: 'no-store',
    })

    if (!upstream.ok && upstream.status !== 206) {
      return new Response('Upstream error', { status: 502 })
    }

    const headers = new Headers()
    headers.set('Content-Type', upstream.headers.get('content-type') ?? 'audio/mpeg')
    headers.set('Accept-Ranges', 'bytes')
    const len = upstream.headers.get('content-length')
    if (len) headers.set('Content-Length', len)
    const contentRange = upstream.headers.get('content-range')
    if (contentRange) headers.set('Content-Range', contentRange)
    headers.set('Cache-Control', 'public, max-age=86400')

    return new Response(upstream.body, {
      status: upstream.status,
      headers,
    })
  } catch (err) {
    console.log('[v0] stream proxy error:', (err as Error).message)
    return new Response('Fetch failed', { status: 500 })
  }
}
