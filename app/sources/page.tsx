import fs from 'fs'
import path from 'path'
import { SoundsList, type SoundItem } from '@/components/sounds-list'

function formatSize(bytes: number): string {
  const kb = bytes / 1024
  if (kb > 1024) return `${(kb / 1024).toFixed(1)} MB`
  return `${Math.round(kb)} KB`
}

function getSounds(): SoundItem[] {
  const dir = path.join(process.cwd(), 'public', 'sounds')
  if (!fs.existsSync(dir)) return []

  return fs
    .readdirSync(dir)
    .filter((name) => /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(name))
    .map((name) => ({
      name: name.replace(/\.[^/.]+$/, '').replace(/[-_]+/g, ' '),
      filename: name,
      url: `/sounds/${encodeURIComponent(name)}`,
      size: formatSize(fs.statSync(path.join(dir, name)).size),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export default function SourcesPage() {
  const sounds = getSounds()

  return (
    <main className="min-h-screen bg-background p-8 text-foreground">
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-2 text-4xl font-bold">Sources</h1>
        <p className="mb-8 text-muted-foreground">
          Все звуки из папки public/sounds — найдено: {sounds.length}
        </p>
        <SoundsList sounds={sounds} />
      </div>
    </main>
  )
}
