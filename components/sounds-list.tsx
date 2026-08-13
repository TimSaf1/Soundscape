'use client'

import { useEffect, useRef, useState } from 'react'
import { Music, Pause, Play } from 'lucide-react'

export type SoundItem = {
  name: string
  filename: string
  url: string
  size: string
}

export function SoundsList({ sounds }: { sounds: SoundItem[] }) {
  const [current, setCurrent] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    const audio = new Audio()
    audioRef.current = audio

    const onTime = () => setProgress(audio.currentTime)
    const onMeta = () => setDuration(audio.duration || 0)
    const onEnd = () => {
      setIsPlaying(false)
      setProgress(0)
    }

    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('loadedmetadata', onMeta)
    audio.addEventListener('ended', onEnd)

    return () => {
      audio.pause()
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('loadedmetadata', onMeta)
      audio.removeEventListener('ended', onEnd)
    }
  }, [])

  const toggle = (sound: SoundItem) => {
    const audio = audioRef.current
    if (!audio) return

    if (current === sound.filename) {
      if (isPlaying) {
        audio.pause()
        setIsPlaying(false)
      } else {
        audio.play()
        setIsPlaying(true)
      }
      return
    }

    audio.src = sound.url
    audio.play()
    setCurrent(sound.filename)
    setIsPlaying(true)
    setProgress(0)
  }

  const formatTime = (s: number) => {
    if (!Number.isFinite(s)) return '0:00'
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  if (sounds.length === 0) {
    return (
      <p className="text-muted-foreground">
        Звуки пока не добавлены. Положите файлы в public/sounds/
      </p>
    )
  }

  return (
    <div className="grid gap-3">
      {sounds.map((sound) => {
        const isCurrent = current === sound.filename
        const percent = isCurrent && duration > 0 ? (progress / duration) * 100 : 0

        return (
          <button
            key={sound.filename}
            onClick={() => toggle(sound)}
            className={`group flex items-center gap-4 rounded-xl border p-4 text-left transition-all ${
              isCurrent
                ? 'border-primary/60 bg-primary/10'
                : 'border-border bg-card hover:border-primary/40'
            }`}
          >
            {/* Кнопка play/pause */}
            <div
              className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full transition-all ${
                isCurrent
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground'
              }`}
            >
              {isCurrent && isPlaying ? (
                <Pause className="h-5 w-5" />
              ) : (
                <Play className="h-5 w-5 pl-0.5" />
              )}
            </div>

            {/* Название + прогресс */}
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-baseline justify-between gap-3">
                <span className="truncate font-semibold capitalize">
                  {sound.name}
                </span>
                <span className="flex-shrink-0 text-xs text-muted-foreground">
                  {isCurrent ? `${formatTime(progress)} / ${formatTime(duration)}` : sound.size}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-200"
                  style={{ width: `${percent}%` }}
                />
              </div>
            </div>

            <Music
              className={`h-4 w-4 flex-shrink-0 ${
                isCurrent ? 'text-primary' : 'text-muted-foreground'
              }`}
            />
          </button>
        )
      })}
    </div>
  )
}
