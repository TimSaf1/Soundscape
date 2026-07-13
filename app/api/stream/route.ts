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
  const src = searchParams.get('src')

  // Either an Audius track id (full track) or a direct audio URL (preview).
  let upstreamUrl: string
  if (id) {
    upstreamUrl = `${AUDIUS_HOST}/v1/tracks/${id}/stream?app_name=${APP_NAME}`
  } else if (src) {
    // Only allow http(s) targets to avoid SSRF via file:// or other schemes.
    try {
      const parsed = new URL(src)
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        return new Response('Bad src', { status: 400 })
      }
      upstreamUrl = parsed.toString()
    } catch {
      return new Response('Bad src', { status: 400 })
    }
  } else {
    return new Response('Missing id or src', { status: 400 })
  }

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
    // Normalize Apple's "audio/x-m4p" (and empty types) to formats browsers
    // reliably decode. iTunes previews are AAC in an MP4 container.
    const rawType = upstream.headers.get('content-type') ?? ''
    let contentType = rawType || 'audio/mpeg'
    if (rawType.includes('m4p') || rawType.includes('m4a') || /\.m4a/i.test(upstreamUrl)) {
      contentType = 'audio/mp4'
    }
    headers.set('Content-Type', contentType)
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
