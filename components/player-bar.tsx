'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Volume2,
  VolumeX,
  ChevronDown,
  ChevronUp,
  Loader,
  Music,
  Maximize2,
  Video,
} from 'lucide-react'
import { usePlayer } from '@/components/player-context'
import { formatTime } from '@/lib/audius'
import { cn } from '@/lib/utils'

function SeekBar({ className }: { className?: string }) {
  const { currentTime, duration, seek } = usePlayer()
  const max = duration || 0
  const pct = max > 0 ? (currentTime / max) * 100 : 0
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
        {formatTime(currentTime)}
      </span>
      <input
        type="range"
        className="cosmic-slider h-4 w-full"
        min={0}
        max={max || 100}
        step={0.1}
        value={Math.min(currentTime, max || 0)}
        onChange={(e) => seek(Number(e.target.value))}
        style={
          {
            background: `linear-gradient(to right, var(--color-primary) ${pct}%, transparent ${pct}%)`,
            borderRadius: 999,
          } as React.CSSProperties
        }
        aria-label="Перемотка трека"
      />
      <span className="w-10 shrink-0 text-xs tabular-nums text-muted-foreground">
        {formatTime(max)}
      </span>
    </div>
  )
}

function Cover({
  src,
  alt,
  size,
  spinning,
}: {
  src: string | null
  alt: string
  size: number
  spinning?: boolean
}) {
  if (!src) {
    return (
      <div
        className="flex items-center justify-center rounded-xl bg-secondary"
        style={{ width: size, height: size }}
      >
        <Music className="text-muted-foreground" size={size * 0.4} />
      </div>
    )
  }
  return (
    <div
      className={cn('overflow-hidden rounded-xl', spinning && 'rounded-full animate-spin-slow')}
      style={{ width: size, height: size }}
    >
      <Image
        src={src || '/placeholder.svg'}
        alt={alt}
        width={size}
        height={size}
        className="h-full w-full object-cover"
        unoptimized
      />
    </div>
  )
}

function Controls({ big }: { big?: boolean }) {
  const { isPlaying, isLoading, toggle, next, prev } = usePlayer()
  const iconSize = big ? 26 : 20
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={prev}
        className="grid h-9 w-9 place-items-center rounded-full text-foreground/80 transition hover:bg-secondary hover:text-foreground"
        aria-label="Предыдущий трек"
      >
        <SkipBack size={iconSize} />
      </button>
      <button
        onClick={toggle}
        className={cn(
          'grid place-items-center rounded-full bg-primary text-primary-foreground shadow-[0_0_24px_-4px_var(--color-primary)] transition active:scale-95',
          big ? 'h-16 w-16' : 'h-12 w-12',
        )}
        aria-label={isPlaying ? 'Пауза' : 'Играть'}
      >
        {isLoading ? (
          <Loader className="animate-spin" size={big ? 28 : 22} />
        ) : isPlaying ? (
          <Pause size={big ? 30 : 24} />
        ) : (
          <Play className="translate-x-0.5" size={big ? 30 : 24} />
        )}
      </button>
      <button
        onClick={next}
        className="grid h-9 w-9 place-items-center rounded-full text-foreground/80 transition hover:bg-secondary hover:text-foreground"
        aria-label="Следующий трек"
      >
        <SkipForward size={iconSize} />
      </button>
    </div>
  )
}

function VolumeControl() {
  const { volume, setVolume } = usePlayer()
  const muted = volume === 0
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => setVolume(muted ? 1 : 0)}
        className="text-muted-foreground transition hover:text-foreground"
        aria-label={muted ? 'Включить звук' : 'Выключить звук'}
      >
        {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
      </button>
      <input
        type="range"
        className="cosmic-slider h-4 w-24"
        min={0}
        max={1}
        step={0.01}
        value={volume}
        onChange={(e) => setVolume(Number(e.target.value))}
        style={
          {
            background: `linear-gradient(to right, var(--color-primary) ${volume * 100}%, transparent ${volume * 100}%)`,
            borderRadius: 999,
          } as React.CSSProperties
        }
        aria-label="Громкость"
      />
    </div>
  )
}

export function PlayerBar() {
  const {
    current,
    isPlaying,
    activeEngine,
    setVideoExpanded,
    enterVideoFullscreen,
  } = usePlayer()
  const [expanded, setExpanded] = useState(false)
  const isVideo = activeEngine === 'youtube'

  // Show the large video stage only while the player is expanded on a video
  // track; collapse it back to the mini window otherwise.
  useEffect(() => {
    setVideoExpanded(expanded && isVideo)
  }, [expanded, isVideo, setVideoExpanded])

  if (!current) return null

  return (
    <>
      {/* Full-screen expanded player */}
      {expanded && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-xl">
          <div className="flex items-center justify-between p-4">
            <button
              onClick={() => setExpanded(false)}
              className="grid h-10 w-10 place-items-center rounded-full text-foreground/80 transition hover:bg-secondary"
              aria-label="Свернуть плеер"
            >
              <ChevronDown size={24} />
            </button>
            <span className="font-display text-sm uppercase tracking-widest text-muted-foreground">
              Сейчас играет
            </span>
            <div className="w-10" />
          </div>

          <div
            className={cn(
              'flex flex-1 flex-col items-center gap-6 px-6',
              isVideo ? 'justify-end pb-10' : 'justify-center gap-8',
            )}
          >
            {isVideo ? (
              <>
                {/* Space reserved for the fixed video stage rendered above. */}
                <div
                  style={{ height: 'min(42vh, 428px)' }}
                  className="w-full"
                  aria-hidden
                />
                <button
                  onClick={enterVideoFullscreen}
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-card/70 px-4 py-2 text-sm font-medium text-foreground transition hover:bg-secondary"
                >
                  <Maximize2 size={16} />
                  На весь экран
                </button>
              </>
            ) : (
              <div className="relative">
                <div
                  className="absolute -inset-6 rounded-full opacity-40 blur-3xl"
                  style={{ background: 'var(--color-primary)' }}
                  aria-hidden
                />
                <div className="relative">
                  <Cover
                    src={current.artworkLarge}
                    alt={`Обложка: ${current.title}`}
                    size={280}
                    spinning={isPlaying}
                  />
                </div>
              </div>
            )}

            <div className="w-full max-w-md text-center">
              <h2 className="text-balance font-display text-2xl font-semibold leading-tight">
                {current.title}
              </h2>
              <p className="mt-1 text-muted-foreground">{current.artist}</p>
            </div>

            <div className="w-full max-w-md">
              <SeekBar />
            </div>

            <Controls big />

            <div className="w-full max-w-md">
              <VolumeControl />
            </div>
          </div>
        </div>
      )}

      {/* Compact docked bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-3 py-2.5">
          <button
            className="flex min-w-0 flex-1 items-center gap-3 text-left"
            onClick={() => setExpanded(true)}
            aria-label="Открыть плеер"
          >
            <div className="relative shrink-0">
              <Cover src={current.artwork} alt="" size={48} spinning={isPlaying && !isVideo} />
              {isVideo && (
                <span
                  className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full bg-primary text-primary-foreground"
                  aria-hidden
                >
                  <Video size={12} />
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{current.title}</p>
              <p className="truncate text-xs text-muted-foreground">
                {isVideo ? 'Видео · нажми, чтобы развернуть' : current.artist}
              </p>
            </div>
          </button>

          <div className="hidden flex-1 sm:block">
            <SeekBar />
          </div>

          <Controls />

          <button
            onClick={() => setExpanded(true)}
            className="hidden h-9 w-9 place-items-center rounded-full text-muted-foreground transition hover:bg-secondary hover:text-foreground sm:grid"
            aria-label="Развернуть плеер"
          >
            <ChevronUp size={20} />
          </button>
        </div>
      </div>
    </>
  )
}
