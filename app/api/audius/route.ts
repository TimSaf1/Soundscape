import { NextResponse } from 'next/server'
import {
  AUDIUS_HOST,
  APP_NAME,
  normalizeTrack,
  buildProxyUrl,
  type Track,
} from '@/lib/audius'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/* ---------------------------------------------------------------- helpers */

/** Normalize a string for fuzzy matching: lowercase, strip punctuation,
 *  collapse whitespace, drop common noise like "feat.", "(remix)" etc. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, ' ') // remove bracketed extras
    .replace(/feat\.?|ft\.?|prod\.?/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ') // drop punctuation (unicode-aware)
    .replace(/\s+/g, ' ')
    .trim()
}

type AudiusRaw = {
  id: string
  title: string
  duration: number
  genre?: string
  user?: { name?: string; handle?: string }
  artwork?: Record<string, string>
}

type ITunesRaw = {
  trackId: number
  trackName?: string
  artistName?: string
  collectionName?: string
  primaryGenreName?: string
  previewUrl?: string
  trackTimeMillis?: number
  releaseDate?: string
  artworkUrl100?: string
}

/** Turn an iTunes hi-res artwork URL into a larger variant. */
function itunesArt(url: string | undefined, size: number): string | null {
  if (!url) return null
  return url.replace(/\/\d+x\d+bb\.(jpg|png)/, `/${size}x${size}bb.$1`)
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

async function searchITunes(query: string): Promise<Track[]> {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(
    query,
  )}&media=music&entity=song&limit=40`
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  })
  if (!res.ok) return []
  const json = (await res.json()) as { results?: ITunesRaw[] }
  const raw = Array.isArray(json.results) ? json.results : []
  return raw
    .filter((t) => t.previewUrl && t.trackName)
    .map<Track>((t) => ({
      id: `itunes-${t.trackId}`,
      title: t.trackName ?? 'Unknown',
      artist: t.artistName ?? 'Unknown artist',
      artistHandle: '',
      duration: t.trackTimeMillis ? Math.round(t.trackTimeMillis / 1000) : 30,
      genre: t.primaryGenreName ?? '',
      artwork: itunesArt(t.artworkUrl100, 300),
      artworkLarge: itunesArt(t.artworkUrl100, 1000),
      // Preview URL kept as a fallback; primary playback is the full track via
      // YouTube's official IFrame player (resolved lazily on play).
      streamUrl: buildProxyUrl(t.previewUrl as string),
      full: true,
      source: 'youtube',
    }))
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

    /* ---- SEARCH: hybrid iTunes (whole catalog) + Audius (full versions) ---- */
    if (type === 'search') {
      const query = (searchParams.get('query') ?? '').trim()
      if (!query) return NextResponse.json({ tracks: [] })

      // Run both catalogs in parallel. iTunes gives us the whole mainstream
      // catalog + clean metadata/artwork; each result plays in full via the
      // YouTube IFrame player. Audius is a fallback for underground queries.
      const [itunes, audius] = await Promise.all([
        searchITunes(query).catch(() => [] as Track[]),
        searchAudius(query).catch(() => [] as Track[]),
      ])

      // iTunes is the trusted base (correct artist, plays full via YouTube).
      // Only fall back to the Audius catalog when iTunes has nothing, so random
      // covers/re-uploads never pollute a mainstream search.
      const merged: Track[] = itunes.length > 0 ? [...itunes] : [...audius]

      // Rank: exact matches first, then full versions above previews.
      const q = norm(query)
      const score = (t: Track) => {
        const title = norm(t.title)
        const artist = norm(t.artist)
        let s = 0
        if (title === q || artist === q) s += 40
        else if (title.startsWith(q) || artist.startsWith(q)) s += 25
        else if (title.includes(q) || artist.includes(q)) s += 12
        if (t.full) s += 5 // slight boost so playable-in-full ranks higher
        return s
      }
      merged.sort((a, b) => score(b) - score(a))

      return NextResponse.json({ tracks: merged.slice(0, 40) })
    }

    return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
  } catch (err) {
    console.log('[v0] search API error:', (err as Error).message)
    return NextResponse.json({ error: 'Fetch failed', tracks: [] }, { status: 500 })
  }
}
