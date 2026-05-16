/** Giphy public API — key from https://developers.giphy.com/dashboard */
const GIPHY_SEARCH = 'https://api.giphy.com/v1/gifs/search'

/** Minimum heuristic score to accept a GIF as an exercise demonstration. */
const MIN_DEMO_SCORE = 4

export function getGiphyApiKey(): string {
  return import.meta.env.VITE_GIPHY_API_KEY?.trim() ?? ''
}

type GiphyGifItem = {
  title?: string
  slug?: string
  rating?: string
  images?: {
    fixed_height?: { url?: string }
    downsized?: { url?: string }
    original?: { url?: string }
  }
}

type GiphySearchResponse = {
  data?: GiphyGifItem[]
}

const BAD_HAY =
  /\b(meme|memes|reactions?|reaction\b|mood\b|lol\b|lmao|rofl|funny\b|fail\b|fails\b|dance|dancing|celebrat|wtf\b|omg\b|tv\b|movie\b|cartoon|nba\b|nfl\b|anime\b|shrug|cringe|tea\b|spill\b|gossip|kiss|kissing)\b/i

const GOOD_HAY =
  /\b(exercise|form|workout|gym|fitness|training|lift(?:ing)?|muscle|demonstration|demo|tutorial|technique|proper|athlete|barbell|dumbbell|kettlebell|strength|squat|deadlift|press|curl|extension)\b/i

function gifImageUrl(gif: GiphyGifItem): string | null {
  const u =
    gif.images?.fixed_height?.url ??
    gif.images?.downsized?.url ??
    gif.images?.original?.url
  return typeof u === 'string' && u.length > 0 ? u : null
}

function demonstrationScore(exerciseNameLower: string, gif: GiphyGifItem): number {
  const title = (gif.title ?? '').toLowerCase()
  const slug = (gif.slug ?? '').toLowerCase()
  const hay = `${title} ${slug}`
  if (BAD_HAY.test(hay)) return -100
  let score = 0
  if (GOOD_HAY.test(hay)) score += 5
  if (exerciseNameLower && hay.includes(exerciseNameLower)) score += 3
  return score
}

/**
 * Returns a GIF URL for the best-scoring search hit, or null if none meet the demo threshold.
 */
export async function searchExerciseFormGif(exerciseName: string): Promise<string | null> {
  const apiKey = getGiphyApiKey()
  if (!apiKey) return null

  const q = `${exerciseName.trim()} proper form exercise demonstration`.trim()
  const url = new URL(GIPHY_SEARCH)
  url.searchParams.set('api_key', apiKey)
  url.searchParams.set('q', q)
  url.searchParams.set('limit', '24')
  url.searchParams.set('rating', 'g')
  url.searchParams.set('content_filter', 'high')
  url.searchParams.set('lang', 'en')

  const res = await fetch(url.toString())
  if (!res.ok) return null

  const json = (await res.json()) as GiphySearchResponse
  const items = json.data ?? []
  const nameLower = exerciseName.trim().toLowerCase()

  let best: { url: string; score: number } | null = null
  for (const gif of items) {
    const score = demonstrationScore(nameLower, gif)
    if (score < MIN_DEMO_SCORE) continue
    const imageUrl = gifImageUrl(gif)
    if (!imageUrl) continue
    if (!best || score > best.score) best = { url: imageUrl, score }
  }

  return best?.url ?? null
}
