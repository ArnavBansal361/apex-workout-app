import { useEffect, useState } from 'react'
import { searchExerciseFormGif, getGiphyApiKey } from '../lib/giphy'

type Props = {
  exerciseId: string
  exerciseName: string
  /** When set (http/https), this URL is shown instead of Giphy search. */
  pinnedGifUrl?: string
  className?: string
}

function normalizePinnedUrl(raw: string | undefined): string | null {
  const t = raw?.trim()
  if (!t) return null
  try {
    const u = new URL(t)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return t
  } catch {
    return null
  }
}

export function ExerciseFormGif({ exerciseId, exerciseName, pinnedGifUrl, className }: Props) {
  const pin = normalizePinnedUrl(pinnedGifUrl)
  const [gifUrl, setGifUrl] = useState<string | null>(() => (pin ? pin : null))
  const [fetching, setFetching] = useState(() => {
    if (pin) return false
    return Boolean(getGiphyApiKey())
  })
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    const pinned = normalizePinnedUrl(pinnedGifUrl)

    queueMicrotask(() => {
      if (cancelled) return
      setLoaded(false)
      setGifUrl(null)

      if (pinned) {
        setGifUrl(pinned)
        setFetching(false)
        return
      }

      setFetching(true)

      if (!getGiphyApiKey()) {
        setFetching(false)
        return
      }

      void (async () => {
        try {
          const url = await searchExerciseFormGif(exerciseName)
          if (cancelled) return
          if (url) setGifUrl(url)
        } catch {
          if (!cancelled) setGifUrl(null)
        } finally {
          if (!cancelled) setFetching(false)
        }
      })()
    })

    return () => {
      cancelled = true
    }
  }, [exerciseId, exerciseName, pinnedGifUrl])

  const showSpinner = fetching || (gifUrl !== null && !loaded)
  const showGif = gifUrl !== null && loaded
  const showFallback = !fetching && gifUrl === null

  return (
    <div
      className={`relative w-full overflow-hidden rounded-[14px] bg-[#121214] min-h-[200px] max-h-[240px] flex items-center justify-center ${className ?? ''}`}
    >
      {showSpinner ? (
        <div
          className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3"
          aria-busy="true"
          aria-label="Loading demonstration GIF"
        >
          <div
            className="h-9 w-9 rounded-full border-2 border-white/[0.12] border-t-[#3b82f6] animate-spin"
            role="status"
          />
          <span className="text-[11px] font-medium text-[#6b6b73]">Loading…</span>
        </div>
      ) : null}

      {gifUrl ? (
        <img
          src={gifUrl}
          alt={`${exerciseName} exercise demonstration`}
          className={
            showGif
              ? 'relative z-[1] w-full max-h-[220px] object-contain'
              : 'absolute left-0 top-0 z-0 h-[220px] w-full object-contain opacity-0 pointer-events-none'
          }
          loading="eager"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => {
            setGifUrl(null)
            setLoaded(false)
          }}
        />
      ) : null}

      {showFallback ? (
        <div className="relative z-[1] w-full flex flex-col items-center justify-center gap-2 px-4 py-6 min-h-[160px]">
          {normalizePinnedUrl(pinnedGifUrl) ? (
            <p className="text-[13px] font-medium text-[#8b8b93] text-center leading-relaxed">
              Could not load the GIF from this URL. Check the link or remove it to try Giphy search
              {getGiphyApiKey() ? '' : ' after adding a Giphy API key'}.
            </p>
          ) : getGiphyApiKey() ? (
            <p className="text-[13px] font-medium text-[#8b8b93] text-center leading-relaxed">
              No GIF found for this exercise. Try a different search term in Giphy or check back later.
            </p>
          ) : (
            <p className="text-[13px] font-medium text-[#8b8b93] text-center leading-relaxed">
              Add <code className="text-[#9a9aa3]">VITE_GIPHY_API_KEY</code> to{' '}
              <code className="text-[#9a9aa3]">.env</code> next to <code className="text-[#9a9aa3]">vite.config.ts</code>{' '}
              (Vite does not read <code className="text-[#9a9aa3]">server/.env</code>), then restart the dev server. Get a key at{' '}
              <a
                href="https://developers.giphy.com/dashboard/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline text-[#8b9cff]"
              >
                developers.giphy.com
              </a>
              , or paste a direct GIF URL when creating a custom exercise.
            </p>
          )}
        </div>
      ) : null}
    </div>
  )
}
