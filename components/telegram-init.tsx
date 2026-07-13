'use client'

import { useEffect } from 'react'

type TelegramWebApp = {
  ready: () => void
  expand: () => void
  setHeaderColor?: (color: string) => void
  setBackgroundColor?: (color: string) => void
  disableVerticalSwipes?: () => void
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp }
  }
}

export function TelegramInit() {
  useEffect(() => {
    const tg = window.Telegram?.WebApp
    if (!tg) return
    try {
      tg.ready()
      tg.expand()
      tg.setHeaderColor?.('#0b1020')
      tg.setBackgroundColor?.('#0b1020')
      tg.disableVerticalSwipes?.()
    } catch {
      // Not running inside Telegram — safe to ignore.
    }
  }, [])

  return null
}
