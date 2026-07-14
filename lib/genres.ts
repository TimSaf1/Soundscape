export type Planet = {
  /** exact Audius genre string used for the trending query, OR a unique id when
   *  `chart` is set (a curated YouTube chart instead of an Audius genre). */
  genre: string
  /** when set, this planet loads a curated YouTube chart, not an Audius genre */
  chart?: string
  /** short display name */
  label: string
  /** two-stop surface gradient for the planet body */
  from: string
  to: string
  /** glow / ring color */
  glow: string
  size: number // relative diameter in px (base)
  /** position on the sky, in % of the map area */
  x: number
  y: number
  hasRing?: boolean
}

// A curated solar system of genres. Colors are illustrative planet surfaces,
// not UI chrome, so each planet gets its own identity.
export const PLANETS: Planet[] = [
  {
    genre: 'ru-hits',
    chart: 'ru-2026',
    label: 'Хиты РФ',
    from: '#ff5f6d',
    to: '#a01029',
    glow: '#ff5f6d',
    size: 116,
    x: 50,
    y: 52,
    hasRing: true,
  },
  {
    genre: 'Hip-Hop/Rap',
    label: 'Рэп',
    from: '#ff7a3c',
    to: '#c02f1d',
    glow: '#ff8a4c',
    size: 96,
    x: 18,
    y: 62,
    hasRing: true,
  },
  {
    genre: 'Rock',
    label: 'Рок',
    from: '#8a94ff',
    to: '#3a2f8f',
    glow: '#8a94ff',
    size: 96,
    x: 74,
    y: 30,
  },
  {
    genre: 'Electronic',
    label: 'Электроника',
    from: '#37e6c9',
    to: '#0e7d8f',
    glow: '#37e6c9',
    size: 120,
    x: 48,
    y: 22,
    hasRing: true,
  },
  {
    genre: 'Pop',
    label: 'Поп',
    from: '#ff8fd0',
    to: '#b13d8f',
    glow: '#ff8fd0',
    size: 84,
    x: 82,
    y: 66,
  },
  {
    genre: 'R&B/Soul',
    label: 'R&B',
    from: '#ffd166',
    to: '#c98a1e',
    glow: '#ffd166',
    size: 76,
    x: 35,
    y: 82,
  },
  {
    genre: 'Metal',
    label: 'Метал',
    from: '#9aa7b4',
    to: '#3b4654',
    glow: '#c3ced9',
    size: 70,
    x: 62,
    y: 78,
  },
  {
    genre: 'Jazz',
    label: 'Джаз',
    from: '#7ee081',
    to: '#2f8f4e',
    glow: '#7ee081',
    size: 66,
    x: 12,
    y: 26,
  },
]
