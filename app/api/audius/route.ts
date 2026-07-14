import { NextResponse } from 'next/server'
import { AUDIUS_HOST, APP_NAME, normalizeTrack, type Track } from '@/lib/audius'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/* ---------------------------------------------------------------- helpers */

type AudiusRaw = {
  id: string
  title: string
  duration: number
  genre?: string
  user?: { name?: string; handle?: string }
  artwork?: Record<string, string>
}

/** Parse a YouTube duration label ("3:46", "1:02:33") into seconds. */
function parseDuration(text: string | undefined): number {
  if (!text) return 0
  const parts = text.split(':').map((n) => parseInt(n, 10))
  if (parts.some(Number.isNaN)) return 0
  return parts.reduce((acc, n) => acc * 60 + n, 0)
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

type YtVideo = {
  videoId?: string
  title?: { runs?: { text?: string }[] }
  ownerText?: { runs?: { text?: string }[] }
  longBylineText?: { runs?: { text?: string }[] }
  lengthText?: { simpleText?: string }
}

/** Primary search: scrape YouTube (video filter) for real, popular results.
 *  YouTube covers virtually every artist/track worldwide — mainstream, RU rap,
 *  underground, brand-new 2026 releases — already ranked by relevance. We only
 *  read public metadata + a video id to embed the official IFrame player. */
async function searchYouTube(query: string): Promise<Track[]> {
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(
    query,
  )}&sp=EgIQAQ%253D%253D` // filter: type = video

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 6000)
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
    cache: 'no-store',
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout))
  if (!res.ok) return []

  const html = await res.text()
  const m = html.match(/var ytInitialData = (\{.+?\});<\/script>/s)
  if (!m) return []

  let data: unknown
  try {
    data = JSON.parse(m[1])
  } catch {
    return []
  }

  const sections =
    (data as any)?.contents?.twoColumnSearchResultsRenderer?.primaryContents
      ?.sectionListRenderer?.contents ?? []

  const out: Track[] = []
  const seen = new Set<string>()

  for (const sec of sections) {
    const list = sec?.itemSectionRenderer?.contents ?? []
    for (const it of list) {
      const v: YtVideo | undefined = it?.videoRenderer
      if (!v?.videoId || seen.has(v.videoId)) continue

      const title = v.title?.runs?.[0]?.text ?? ''
      const artist =
        v.ownerText?.runs?.[0]?.text ?? v.longBylineText?.runs?.[0]?.text ?? 'YouTube'
      const duration = parseDuration(v.lengthText?.simpleText)

      // Keep music-length results only: drop live streams (no duration) and
      // long-form noise like concerts, mixes, reactions and compilations.
      if (duration < 30 || duration > 780) continue

      seen.add(v.videoId)
      out.push({
        id: `yt-${v.videoId}`,
        title,
        artist: artist.replace(/\s*-\s*Topic$/i, ''), // clean "Artist - Topic"
        artistHandle: '',
        duration,
        genre: '',
        // hqdefault always exists (maxres often 404s), so use it for both.
        artwork: `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
        artworkLarge: `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
        streamUrl: '',
        full: true,
        source: 'youtube',
        youtubeId: v.videoId, // set up-front → playback is instant, no re-lookup
      })
    }
  }
  return out
}

async function searchAudius(query: string): Promise<Track[]> {
  const url = `${AUDIUS_HOST}/v1/tracks/search?query=${encodeURIComponent(
    query,
  )}&only_downloadable=false&app_name=${APP_NAME}`
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  })
  if (!res.ok) return []
  const json = (await res.json()) as { data?: AudiusRaw[] }
  const raw = Array.isArray(json.data) ? json.data : []
  return raw.map((t) => normalizeTrack(t as never)).filter((t) => t.duration > 0)
}

/* ------------------------------------------------------------------ route */

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type')

  try {
    /* ---- TRENDING (genre planets): Audius full tracks only ---- */
    if (type === 'trending') {
      const genre = searchParams.get('genre') ?? ''
      const genreParam = genre ? `&genre=${encodeURIComponent(genre)}` : ''
      const url = `${AUDIUS_HOST}/v1/tracks/trending?time=month${genreParam}&app_name=${APP_NAME}`
      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        next: { revalidate: 300 },
      })
      if (!res.ok) {
        return NextResponse.json({ tracks: [] }, { status: 502 })
      }
      const json = (await res.json()) as { data?: AudiusRaw[] }
      const raw = Array.isArray(json.data) ? json.data : []
      const tracks = raw
        .map((t) => normalizeTrack(t as never))
        .filter((t) => t.duration > 0)
        .slice(0, 30)
      return NextResponse.json({ tracks })
    }

    /* ---- SEARCH: YouTube-first (finds anything, ranked by popularity) ---- */
    if (type === 'search') {
      const query = (searchParams.get('query') ?? '').trim()
      if (!query) return NextResponse.json({ tracks: [] })

      // YouTube is the primary catalog: it has virtually every track (RU rap,
      // underground, brand-new 2026 releases) and returns them ranked by
      // popularity/relevance, so we PRESERVE its order instead of re-sorting.
      let tracks = await searchYouTube(query).catch(() => [] as Track[])

      // Safety net: if YouTube scraping ever fails, fall back to Audius so the
      // search still returns something playable rather than an empty screen.
      if (tracks.length === 0) {
        tracks = await searchAudius(query).catch(() => [] as Track[])
      }

      return NextResponse.json({ tracks: tracks.slice(0, 40) })
    }

    return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
  } catch (err) {
    console.log('[v0] search API error:', (err as Error).message)
    return NextResponse.json({ error: 'Fetch failed', tracks: [] }, { status: 500 })
  }
}
