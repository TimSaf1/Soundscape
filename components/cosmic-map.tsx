'use client'

import { useMemo } from 'react'
import { PLANETS, type Planet } from '@/lib/genres'
import { cn } from '@/lib/utils'

// Deterministic star field so it doesn't reshuffle on every render.
function useStars(count: number) {
  return useMemo(() => {
    const stars: { top: number; left: number; size: number; delay: number }[] = []
    let seed = 42
    const rand = () => {
      seed = (seed * 9301 + 49297) % 233280
      return seed / 233280
    }
    for (let i = 0; i < count; i++) {
      stars.push({
        top: rand() * 100,
        left: rand() * 100,
        size: rand() * 2 + 1,
        delay: rand() * 3,
      })
    }
    return stars
  }, [count])
}

function PlanetButton({
  planet,
  active,
  onSelect,
}: {
  planet: Planet
  active: boolean
  onSelect: (p: Planet) => void
}) {
  return (
    <button
      onClick={() => onSelect(planet)}
      className="group absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5 focus:outline-none"
      style={{ left: `${planet.x}%`, top: `${planet.y}%` }}
      aria-label={`Жанр: ${planet.label}`}
    >
      <span className="relative grid place-items-center" style={{ animation: 'float-orbit 6s ease-in-out infinite' }}>
        {/* glow */}
        <span
          className={cn(
            'absolute rounded-full blur-xl transition-opacity duration-300',
            active ? 'opacity-70' : 'opacity-40 group-hover:opacity-70',
          )}
          style={{
            width: planet.size * 1.1,
            height: planet.size * 1.1,
            background: planet.glow,
          }}
          aria-hidden
        />
        {/* ring */}
        {planet.hasRing && (
          <span
            className="absolute rounded-full border"
            style={{
              width: planet.size * 1.55,
              height: planet.size * 0.5,
              transform: 'rotate(-24deg)',
              borderColor: planet.glow,
              opacity: 0.55,
            }}
            aria-hidden
          />
        )}
        {/* body */}
        <span
          className={cn(
            'relative rounded-full ring-2 transition-transform duration-300 group-hover:scale-110 group-active:scale-95',
            active ? 'ring-primary' : 'ring-white/10',
          )}
          style={{
            width: planet.size,
            height: planet.size,
            background: `radial-gradient(circle at 32% 28%, ${planet.from}, ${planet.to} 72%)`,
            boxShadow: `inset -8px -10px 22px rgba(0,0,0,0.45)`,
          }}
        />
      </span>
      <span
        className={cn(
          'font-display text-xs font-medium tracking-wide transition-colors',
          active ? 'text-primary' : 'text-foreground/85 group-hover:text-foreground',
        )}
      >
        {planet.label}
      </span>
    </button>
  )
}

export function CosmicMap({
  activeGenre,
  onSelect,
}: {
  activeGenre: string | null
  onSelect: (p: Planet) => void
}) {
  const stars = useStars(70)

  return (
    <div className="relative h-[62vh] min-h-[380px] w-full overflow-hidden rounded-3xl border border-border">
      {/* deep space backdrop */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(1200px 600px at 50% -10%, oklch(0.32 0.09 285), transparent 60%), radial-gradient(900px 500px at 80% 110%, oklch(0.28 0.08 220), transparent 55%), linear-gradient(180deg, oklch(0.14 0.03 265), oklch(0.1 0.025 265))',
        }}
        aria-hidden
      />
      {/* stars */}
      <div className="absolute inset-0" aria-hidden>
        {stars.map((s, i) => (
          <span
            key={i}
            className="absolute rounded-full bg-white"
            style={{
              top: `${s.top}%`,
              left: `${s.left}%`,
              width: s.size,
              height: s.size,
              animation: `twinkle ${2 + s.delay}s ease-in-out ${s.delay}s infinite`,
            }}
          />
        ))}
      </div>

      {/* header hint */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col items-center gap-1 p-5 text-center">
        <h1 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">
          Галактика жанров
        </h1>
        <p className="text-xs text-muted-foreground sm:text-sm">
          Нажми на планету, чтобы услышать её звучание
        </p>
      </div>

      {/* planets */}
      <div className="absolute inset-0">
        {PLANETS.map((p) => (
          <PlanetButton
            key={p.genre}
            planet={p}
            active={activeGenre === p.genre}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  )
}
