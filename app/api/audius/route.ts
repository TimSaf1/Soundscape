import { NextResponse } from 'next/server'
import { AUDIUS_HOST, APP_NAME, normalizeTrack } from '@/lib/audius'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type')

  try {
    let url: string

    if (type === 'search') {
      const query = (searchParams.get('query') ?? '').trim()
      if (!query) return NextResponse.json({ tracks: [] })
      url = `${AUDIUS_HOST}/v1/tracks/search?query=${encodeURIComponent(
        query,
      )}&only_downloadable=false&app_name=${APP_NAME}`
    } else if (type === 'trending') {
      const genre = searchParams.get('genre') ?? ''
      const genreParam = genre ? `&genre=${encodeURIComponent(genre)}` : ''
      url = `${AUDIUS_HOST}/v1/tracks/trending?time=month${genreParam}&app_name=${APP_NAME}`
    } else {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
    }

    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      // Cache trending briefly; search always fresh
      next: { revalidate: type === 'trending' ? 300 : 0 },
    })

    if (!res.ok) {
      return NextResponse.json(
        { error: `Audius responded ${res.status}`, tracks: [] },
        { status: 502 },
      )
    }

    const json = (await res.json()) as { data?: unknown[] }
    const raw = Array.isArray(json.data) ? json.data : []
    let tracks = raw
      // Keep only playable tracks with artwork for a clean UI
      .map((t) => normalizeTrack(t as never))
      .filter((t) => t.duration > 0)

    // For search, rank by how closely title/artist matches the query so the
    // most relevant tracks appear first (Audius default order is fuzzy).
    if (type === 'search') {
      const q = (searchParams.get('query') ?? '').trim().toLowerCase()
      const score = (t: (typeof tracks)[number]) => {
        const title = t.title.toLowerCase()
        const artist = t.artist.toLowerCase()
        if (title === q || artist === q) return 4
        if (title.startsWith(q) || artist.startsWith(q)) return 3
        if (title.includes(q) || artist.includes(q)) return 2
        return 1
      }
      tracks = tracks.sort((a, b) => score(b) - score(a))
    }

    return NextResponse.json({ tracks: tracks.slice(0, 30) })
  } catch (err) {
    console.log('[v0] Audius API error:', (err as Error).message)
    return NextResponse.json({ error: 'Fetch failed', tracks: [] }, { status: 500 })
  }
}
