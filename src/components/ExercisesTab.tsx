import { useMemo, useState } from 'react'
import { useWorkout } from '../context/WorkoutContext'
import { getExerciseHelp } from '../data/exercises'
import { muscleGroupIcon } from '../lib/muscleIcons'
import type { MuscleGroup } from '../types'
import { ConfirmDialog } from './ConfirmDialog'
import { ExerciseFormGif } from './ExerciseFormGif'

const FILTERS: (MuscleGroup | 'All')[] = [
  'All',
  'Chest',
  'Back',
  'Legs',
  'Shoulders',
  'Arms',
  'Core',
  'Cardio',
  'Stretches',
]

export function ExercisesTab() {
  const { visibleExercises, hideExercise, state, addPlanExercise, notify, toggleFavoriteExercise, addCustomExercise } =
    useWorkout()
  const accent = state.settings.accentColor
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<MuscleGroup | 'All'>('All')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createMuscle, setCreateMuscle] = useState<MuscleGroup>('Chest')
  const [createGifUrl, setCreateGifUrl] = useState('')

  const favoriteSet = useMemo(() => new Set(state.favoriteExerciseIds), [state.favoriteExerciseIds])

  const favoriteExercises = useMemo(() => {
    const byId = new Map(visibleExercises.map((e) => [e.id, e]))
    return state.favoriteExerciseIds
      .map((id) => byId.get(id))
      .filter((e): e is NonNullable<typeof e> => Boolean(e))
  }, [visibleExercises, state.favoriteExerciseIds])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    return visibleExercises
      .filter((e) => !favoriteSet.has(e.id))
      .filter((e) => filter === 'All' || e.muscleGroup === filter)
      .filter(
        (e) =>
          !s ||
          e.name.toLowerCase().includes(s) ||
          e.muscleGroup.toLowerCase().includes(s),
      )
  }, [visibleExercises, q, filter, favoriteSet])

  const favoritesFiltered = useMemo(() => {
    const s = q.trim().toLowerCase()
    return favoriteExercises
      .filter((e) => filter === 'All' || e.muscleGroup === filter)
      .filter(
        (e) =>
          !s ||
          e.name.toLowerCase().includes(s) ||
          e.muscleGroup.toLowerCase().includes(s),
      )
  }, [favoriteExercises, q, filter])

  const grouped = useMemo(() => {
    const m = new Map<MuscleGroup, typeof filtered>()
    for (const e of filtered) {
      const arr = m.get(e.muscleGroup) ?? []
      arr.push(e)
      m.set(e.muscleGroup, arr)
    }
    return m
  }, [filtered])

  const order = FILTERS.filter((f) => f !== 'All') as MuscleGroup[]
  const active = activeId ? visibleExercises.find((e) => e.id === activeId) : null
  const help = active ? getExerciseHelp(active) : null

  return (
    <div className="space-y-8 pb-32" style={{ ['--accent' as string]: accent }}>
      <header>
        <p className="apex-page-sub">Library</p>
        <h1 className="apex-page-title mt-1">Exercises</h1>
        <p className="mt-2 text-[13px] font-medium text-[#7c7c84] leading-relaxed max-w-[20rem]">
          Search, filter by muscle, tap for form cues — add anything to today&apos;s plan.
        </p>
        <button
          type="button"
          className="mt-4 min-h-11 w-full max-w-[20rem] rounded-[14px] border border-white/[0.1] bg-white/[0.04] px-4 text-[13px] font-semibold text-[#ececee] transition-colors hover:bg-white/[0.08] active:scale-[0.99]"
          onClick={() => {
            setCreateOpen(true)
            setCreateName('')
            setCreateMuscle('Chest')
            setCreateGifUrl('')
          }}
        >
          Create custom exercise
        </button>
      </header>

      <div className="apex-search-wrap">
        <div className="apex-search-inner">
          <svg
            className="shrink-0 opacity-45"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-4-4" strokeLinecap="round" />
          </svg>
          <input
            className="min-h-10 flex-1 bg-transparent border-0 p-0 text-[15px] font-medium text-[#ececee] placeholder:text-[#5c5c64] placeholder:font-normal focus:outline-none focus:ring-0"
            placeholder="Search exercises…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 touch-pan-x">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            className={`shrink-0 min-h-10 px-4 rounded-full text-[13px] font-semibold border transition-all duration-200 active:scale-[0.97] touch-manipulation ${
              filter === f
                ? 'text-[#0a0a0c] border-transparent shadow-md'
                : 'border-white/[0.08] bg-white/[0.03] text-[#8b8b93] hover:border-white/[0.12] hover:text-[#c4c4cc]'
            }`}
            style={
              filter === f
                ? { backgroundColor: accent, boxShadow: `0 6px 20px color-mix(in srgb, ${accent} 35%, transparent)` }
                : undefined
            }
            onClick={() => setFilter(f)}
          >
            {f}
          </button>
        ))}
      </div>

      {favoritesFiltered.length ? (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-lg leading-none" aria-hidden>
              ⭐
            </span>
            <h2 className="text-lg font-bold text-[#f0f0f2] tracking-tight">Favorites</h2>
            <span className="text-[11px] font-semibold text-[#5c5c64] tabular-nums ml-auto">
              {favoritesFiltered.length}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {favoritesFiltered.map((e) => (
              <div
                key={e.id}
                className="relative min-h-[5.5rem] rounded-[16px] border border-amber-500/25 bg-gradient-to-b from-amber-500/[0.07] to-transparent overflow-hidden group apex-card-interactive"
              >
                <button
                  type="button"
                  className="absolute top-2 left-2 z-10 flex h-8 w-8 items-center justify-center rounded-[10px] border border-amber-500/35 bg-black/50 text-amber-300 backdrop-blur-sm transition-all hover:bg-amber-500/15 active:scale-95"
                  aria-label={`Remove ${e.name} from favorites`}
                  onClick={(ev) => {
                    ev.stopPropagation()
                    toggleFavoriteExercise(e.id)
                  }}
                >
                  <span className="text-[15px] leading-none" aria-hidden>
                    ★
                  </span>
                </button>
                <button
                  type="button"
                  className="absolute top-2 right-2 z-10 flex h-8 w-8 items-center justify-center rounded-[10px] border border-white/[0.1] bg-black/40 text-[18px] font-bold leading-none text-[#ececee] backdrop-blur-sm transition-all hover:bg-white/[0.12] active:scale-95"
                  aria-label={`Add ${e.name} to plan`}
                  onClick={(ev) => {
                    ev.stopPropagation()
                    addPlanExercise(e.id)
                    notify('Added to today’s plan')
                  }}
                >
                  +
                </button>
                <button
                  type="button"
                  className="min-h-[5.5rem] w-full px-3 py-3 pl-11 pr-11 text-left flex flex-col justify-end"
                  onClick={() => setActiveId(e.id)}
                >
                  <span className="text-xs mb-1 opacity-80" aria-hidden>
                    {muscleGroupIcon(e.muscleGroup)}
                  </span>
                  <span className="text-[13px] font-semibold text-[#f0f0f2] leading-snug line-clamp-3 tracking-tight">
                    {e.name}
                  </span>
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {order.map((mg) => {
        const list = grouped.get(mg)
        if (!list?.length) return null
        return (
          <section key={mg} className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-lg leading-none" aria-hidden>
                {muscleGroupIcon(mg)}
              </span>
              <h2 className="text-lg font-bold text-[#f0f0f2] tracking-tight">{mg}</h2>
              <span className="text-[11px] font-semibold text-[#5c5c64] tabular-nums ml-auto">
                {list.length}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {list.map((e) => (
                <div
                  key={e.id}
                  className="relative min-h-[5.5rem] rounded-[16px] border border-white/[0.08] bg-gradient-to-b from-white/[0.06] to-transparent overflow-hidden group apex-card-interactive"
                >
                  <button
                    type="button"
                    className="absolute top-2 left-2 z-10 flex h-8 w-8 items-center justify-center rounded-[10px] border border-white/[0.1] bg-black/40 text-[#8b8b93] backdrop-blur-sm transition-all hover:border-amber-500/40 hover:text-amber-200/90 hover:bg-amber-500/10 active:scale-95"
                    aria-label={`Add ${e.name} to favorites`}
                    onClick={(ev) => {
                      ev.stopPropagation()
                      toggleFavoriteExercise(e.id)
                    }}
                  >
                    <span className="text-[15px] leading-none" aria-hidden>
                      ☆
                    </span>
                  </button>
                  <button
                    type="button"
                    className="absolute top-2 right-2 z-10 flex h-8 w-8 items-center justify-center rounded-[10px] border border-white/[0.1] bg-black/40 text-[18px] font-bold leading-none text-[#ececee] backdrop-blur-sm transition-all hover:bg-white/[0.12] active:scale-95"
                    aria-label={`Add ${e.name} to plan`}
                    onClick={(ev) => {
                      ev.stopPropagation()
                      addPlanExercise(e.id)
                      notify('Added to today’s plan')
                    }}
                  >
                    +
                  </button>
                  <button
                    type="button"
                    className="min-h-[5.5rem] w-full px-3 py-3 pl-11 pr-11 text-left flex flex-col justify-end"
                    onClick={() => setActiveId(e.id)}
                  >
                    <span className="text-xs mb-1 opacity-80" aria-hidden>
                      {muscleGroupIcon(e.muscleGroup)}
                    </span>
                    <span className="text-[13px] font-semibold text-[#f0f0f2] leading-snug line-clamp-3 tracking-tight">
                      {e.name}
                    </span>
                  </button>
                </div>
              ))}
            </div>
          </section>
        )
      })}

      {active && help ? (
        <div className="fixed inset-0 z-[65] flex items-end sm:items-center justify-center bg-black/85 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg apex-card p-6 max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex justify-between gap-2 items-start">
              <div>
                <h3 className="text-xl font-bold text-[#f4f4f5] tracking-tight">{active.name}</h3>
                <p className="text-[12px] font-semibold text-[#7c7c84] uppercase tracking-wider mt-1">
                  {active.muscleGroup}
                </p>
              </div>
              <button
                type="button"
                className="apex-btn min-h-10 min-w-10 rounded-[12px] text-[#ececee] text-lg leading-none"
                onClick={() => setActiveId(null)}
              >
                ✕
              </button>
            </div>
            <div className="mt-5">
              <ExerciseFormGif
                exerciseId={active.id}
                exerciseName={active.name}
                pinnedGifUrl={active.gifUrl}
                className="w-full"
              />
            </div>
            <div className="mt-5 space-y-4">
              <div>
                <p className="apex-section-label mb-2">Form tips</p>
                <p className="text-[13px] font-medium text-[#a1a1a8] leading-relaxed">{help.formTips}</p>
              </div>
              <div>
                <p className="apex-section-label mb-2">Common mistakes</p>
                <p className="text-[13px] font-medium text-[#a1a1a8] leading-relaxed">{help.commonMistakes}</p>
              </div>
              <div>
                <p className="apex-section-label mb-2">Beginner advice</p>
                <p className="text-[13px] font-medium text-[#a1a1a8] leading-relaxed">{help.beginnerAdvice}</p>
              </div>
            </div>
            <button
              type="button"
              className="mt-6 w-full min-h-12 rounded-[14px] border border-red-500/30 bg-red-950/25 text-[13px] font-semibold text-red-400 transition-colors hover:bg-red-950/40 active:scale-[0.99]"
              onClick={() => setConfirmId(active.id)}
            >
              Delete from library
            </button>
          </div>
        </div>
      ) : null}

      {createOpen ? (
        <div className="fixed inset-0 z-[68] flex items-end sm:items-center justify-center bg-black/85 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg apex-card p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-start gap-2">
              <div>
                <p className="apex-page-sub">Library</p>
                <h3 className="text-xl font-bold text-[#f4f4f5] tracking-tight mt-0.5">New exercise</h3>
                <p className="mt-2 text-[12px] font-medium text-[#6b6b73] leading-relaxed">
                  Add your own movement. Optionally paste a direct https URL to a GIF or image for the demo; otherwise
                  Giphy search runs when <code className="text-[#8b8b93]">VITE_GIPHY_API_KEY</code> is set.
                </p>
              </div>
              <button
                type="button"
                className="apex-btn min-h-10 min-w-10 rounded-[12px] text-[#ececee] text-lg leading-none"
                onClick={() => setCreateOpen(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <label className="block">
              <span className="apex-section-label block mb-2">Name</span>
              <input
                className="apex-input w-full min-h-12 px-3"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="e.g. Cable Y raise"
                autoComplete="off"
              />
            </label>
            <label className="block">
              <span className="apex-section-label block mb-2">Muscle group</span>
              <select
                className="apex-input w-full min-h-12 px-3 bg-[#141418]"
                value={createMuscle}
                onChange={(e) => setCreateMuscle(e.target.value as MuscleGroup)}
              >
                {(FILTERS.filter((f) => f !== 'All') as MuscleGroup[]).map((mg) => (
                  <option key={mg} value={mg}>
                    {mg}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="apex-section-label block mb-2">GIF URL (optional)</span>
              <input
                className="apex-input w-full min-h-12 px-3"
                value={createGifUrl}
                onChange={(e) => setCreateGifUrl(e.target.value)}
                placeholder="https://…"
                autoComplete="off"
              />
            </label>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                className="apex-btn flex-1 min-h-12 rounded-[14px] border-white/[0.1]"
                onClick={() => setCreateOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="flex-1 min-h-12 rounded-[14px] text-[13px] font-semibold text-[#0c0c0c]"
                style={{ backgroundColor: accent }}
                onClick={() => {
                  const n = createName.trim()
                  if (!n) {
                    notify('Enter a name')
                    return
                  }
                  addCustomExercise(n, createMuscle, createGifUrl)
                  setCreateOpen(false)
                }}
              >
                Save exercise
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={!!confirmId}
        title="Remove exercise?"
        message="This hides the exercise from your library. History is kept."
        confirmLabel="Remove"
        accent={accent}
        onCancel={() => setConfirmId(null)}
        onConfirm={() => {
          if (confirmId) hideExercise(confirmId)
          setConfirmId(null)
          setActiveId(null)
        }}
      />
    </div>
  )
}
