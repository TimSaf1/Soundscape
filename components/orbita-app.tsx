'use client'

import { useEffect, useRef, useState } from 'react'
import { Search, X, Loader } from 'lucide-react'
import { CosmicMap } from '@/components/cosmic-map'
import { TrackLane } from '@/components/track-lane'
import { searchTracks, trendingByGenre, type Track } from '@/lib/audius'
import type { Planet } from '@/lib/genres'
import { PLANETS } from '@/lib/genres'

type LaneState = {
  title: string
  tracks: Track[]
  loading: boolean
}

const DEFAULT_PLANET = PLANETS.find((p) => p.genre === 'Electronic') ?? PLANETS[0]

export function OrbitaApp() {
  const [activeGenre, setActiveGenre] = useState<string | null>(DEFAULT_PLANET.genre)
  const [lane, setLane] = useState<LaneState>({
    title: `Планета «${DEFAULT_PLANET.label}»`,
    tracks: [],
    loading: true,
  })
  const [query, setQuery] = useState('')
  const composingRef = useRef(false)
  const reqIdRef = useRef(0)

  async function loadGenre(planet: Planet) {
    const reqId = ++reqIdRef.current
    setActiveGenre(planet.genre)
    setQuery('')
    setLane((l) => ({ ...l, title: `Планета «${planet.label}»`, loading: true }))
    try {
      const tracks = await trendingByGenre(planet.genre)
      if (reqId === reqIdRef.current) {
        setLane({ title: `Планета «${planet.label}»`, tracks, loading: false })
      }
    } catch {
      if (reqId === reqIdRef.current) {
        setLane({ title: `Планета «${planet.label}»`, tracks: [], loading: false })
      }
    }
  }

  async function runSearch(q: string) {
    const term = q.trim()
    if (!term) return
    const reqId = ++reqIdRef.current
    setActiveGenre(null)
    setLane({ title: `Поиск: «${term}»`, tracks: [], loading: true })
    try {
      const tracks = await searchTracks(term)
      if (reqId === reqIdRef.current) {
        setLane({ title: `Поиск: «${term}»`, tracks, loading: false })
      }
    } catch {
      if (reqId === reqIdRef.current) {
        setLane({ title: `Поиск: «${term}»`, tracks: [], loading: false })
      }
    }
  }

  // Initial load
  useEffect(() => {
    loadGenre(DEFAULT_PLANET)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-6 px-4 pb-32 pt-5">
      {/* Search */}
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          size={18}
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onCompositionStart={() => (composingRef.current = true)}
          onCompositionEnd={() => (composingRef.current = false)}
          onKeyDown={(e) => {
            if (
              e.key === 'Enter' &&
              !composingRef.current &&
              e.nativeEvent.isComposing !== true &&
              e.keyCode !== 229
            ) {
              runSearch(query)
            }
          }}
          placeholder="Поиск треков и исполнителей…"
          className="h-12 w-full rounded-full border border-border bg-card/70 pl-11 pr-11 text-sm outline-none transition placeholder:text-muted-foreground focus:border-primary/60 focus:ring-2 focus:ring-primary/25"
          aria-label="Поиск треков"
        />
        {query && (
          <button
            onClick={() => {
              setQuery('')
              loadGenre(DEFAULT_PLANET)
            }}
            className="absolute right-3 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-muted-foreground transition hover:bg-secondary hover:text-foreground"
            aria-label="Очистить поиск"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Cosmic genre map */}
      <CosmicMap activeGenre={activeGenre} onSelect={loadGenre} />

      {/* Track lane */}
      <TrackLane
        title={lane.title}
        tracks={lane.tracks}
        loading={lane.loading}
        emptyLabel={
          activeGenre
            ? 'На этой планете пока тихо. Попробуй другой жанр.'
            : 'Ничего не нашлось. Попробуй другой запрос.'
        }
      />

      {lane.loading && (
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Loader className="animate-spin" size={14} /> Настраиваем радиотелескопы…
        </div>
      )}
    </main>
  )
}
