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
import { resolveYouTubeId, type Track } from '@/lib/audius'

type PlayerContextValue = {
  queue: Track[]
  current: Track | null
  currentIndex: number
  isPlaying: boolean
  isLoading: boolean
  /** true when the current track has no playable source at all */
  unavailable: boolean
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

/* ------------------------------------------------------- YouTube IFrame API */

type YTPlayer = {
  loadVideoById: (id: string) => void
  playVideo: () => void
  pauseVideo: () => void
  seekTo: (seconds: number, allowSeekAhead: boolean) => void
  setVolume: (v: number) => void
  getCurrentTime: () => number
  getDuration: () => number
  stopVideo: () => void
}

declare global {
  interface Window {
    YT?: {
      Player: new (
        el: string | HTMLElement,
        opts: Record<string, unknown>,
      ) => YTPlayer
      PlayerState: { ENDED: number; PLAYING: number; PAUSED: number; BUFFERING: number }
    }
    onYouTubeIframeAPIReady?: () => void
  }
}

let ytApiPromise: Promise<void> | null = null
function loadYouTubeApi(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  if (window.YT?.Player) return Promise.resolve()
  if (ytApiPromise) return ytApiPromise
  ytApiPromise = new Promise<void>((resolve) => {
    const prev = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      prev?.()
      resolve()
    }
    const tag = document.createElement('script')
    tag.src = 'https://www.youtube.com/iframe_api'
    document.head.appendChild(tag)
  })
  return ytApiPromise
}

/* --------------------------------------------------------------- provider */

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const ytRef = useRef<YTPlayer | null>(null)
  const ytReadyRef = useRef(false)
  // Video id + token queued while the YT player is still initializing.
  const pendingYtRef = useRef<{ videoId: string; token: number } | null>(null)
  // Which engine is currently driving playback.
  const engineRef = useRef<'audio' | 'youtube'>('audio')
  // Token to ignore stale async resolves when the user skips quickly.
  const playTokenRef = useRef(0)

  const [queue, setQueue] = useState<Track[]>([])
  const [currentIndex, setCurrentIndex] = useState(-1)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolumeState] = useState(1)

  const current = currentIndex >= 0 ? (queue[currentIndex] ?? null) : null

  const nextRef = useRef<() => void>(() => {})
  // Always-current volume for callbacks that run outside React state closures.
  const volumeRef = useRef(1)
  // Plays the current track's 30s preview when the full source fails.
  const fallbackToPreviewRef = useRef<() => void>(() => {})

  /* ---- HTML5 audio element (Audius / previews) ---- */
  useEffect(() => {
    const audio = new Audio()
    audio.preload = 'metadata'
    audioRef.current = audio

    const onTime = () => {
      if (engineRef.current === 'audio') setCurrentTime(audio.currentTime)
    }
    const onDuration = () => {
      if (engineRef.current === 'audio') setDuration(audio.duration || 0)
    }
    const onPlay = () => engineRef.current === 'audio' && setIsPlaying(true)
    const onPause = () => engineRef.current === 'audio' && setIsPlaying(false)
    const onWaiting = () => engineRef.current === 'audio' && setIsLoading(true)
    const onPlaying = () => engineRef.current === 'audio' && setIsLoading(false)
    const onCanPlay = () => engineRef.current === 'audio' && setIsLoading(false)
    const onEnded = () => engineRef.current === 'audio' && nextRef.current()

    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('loadedmetadata', onDuration)
    audio.addEventListener('durationchange', onDuration)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('waiting', onWaiting)
    audio.addEventListener('playing', onPlaying)
    audio.addEventListener('canplay', onCanPlay)
    audio.addEventListener('ended', onEnded)

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
      audio.removeEventListener('ended', onEnded)
    }
  }, [])

  /* ---- YouTube IFrame player (full tracks) ---- */
  useEffect(() => {
    let cancelled = false
    loadYouTubeApi().then(() => {
      if (cancelled || !window.YT?.Player || ytRef.current) return
      const target = document.getElementById('orbita-yt-target')
      if (!target) return
      ytRef.current = new window.YT.Player('orbita-yt-target', {
        height: '0',
        width: '0',
        playerVars: { autoplay: 1, controls: 0, disablekb: 1, playsinline: 1 },
        events: {
          onReady: () => {
            ytReadyRef.current = true
            ytRef.current?.setVolume(Math.round(volumeRef.current * 100))
            // Flush a track that was requested before the player finished init.
            const pending = pendingYtRef.current
            if (pending && pending.token === playTokenRef.current) {
              pendingYtRef.current = null
              ytRef.current?.loadVideoById(pending.videoId)
            }
          },
          onStateChange: (e: { data: number }) => {
            if (engineRef.current !== 'youtube') return
            const YT = window.YT!
            if (e.data === YT.PlayerState.ENDED) nextRef.current()
            else if (e.data === YT.PlayerState.PLAYING) {
              setIsPlaying(true)
              setIsLoading(false)
              setDuration(ytRef.current?.getDuration() ?? 0)
            } else if (e.data === YT.PlayerState.PAUSED) setIsPlaying(false)
            else if (e.data === YT.PlayerState.BUFFERING) setIsLoading(true)
          },
          onError: () => {
            // Embedding disabled / removed video → fall back to the preview.
            if (engineRef.current !== 'youtube') return
            fallbackToPreviewRef.current()
          },
        },
      })
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ---- Poll YouTube time (no timeupdate event exists) ---- */
  useEffect(() => {
    const id = window.setInterval(() => {
      if (engineRef.current === 'youtube' && ytReadyRef.current && ytRef.current) {
        setCurrentTime(ytRef.current.getCurrentTime() ?? 0)
        const d = ytRef.current.getDuration() ?? 0
        if (d) setDuration(d)
      }
    }, 500)
    return () => window.clearInterval(id)
  }, [])

  /* ---- Core play logic (routes to the right engine) ---- */
  const playIndex = useCallback((tracks: Track[], index: number) => {
    const track = tracks[index]
    if (!track) return
    const token = ++playTokenRef.current
    const audio = audioRef.current
    setCurrentTime(0)
    setDuration(0)
    setUnavailable(false)
    setIsLoading(true)

    // Reusable fallback to the 30s preview (used on resolve failure / YT error).
    const goPreview = () => {
      if (track.streamUrl && audio) {
        engineRef.current = 'audio'
        try {
          ytRef.current?.stopVideo()
        } catch {}
        audio.src = track.streamUrl
        audio.volume = volumeRef.current
        audio.play().catch(() => setIsLoading(false))
      } else {
        setIsLoading(false)
        setUnavailable(true)
      }
    }
    fallbackToPreviewRef.current = goPreview

    if (track.source === 'youtube') {
      engineRef.current = 'youtube'
      audio?.pause()
      resolveYouTubeId(track).then((videoId) => {
        if (token !== playTokenRef.current) return // superseded
        if (!videoId) {
          goPreview()
          return
        }
        if (!ytRef.current || !ytReadyRef.current) {
          // Player still initializing — queue it; onReady will flush.
          pendingYtRef.current = { videoId, token }
          return
        }
        ytRef.current.loadVideoById(videoId)
        ytRef.current.setVolume(Math.round(volumeRef.current * 100))
      })
      return
    }

    // Audius / preview → HTML5 audio.
    engineRef.current = 'audio'
    try {
      ytRef.current?.stopVideo()
    } catch {}
    if (!audio) return
    audio.src = track.streamUrl
    audio.volume = volumeRef.current
    audio.play().catch((e) => {
      console.log('[v0] audio play() rejected:', (e as Error).message)
      setIsLoading(false)
    })
  }, [])

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
    if (currentTime > 3) {
      seekInternal(0)
      return
    }
    if (queue.length === 0) return
    const prevIndex = (currentIndex - 1 + queue.length) % queue.length
    setCurrentIndex(prevIndex)
    playIndex(queue, prevIndex)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue, currentIndex, playIndex, currentTime])

  // Keep nextRef current for the media event handlers.
  useEffect(() => {
    nextRef.current = next
  }, [next])

  const toggle = useCallback(() => {
    if (!current) return
    if (engineRef.current === 'youtube') {
      if (!ytRef.current) return
      if (isPlaying) ytRef.current.pauseVideo()
      else ytRef.current.playVideo()
      return
    }
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) audio.play().catch(() => {})
    else audio.pause()
  }, [current, isPlaying])

  const seekInternal = useCallback((time: number) => {
    if (engineRef.current === 'youtube') {
      ytRef.current?.seekTo(time, true)
    } else if (audioRef.current) {
      audioRef.current.currentTime = time
    }
    setCurrentTime(time)
  }, [])

  const seek = seekInternal

  const setVolume = useCallback((v: number) => {
    volumeRef.current = v
    if (audioRef.current) audioRef.current.volume = v
    ytRef.current?.setVolume(Math.round(v * 100))
    setVolumeState(v)
  }, [])

  const value = useMemo<PlayerContextValue>(
    () => ({
      queue,
      current,
      currentIndex,
      isPlaying,
      isLoading,
      unavailable,
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
      unavailable,
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

  return (
    <PlayerContext.Provider value={value}>
      {/* Hidden YouTube player target (audio-only usage). */}
      <div className="pointer-events-none fixed -left-[9999px] top-0 h-0 w-0 overflow-hidden" aria-hidden>
        <div id="orbita-yt-target" />
      </div>
      {children}
    </PlayerContext.Provider>
  )
}

export function usePlayer() {
  const ctx = useContext(PlayerContext)
  if (!ctx) throw new Error('usePlayer must be used within PlayerProvider')
  return ctx
}
