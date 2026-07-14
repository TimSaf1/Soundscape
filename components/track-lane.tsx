'use client'

import { useEffect } from 'react'
import Image from 'next/image'
import { Play, Pause, Music, Loader } from 'lucide-react'
import type { Track } from '@/lib/audius'
import { formatTime, prefetchYouTubeId } from '@/lib/audius'
import { usePlayer } from '@/components/player-context'
import { cn } from '@/lib/utils'

function TrackCard({
  track,
  tracks,
  index,
}: {
  track: Track
  tracks: Track[]
  index: number
}) {
  const { current, isPlaying, isLoading, playQueue, toggle } = usePlayer()
  const isCurrent = current?.id === track.id
  const showPause = isCurrent && isPlaying

  // Warm up the YouTube video id for the first few cards so tapping play is
  // instant instead of waiting on a live lookup.
  useEffect(() => {
    if (index < 6) prefetchYouTubeId(track)
  }, [track, index])

  const onClick = () => {
    if (isCurrent) toggle()
    else playQueue(tracks, index)
  }

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => prefetchYouTubeId(track)}
      onFocus={() => prefetchYouTubeId(track)}
      className={cn(
        'group flex w-40 shrink-0 flex-col gap-2 rounded-2xl border p-2.5 text-left transition',
        isCurrent
          ? 'border-primary/60 bg-primary/10'
          : 'border-border bg-card/60 hover:border-white/20 hover:bg-card',
      )}
    >
      <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-secondary">
        {track.artwork ? (
          <Image
            src={track.artwork || '/placeholder.svg'}
            alt={`Обложка: ${track.title}`}
            fill
            sizes="160px"
            className="object-cover"
            unoptimized
          />
        ) : (
          <div className="grid h-full w-full place-items-center">
            <Music className="text-muted-foreground" size={32} />
          </div>
        )}
        <span
          className={cn(
            'absolute bottom-2 right-2 grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg transition',
            isCurrent ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
          )}
        >
          {isCurrent && isLoading ? (
            <Loader className="animate-spin" size={16} />
          ) : showPause ? (
            <Pause size={16} />
          ) : (
            <Play className="translate-x-px" size={16} />
          )}
        </span>
      </div>
      <div className="min-w-0">
        <p className={cn('truncate text-sm font-medium', isCurrent && 'text-primary')}>
          {track.title}
        </p>
        <p className="truncate text-xs text-muted-foreground">{track.artist}</p>
      </div>
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span
          className={cn(
            'rounded-full px-1.5 py-0.5 font-medium',
            track.full
              ? 'bg-primary/15 text-primary'
              : 'bg-secondary text-muted-foreground',
          )}
        >
          {track.full ? 'Полная' : '30 сек'}
        </span>
        <span className="tabular-nums">{formatTime(track.duration)}</span>
      </div>
    </button>
  )
}

export function TrackLane({
  title,
  tracks,
  loading,
  emptyLabel,
}: {
  title: string
  tracks: Track[]
  loading: boolean
  emptyLabel?: string
}) {
  return (
    <section className="w-full">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold">{title}</h2>
        {!loading && tracks.length > 0 && (
          <span className="text-xs text-muted-foreground">{tracks.length} треков</span>
        )}
      </div>

      {loading ? (
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="w-40 shrink-0 animate-pulse rounded-2xl border border-border bg-card/60 p-2.5"
            >
              <div className="aspect-square w-full rounded-xl bg-secondary" />
              <div className="mt-2 h-3 w-3/4 rounded bg-secondary" />
              <div className="mt-1.5 h-2.5 w-1/2 rounded bg-secondary" />
            </div>
          ))}
        </div>
      ) : tracks.length === 0 ? (
        <div className="grid h-40 place-items-center rounded-2xl border border-dashed border-border text-sm text-muted-foreground">
          {emptyLabel ?? 'Ничего не найдено'}
        </div>
      ) : (
        <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2 [scrollbar-width:thin]">
          {tracks.map((track, index) => (
            <TrackCard key={track.id} track={track} tracks={tracks} index={index} />
          ))}
        </div>
      )}
    </section>
  )
}
