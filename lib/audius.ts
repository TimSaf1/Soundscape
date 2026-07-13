export type Track = {
  id: string
  title: string
  artist: string
  artistHandle: string
  duration: number // seconds
  genre: string
  artwork: string | null
  artworkLarge: string | null
  streamUrl: string
  /** true = full track (Audius), false = 30s preview (iTunes/Deezer) */
  full: boolean
}

export const AUDIUS_HOST = 'https://api.audius.co'
export const APP_NAME = 'Orbita'

/** Stream through our own domain (see app/api/stream). This keeps playback on a
 *  single, reachable origin and forwards Range requests so <audio> can scrub. */
export function buildStreamUrl(id: string): string {
  return `/api/stream?id=${encodeURIComponent(id)}`
}

/** Proxy an arbitrary audio URL (e.g. a 30s iTunes/Deezer preview) through our
 *  own domain so it plays even on networks that block the origin host. */
export function buildProxyUrl(src: string): string {
  return `/api/stream?src=${encodeURIComponent(src)}`
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

type AudiusRawTrack = {
  id: string
  title: string
  duration: number
  genre?: string
  user?: { name?: string; handle?: string }
  artwork?: { '150x150'?: string; '480x480'?: string; '1000x1000'?: string }
}

export function normalizeTrack(raw: AudiusRawTrack): Track {
  return {
    id: raw.id,
    title: raw.title,
    artist: raw.user?.name ?? 'Unknown artist',
    artistHandle: raw.user?.handle ?? '',
    duration: raw.duration ?? 0,
    genre: raw.genre ?? '',
    artwork: raw.artwork?.['480x480'] ?? raw.artwork?.['150x150'] ?? null,
    artworkLarge: raw.artwork?.['1000x1000'] ?? raw.artwork?.['480x480'] ?? null,
    streamUrl: buildStreamUrl(raw.id),
    full: true,
  }
}

async function fetchFromApi(params: Record<string, string>): Promise<Track[]> {
  const qs = new URLSearchParams(params).toString()
  const res = await fetch(`/api/audius?${qs}`)
  if (!res.ok) throw new Error(`Audius request failed: ${res.status}`)
  const json = (await res.json()) as { tracks: Track[] }
  return json.tracks ?? []
}

export function searchTracks(query: string): Promise<Track[]> {
  return fetchFromApi({ type: 'search', query })
}

export function trendingByGenre(genre: string): Promise<Track[]> {
  return fetchFromApi({ type: 'trending', genre })
}
