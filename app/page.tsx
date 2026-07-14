import { PlayerProvider } from '@/components/player-context'
import { PlayerBar } from '@/components/player-bar'
import { OrbitaApp } from '@/components/orbita-app'
import { TelegramInit } from '@/components/telegram-init'

export default function Page() {
  return (
    <PlayerProvider>
      <TelegramInit />
      <OrbitaApp />
      <PlayerBar />
    </PlayerProvider>
  )
}
