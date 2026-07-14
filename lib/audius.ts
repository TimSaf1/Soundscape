export type TrackSource = 'audius' | 'youtube' | 'preview'

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
  /** true = full track, false = 30s preview */
  full: boolean
  /** Which engine plays this track. */
  source: TrackSource
  /** Resolved lazily for YouTube tracks (see resolveYouTubeId). */
  youtubeId?: string | null
}

/** Resolve a YouTube video id for a track by "artist title" query. Results are
 *  cached per session and in-flight requests are de-duped so prefetch + click
 *  never fire the same lookup twice. */
const ytCache = new Map<string, string | null>()
const ytInFlight = new Map<string, Promise<string | null>>()

export async function resolveYouTubeId(track: Track): Promise<string | null> {
  if (track.youtubeId) return track.youtubeId
  const key = `${track.artist} ${track.title}`.toLowerCase()
  if (ytCache.has(key)) return ytCache.get(key) ?? null

  const existing = ytInFlight.get(key)
  if (existing) return existing

  const promise = (async () => {
    try {
      const res = await fetch(
        `/api/youtube?q=${encodeURIComponent(`${track.artist} ${track.title}`)}`,
      )
      if (!res.ok) throw new Error(String(res.status))
      const json = (await res.json()) as { videoId: string | null }
      ytCache.set(key, json.videoId ?? null)
      return json.videoId ?? null
    } catch {
      ytCache.set(key, null)
      return null
    } finally {
      ytInFlight.delete(key)
    }
  })()

  ytInFlight.set(key, promise)
  return promise
}

/** Fire-and-forget warmup so a track's video id is ready before the user taps
 *  play. Safe to call repeatedly; caching/dedup make extra calls free. */
export function prefetchYouTubeId(track: Track): void {
  if (track.source !== 'youtube') return
  const key = `${track.artist} ${track.title}`.toLowerCase()
  if (ytCache.has(key) || ytInFlight.has(key)) return
  void resolveYouTubeId(track)
}

/** Synchronous cache read. Returns the id if warmed, `null` if we know there's
 *  no match, or `undefined` if not looked up yet. Used to start playback inside
 *  the click handler (no await) so browsers keep the autoplay gesture. */
export function getCachedYouTubeId(track: Track): string | null | undefined {
  if (track.youtubeId) return track.youtubeId
  const key = `${track.artist} ${track.title}`.toLowerCase()
  return ytCache.get(key)
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
    source: 'audius',
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
