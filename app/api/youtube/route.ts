import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

type YtResult = { videoId: string; title: string; durationSeconds: number }

/** Resolve a search query to the best matching YouTube video by scraping the
 *  public results page. We only extract a video id so we can embed YouTube's
 *  official IFrame player — nothing is downloaded or re-hosted. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const q = (searchParams.get('q') ?? '').trim()
  if (!q) return NextResponse.json({ error: 'Missing q' }, { status: 400 })

  try {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(
      q,
    )}&sp=EgIQAQ%253D%253D` // filter: type = video
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        'Accept-Language': 'en-US,en;q=0.9',
      },
      cache: 'no-store',
    })
    if (!res.ok) {
      return NextResponse.json({ error: `YouTube ${res.status}` }, { status: 502 })
    }
    const html = await res.text()
    const results = extractResults(html)
    if (results.length === 0) {
      return NextResponse.json({ videoId: null, results: [] })
    }
    const best = results[0]
    return NextResponse.json({
      videoId: best.videoId,
      durationSeconds: best.durationSeconds,
      title: best.title,
      results: results.slice(0, 5),
    })
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    )
  }
}

function extractResults(html: string): YtResult[] {
  // Pull the ytInitialData JSON blob and walk videoRenderer entries.
  const start = html.indexOf('ytInitialData')
  if (start === -1) return fallbackScan(html)
  const braceStart = html.indexOf('{', start)
  if (braceStart === -1) return fallbackScan(html)

  const json = sliceBalanced(html, braceStart)
  if (!json) return fallbackScan(html)

  let data: unknown
  try {
    data = JSON.parse(json)
  } catch {
    return fallbackScan(html)
  }

  const out: YtResult[] = []
  const seen = new Set<string>()
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return
    const obj = node as Record<string, unknown>
    const vr = obj.videoRenderer as Record<string, unknown> | undefined
    if (vr && typeof vr.videoId === 'string') {
      const id = vr.videoId
      if (!seen.has(id)) {
        seen.add(id)
        out.push({
          videoId: id,
          title: extractText(vr.title),
          durationSeconds: parseDuration(vr.lengthText),
        })
      }
    }
    for (const key of Object.keys(obj)) walk(obj[key])
  }
  walk(data)
  return out
}

/** Extract a balanced {...} substring starting at index i. */
function sliceBalanced(s: string, i: number): string | null {
  let depth = 0
  let inStr = false
  let esc = false
  for (let j = i; j < s.length; j++) {
    const c = s[j]
    if (inStr) {
      if (esc) esc = false
      else if (c === '\\') esc = true
      else if (c === '"') inStr = false
      continue
    }
    if (c === '"') inStr = true
    else if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) return s.slice(i, j + 1)
    }
  }
  return null
}

function extractText(title: unknown): string {
  const t = title as Record<string, unknown> | undefined
  if (!t) return ''
  const runs = t.runs as Array<{ text?: string }> | undefined
  if (Array.isArray(runs) && runs[0]?.text) return runs[0].text
  const simple = t.simpleText as string | undefined
  return simple ?? ''
}

function parseDuration(lengthText: unknown): number {
  const lt = lengthText as Record<string, unknown> | undefined
  const raw = (lt?.simpleText as string | undefined) ?? ''
  const parts = raw.split(':').map((n) => parseInt(n, 10))
  if (parts.some(Number.isNaN) || parts.length === 0) return 0
  return parts.reduce((acc, n) => acc * 60 + n, 0)
}

/** Last-resort regex scan if the JSON structure changes. */
function fallbackScan(html: string): YtResult[] {
  const ids = [...html.matchAll(/"videoId":"([\w-]{11})"/g)].map((m) => m[1])
  const seen = new Set<string>()
  const out: YtResult[] = []
  for (const id of ids) {
    if (!seen.has(id)) {
      seen.add(id)
      out.push({ videoId: id, title: '', durationSeconds: 0 })
    }
  }
  return out
}
