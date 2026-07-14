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
import { resolveYouTubeId, getCachedYouTubeId, type Track } from '@/lib/audius'

type PlayerContextValue = {
  queue: Track[]
  current: Track | null
  currentIndex: number
  isPlaying: boolean
  isLoading: boolean
  /** Which engine is currently active (youtube shows a video iframe). */
  activeEngine: 'audio' | 'youtube'
  /** true when the YouTube video stage should be shown large (expanded view). */
  videoExpanded: boolean
  setVideoExpanded: (v: boolean) => void
  /** true when the video/cover fills the whole viewport (in-app fullscreen). */
  videoFullscreen: boolean
  setVideoFullscreen: (v: boolean) => void
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
  /** Jump forward/backward by `delta` seconds (works for both engines). */
  skipBy: (delta: number) => void
  setVolume: (v: number) => void
  /** Stop playback and clear the current track (hides the player bar). */
  closePlayer: () => void
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
  // Watchdog timer: fires if an Audius stream stalls (0:00 forever).
  const watchdogRef = useRef<number | null>(null)
  // Called on <audio> error/stall to fall back to YouTube for the same track.
  const audioErrorRef = useRef<() => void>(() => {})

  const [queue, setQueue] = useState<Track[]>([])
  const [currentIndex, setCurrentIndex] = useState(-1)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolumeState] = useState(1)
  // Drives whether the YouTube iframe is shown in the UI.
  const [activeEngine, setActiveEngine] = useState<'audio' | 'youtube'>('audio')
  // Drives whether the video stage is shown large (in the expanded player).
  const [videoExpanded, setVideoExpanded] = useState(false)
  // Drives the in-app fullscreen overlay (covers the whole viewport).
  const [videoFullscreen, setVideoFullscreen] = useState(false)

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
    // Network/decode error on the Audius stream → let YouTube take over.
    const onError = () => {
      if (engineRef.current === 'audio') audioErrorRef.current()
    }

    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('loadedmetadata', onDuration)
    audio.addEventListener('durationchange', onDuration)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('waiting', onWaiting)
    audio.addEventListener('playing', onPlaying)
    audio.addEventListener('canplay', onCanPlay)
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('error', onError)

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
      audio.removeEventListener('error', onError)
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
        height: '100%',
        width: '100%',
        playerVars: {
          autoplay: 1,
          controls: 1,
          disablekb: 1,
          playsinline: 1,
          rel: 0,
          fs: 1, // allow the native fullscreen button
          modestbranding: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: () => {
            ytReadyRef.current = true
            ytRef.current?.setVolume(Math.round(volumeRef.current * 100))
            // Flush a track that was requested before the player finished init.
            const pending = pendingYtRef.current
            if (pending && pending.token === playTokenRef.current) {
              pendingYtRef.current = null
              ytRef.current?.loadVideoById(pending.videoId)
              ytRef.current?.playVideo()
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

    // Clear any pending stall watchdog from a previous track.
    if (watchdogRef.current !== null) {
      window.clearTimeout(watchdogRef.current)
      watchdogRef.current = null
    }

    // Play `track` in full via the YouTube IFrame player. `onFail` runs when
    // there is no embeddable match (e.g. resolve returns null).
    const playViaYouTube = (onFail: () => void) => {
      engineRef.current = 'youtube'
      setActiveEngine('youtube')
      audio?.pause()

      const startVideo = (videoId: string) => {
        if (token !== playTokenRef.current) return
        if (!ytRef.current || !ytReadyRef.current) {
          pendingYtRef.current = { videoId, token }
          return
        }
        ytRef.current.setVolume(Math.round(volumeRef.current * 100))
        ytRef.current.loadVideoById(videoId)
        ytRef.current.playVideo()
      }

      // Fast path: id already warmed by prefetch → start inside the click so
      // the browser keeps the user gesture (required for autoplay on mobile).
      const cached = getCachedYouTubeId(track)
      if (cached) return startVideo(cached)
      if (cached === null) return onFail()

      resolveYouTubeId(track).then((videoId) => {
        if (token !== playTokenRef.current) return
        if (!videoId) return onFail()
        startVideo(videoId)
      })
    }

    // When all sources fail, either play the 30s preview or mark unavailable.
    const giveUp = () => {
      setIsLoading(false)
      setUnavailable(true)
    }
    fallbackToPreviewRef.current = () => playViaYouTube(giveUp)

    // Search results (YouTube-native) → straight to the IFrame player.
    if (track.source === 'youtube') {
      playViaYouTube(giveUp)
      return
    }

    // Audius planet track → HTML5 audio, with a YouTube safety net. If the
    // stream stalls (0:00 for 5s) or errors, we transparently switch to the
    // full track on YouTube so playback never silently hangs.
    engineRef.current = 'audio'
    setActiveEngine('audio')
    try {
      ytRef.current?.stopVideo()
    } catch {}
    if (!audio) return

    const fallbackToYouTube = () => {
      if (token !== playTokenRef.current) return
      if (watchdogRef.current !== null) {
        window.clearTimeout(watchdogRef.current)
        watchdogRef.current = null
      }
      setIsLoading(true)
      playViaYouTube(giveUp)
    }
    audioErrorRef.current = fallbackToYouTube

    audio.src = track.streamUrl
    audio.volume = volumeRef.current
    audio.play().catch((e) => {
      console.log('[v0] audio play() rejected:', (e as Error).message)
      fallbackToYouTube()
    })

    // Stall watchdog: if the stream produced no audio after 5s, use YouTube.
    watchdogRef.current = window.setTimeout(() => {
      if (token !== playTokenRef.current || engineRef.current !== 'audio') return
      const stalled =
        audio.currentTime === 0 && (!audio.duration || Number.isNaN(audio.duration))
      if (stalled) {
        console.log('[v0] Audius stream stalled → YouTube fallback')
        fallbackToYouTube()
      }
    }, 5000)
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

  // Skip forward/back. Reads the live position from whichever engine is active
  // so ±15s is accurate for both Audius audio and the YouTube player.
  const skipBy = useCallback(
    (delta: number) => {
      let base = 0
      if (engineRef.current === 'youtube' && ytRef.current) {
        base = ytRef.current.getCurrentTime() ?? 0
      } else if (audioRef.current) {
        base = audioRef.current.currentTime
      }
      seekInternal(Math.max(0, base + delta))
    },
    [seekInternal],
  )

  // Fully stop and clear the current track so the player bar disappears.
  const closePlayer = useCallback(() => {
    playTokenRef.current++ // invalidate any in-flight resolves
    try {
      ytRef.current?.stopVideo()
    } catch {}
    const audio = audioRef.current
    if (audio) {
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
    }
    if (watchdogRef.current !== null) {
      window.clearTimeout(watchdogRef.current)
      watchdogRef.current = null
    }
    engineRef.current = 'audio'
    setIsPlaying(false)
    setIsLoading(false)
    setVideoFullscreen(false)
    setVideoExpanded(false)
    setActiveEngine('audio')
    setQueue([])
    setCurrentIndex(-1)
  }, [])

  const value = useMemo<PlayerContextValue>(
    () => ({
      queue,
      current,
      currentIndex,
      isPlaying,
      isLoading,
      activeEngine,
      videoExpanded,
      setVideoExpanded,
      videoFullscreen,
      setVideoFullscreen,
      unavailable,
      currentTime,
      duration,
      volume,
      playQueue,
      toggle,
      next,
      prev,
      seek,
      skipBy,
      setVolume,
      closePlayer,
    }),
    [
      queue,
      current,
      currentIndex,
      isPlaying,
      isLoading,
      activeEngine,
      videoExpanded,
      setVideoExpanded,
      videoFullscreen,
      setVideoFullscreen,
      unavailable,
      currentTime,
      duration,
      volume,
      playQueue,
      toggle,
      next,
      prev,
      seek,
      skipBy,
      setVolume,
      closePlayer,
    ],
  )

  // The YouTube IFrame player must stay mounted and on-screen (a 0x0 or
  // off-screen player is blocked from playing). Four visual states:
  //   - audio engine → 1x1, effectively invisible
  //   - mini         → docked window above the player bar
  //   - expanded     → big centered stage (expanded player)
  //   - fullscreen   → covers the whole viewport, in-app (no YouTube redirect)
  const stageMode: 'hidden' | 'mini' | 'expanded' | 'full' =
    activeEngine !== 'youtube'
      ? 'hidden'
      : videoFullscreen
        ? 'full'
        : videoExpanded
          ? 'expanded'
          : 'mini'

  const ytStageStyle: React.CSSProperties =
    stageMode === 'full'
      ? {
          position: 'fixed',
          inset: 0,
          width: '100vw',
          height: '100dvh',
          opacity: 1,
          zIndex: 70,
          background: '#000',
          borderRadius: 0,
          pointerEvents: 'auto',
        }
      : {
          position: 'fixed',
          left: stageMode === 'hidden' ? 1 : stageMode === 'expanded' ? '50%' : 8,
          bottom: stageMode === 'hidden' ? 1 : stageMode === 'expanded' ? 'auto' : 88,
          top: stageMode === 'expanded' ? '84px' : 'auto',
          transform: stageMode === 'expanded' ? 'translateX(-50%)' : 'none',
          width:
            stageMode === 'hidden' ? 1 : stageMode === 'expanded' ? 'min(92vw, 760px)' : 200,
          height:
            stageMode === 'hidden' ? 1 : stageMode === 'expanded' ? 'min(42vh, 428px)' : 112,
          opacity: stageMode === 'hidden' ? 0.01 : 1,
          zIndex: stageMode === 'hidden' ? -1 : stageMode === 'expanded' ? 60 : 45,
          overflow: 'hidden',
          borderRadius: 14,
          boxShadow: stageMode === 'hidden' ? 'none' : '0 10px 40px -8px rgba(0,0,0,0.6)',
          pointerEvents: stageMode === 'hidden' ? 'none' : 'auto',
          transition: 'width 0.25s, height 0.25s, opacity 0.2s',
        }

  return (
    <PlayerContext.Provider value={value}>
      <div id="orbita-yt-stage" style={ytStageStyle}>
        <div id="orbita-yt-target" className="h-full w-full" />
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
