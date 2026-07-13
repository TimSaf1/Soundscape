'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { Track } from '@/lib/audius'

type PlayerContextValue = {
  queue: Track[]
  current: Track | null
  currentIndex: number
  isPlaying: boolean
  isLoading: boolean
  currentTime: number
  duration: number
  volume: number
  playQueue: (tracks: Track[], index: number) => void
  toggle: () => void
  next: () => void
  prev: () => void
  seek: (time: number) => void
  setVolume: (v: number) => void
}

const PlayerContext = createContext<PlayerContextValue | null>(null)

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [queue, setQueue] = useState<Track[]>([])
  const [currentIndex, setCurrentIndex] = useState(-1)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolumeState] = useState(1)

  const current = currentIndex >= 0 ? (queue[currentIndex] ?? null) : null

  // Create the single shared audio element once.
  useEffect(() => {
    const audio = new Audio()
    audio.preload = 'metadata'
    audioRef.current = audio

    const onTime = () => setCurrentTime(audio.currentTime)
    const onDuration = () => setDuration(audio.duration || 0)
    const onPlay = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)
    const onWaiting = () => setIsLoading(true)
    const onPlaying = () => setIsLoading(false)
    const onCanPlay = () => setIsLoading(false)

    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('loadedmetadata', onDuration)
    audio.addEventListener('durationchange', onDuration)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('waiting', onWaiting)
    audio.addEventListener('playing', onPlaying)
    audio.addEventListener('canplay', onCanPlay)

    return () => {
      audio.pause()
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('loadedmetadata', onDuration)
      audio.removeEventListener('durationchange', onDuration)
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('waiting', onWaiting)
      audio.removeEventListener('playing', onPlaying)
      audio.removeEventListener('canplay', onCanPlay)
    }
  }, [])

  const playIndex = useCallback(
    (tracks: Track[], index: number) => {
      const audio = audioRef.current
      if (!audio || !tracks[index]) return
      const track = tracks[index]
      audio.src = track.streamUrl
      setCurrentTime(0)
      setDuration(0)
      setIsLoading(true)
      audio.play().catch((e) => {
        console.log('[v0] play() rejected:', (e as Error).message)
        setIsLoading(false)
      })
    },
    [],
  )

  const playQueue = useCallback(
    (tracks: Track[], index: number) => {
      setQueue(tracks)
      setCurrentIndex(index)
      playIndex(tracks, index)
    },
    [playIndex],
  )

  const next = useCallback(() => {
    if (queue.length === 0) return
    const nextIndex = (currentIndex + 1) % queue.length
    setCurrentIndex(nextIndex)
    playIndex(queue, nextIndex)
  }, [queue, currentIndex, playIndex])

  const prev = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    // Restart current track if more than 3s in, else go to previous.
    if (audio.currentTime > 3) {
      audio.currentTime = 0
      return
    }
    if (queue.length === 0) return
    const prevIndex = (currentIndex - 1 + queue.length) % queue.length
    setCurrentIndex(prevIndex)
    playIndex(queue, prevIndex)
  }, [queue, currentIndex, playIndex])

  // Auto-advance when a track ends.
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const onEnded = () => next()
    audio.addEventListener('ended', onEnded)
    return () => audio.removeEventListener('ended', onEnded)
  }, [next])

  const toggle = useCallback(() => {
    const audio = audioRef.current
    if (!audio || !current) return
    if (audio.paused) {
      audio.play().catch(() => {})
    } else {
      audio.pause()
    }
  }, [current])

  const seek = useCallback((time: number) => {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = time
    setCurrentTime(time)
  }, [])

  const setVolume = useCallback((v: number) => {
    const audio = audioRef.current
    if (audio) audio.volume = v
    setVolumeState(v)
  }, [])

  const value = useMemo<PlayerContextValue>(
    () => ({
      queue,
      current,
      currentIndex,
      isPlaying,
      isLoading,
      currentTime,
      duration,
      volume,
      playQueue,
      toggle,
      next,
      prev,
      seek,
      setVolume,
    }),
    [
      queue,
      current,
      currentIndex,
      isPlaying,
      isLoading,
      currentTime,
      duration,
      volume,
      playQueue,
      toggle,
      next,
      prev,
      seek,
      setVolume,
    ],
  )

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>
}

export function usePlayer() {
  const ctx = useContext(PlayerContext)
  if (!ctx) throw new Error('usePlayer must be used within PlayerProvider')
  return ctx
}
