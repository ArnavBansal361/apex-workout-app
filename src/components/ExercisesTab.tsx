import { useEffect, useMemo, useRef, useState } from 'react'
import { useWorkout } from '../context/WorkoutContext'
import { getExerciseHelp } from '../data/exercises'
import {
  getStretchDefinition,
  STRETCH_SECTION_ORDER,
  type StretchSection,
} from '../data/stretches'
import { claudeExerciseFormTips } from '../lib/anthropicCoach'
import { strengthProgressSeries, computeStrengthProgressProjection, STRENGTH_PROJECTION_WEEKS } from '../lib/overload'
import { formatLong } from '../lib/dates'
import { formatExerciseLastHistoryLine } from '../lib/lastSession'
import type { Exercise, MuscleGroup, SetLog } from '../types'
import { ConfirmDialog } from './ConfirmDialog'
import { ExerciseMuscleDiagram } from './ExerciseFormGif'
import { MuscleGroupTargetingCard } from './MuscleGroupTargetingCard'
import { QuickLogModal } from './QuickLogModal'

const FILTERS: (MuscleGroup | 'All')[] = [
  'All',
  'Chest',
  'Back',
  'Legs',
  'Shoulders',
  'Arms',
  'Core',
  'Stretches',
]

const GROUP_ORDER: MuscleGroup[] = [
  'Chest',
  'Back',
  'Legs',
  'Shoulders',
  'Arms',
  'Core',
  'Cardio',
  'Stretches',
]

type ExercisesTabProps = {
  gridCols?: 2 | 4
}

function StrengthProgressChart({
  logs,
  exerciseId,
  unit,
}: {
  logs: SetLog[]
  exerciseId: string
  unit: 'lbs' | 'kg'
}) {
  const series = useMemo(() => strengthProgressSeries(logs, exerciseId), [logs, exerciseId])
  const projection = useMemo(() => computeStrengthProgressProjection(series), [series])
  const plotted = useMemo(() => series.filter((p) => p.weight != null), [series])
  const weights = plotted.map((p) => p.weight as number)
  const projectionWeights = projection?.points.map((p) => p.weight) ?? []
  const allWeights = [...weights, ...projectionWeights]
  const minW = allWeights.length ? Math.min(...allWeights) : 0
  const maxW = allWeights.length ? Math.max(...allWeights) : 0
  const pad = maxW === minW ? Math.max(5, maxW * 0.1) : (maxW - minW) * 0.12
  const yMin = Math.max(0, minW - pad)
  const yMax = maxW + pad
  const w = 320
  const h = 140
  const left = 36
  const right = 8
  const top = 10
  const bottom = 28
  const plotW = w - left - right
  const plotH = h - top - bottom
  const histN = series.length
  const totalN = projection ? histN + STRENGTH_PROJECTION_WEEKS : histN

  function xAt(i: number) {
    return left + (totalN <= 1 ? plotW / 2 : (i / (totalN - 1)) * plotW)
  }
  function yAt(weight: number) {
    if (yMax <= yMin) return top + plotH / 2
    return top + plotH - ((weight - yMin) / (yMax - yMin)) * plotH
  }

  const yTicks = 4
  const gridLines = Array.from({ length: yTicks + 1 }, (_, i) => {
    const t = i / yTicks
    const val = yMin + (1 - t) * (yMax - yMin)
    const y = top + t * plotH
    return { val, y }
  })

  const linePoints = plotted
    .map((p) => {
      const i = series.findIndex((s) => s.weekStartKey === p.weekStartKey)
      return `${xAt(i)},${yAt(p.weight as number)}`
    })
    .join(' ')

  const projectionLinePoints = projection
    ? projection.points.map((p) => `${xAt(p.weekIndex)},${yAt(p.weight)}`).join(' ')
    : ''

  if (plotted.length < 2) {
    return (
      <div className="mt-5">
        <p
          className="mb-3 text-[10px] font-normal uppercase tracking-[0.08em]"
          style={{ color: 'rgba(255,255,255,0.3)' }}
        >
          Strength progress
        </p>
        <p className="text-center text-[12px] font-normal" style={{ color: 'rgba(255,255,255,0.3)' }}>
          Log more sets to see your progress
        </p>
      </div>
    )
  }

  return (
    <div className="mt-5">
      <p
        className="mb-3 text-[10px] font-normal uppercase tracking-[0.08em]"
        style={{ color: 'rgba(255,255,255,0.3)' }}
      >
        Strength progress
      </p>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto" aria-hidden>
        {gridLines.map((g) => (
          <line
            key={g.y}
            x1={left}
            x2={w - right}
            y1={g.y}
            y2={g.y}
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={1}
          />
        ))}
        {gridLines.map((g) => (
          <text
            key={`y-${g.y}`}
            x={left - 6}
            y={g.y + 3}
            textAnchor="end"
            fill="rgba(255,255,255,0.3)"
            fontSize={10}
          >
            {Math.round(g.val)}
          </text>
        ))}
        {series.map((p, i) => (
          <text
            key={p.weekStartKey}
            x={xAt(i)}
            y={h - 6}
            textAnchor="middle"
            fill="rgba(255,255,255,0.3)"
            fontSize={10}
          >
            {p.label}
          </text>
        ))}
        {linePoints ? (
          <polyline
            fill="none"
            stroke="var(--apex-accent)"
            strokeWidth={1.5}
            points={linePoints}
          />
        ) : null}
        {projectionLinePoints ? (
          <polyline
            fill="none"
            stroke="color-mix(in srgb, var(--apex-accent) 55%, transparent)"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            points={projectionLinePoints}
          />
        ) : null}
        {plotted.map((p) => {
          const i = series.findIndex((s) => s.weekStartKey === p.weekStartKey)
          const cx = xAt(i)
          const cy = yAt(p.weight as number)
          return <circle key={p.weekStartKey} cx={cx} cy={cy} r={2} fill="var(--apex-accent)" />
        })}
      </svg>
      {projection ? (
        <p className="mt-3 text-[12px] font-medium leading-relaxed" style={{ color: 'rgba(255,255,255,0.45)' }}>
          At this rate you&apos;ll hit {projection.projectedWeight} {unit} by{' '}
          {formatLong(projection.projectedDate)}.
        </p>
      ) : null}
      <p className="sr-only">
        Strength progress for last 8 weeks in {unit}, peak weight per week.
      </p>
    </div>
  )
}

export function ExercisesTab({ gridCols: _gridCols = 2 }: ExercisesTabProps) {
  const { visibleExercises, hideExercise, state, addPlanExercise, notify, toggleFavoriteExercise, addCustomExercise } =
    useWorkout()
  const searchRef = useRef<HTMLInputElement>(null)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<MuscleGroup | 'All'>('All')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createMuscle, setCreateMuscle] = useState<MuscleGroup>('Chest')
  const [createTipsGenerating, setCreateTipsGenerating] = useState(false)
  const [createTipsError, setCreateTipsError] = useState<string | null>(null)
  const [createFormTips, setCreateFormTips] = useState('')
  const [createCommonMistakes, setCreateCommonMistakes] = useState('')
  const [createBeginnerAdvice, setCreateBeginnerAdvice] = useState('')
  const [createTipsReady, setCreateTipsReady] = useState(false)

  function resetCreateForm() {
    setCreateName('')
    setCreateMuscle('Chest')
    setCreateTipsGenerating(false)
    setCreateTipsError(null)
    setCreateFormTips('')
    setCreateCommonMistakes('')
    setCreateBeginnerAdvice('')
    setCreateTipsReady(false)
  }
  const [quickLogExercise, setQuickLogExercise] = useState<Exercise | null>(null)
  const customExerciseIds = useMemo(
    () => new Set(state.customExercises.map((ex) => ex.id)),
    [state.customExercises],
  )

  const favoriteSet = useMemo(() => new Set(state.favoriteExerciseIds), [state.favoriteExerciseIds])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    return visibleExercises
      .filter((e) => filter === 'All' || e.muscleGroup === filter)
      .filter(
        (e) =>
          !s ||
          e.name.toLowerCase().includes(s) ||
          e.muscleGroup.toLowerCase().includes(s) ||
          e.equipment.toLowerCase().includes(s),
      )
  }, [visibleExercises, q, filter])

  const sortedFiltered = useMemo(
    () => [...filtered].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
    [filtered],
  )

  const grouped = useMemo(() => {
    const m = new Map<MuscleGroup, Exercise[]>()
    for (const e of filtered) {
      const arr = m.get(e.muscleGroup) ?? []
      arr.push(e)
      m.set(e.muscleGroup, arr)
    }
    for (const [mg, list] of m) {
      list.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
      m.set(mg, list)
    }
    return m
  }, [filtered])

  const stretchSections = useMemo(() => {
    if (filter !== 'Stretches') return null
    const m = new Map<StretchSection, typeof filtered>()
    for (const e of filtered) {
      const sec = getStretchDefinition(e.id)?.section ?? 'Spine & core'
      const arr = m.get(sec) ?? []
      arr.push(e)
      m.set(sec, arr)
    }
    return m
  }, [filtered, filter])

  const showTargetingCard = filter !== 'All'
  const active = activeId ? visibleExercises.find((e) => e.id === activeId) : null
  const help = active ? getExerciseHelp(active) : null
  const activeStretch = active ? getStretchDefinition(active.id) : null
  const activeLastHistoryLine = useMemo(
    () =>
      active
        ? formatExerciseLastHistoryLine(state.setLogs, active.id, state.settings.unit)
        : null,
    [active, state.setLogs, state.settings.unit],
  )

  function renderExerciseRow(e: Exercise) {
    const favorited = favoriteSet.has(e.id)
    const stretch = getStretchDefinition(e.id)
    const equipmentLabel = stretch ? 'Bodyweight' : e.equipment
    return (
      <div key={e.id} className="apex-library-row">
        <button
          type="button"
          className="apex-library-row__main"
          onClick={() => setActiveId(e.id)}
        >
          <span className="apex-library-row__name">{e.name}</span>
          <span className="apex-library-row__equipment">{equipmentLabel}</span>
        </button>
        <button
          type="button"
          className={`apex-library-row__star${favorited ? ' apex-library-row__star--on' : ''}`}
          aria-label={
            favorited ? `Remove ${e.name} from favorites` : `Add ${e.name} to favorites`
          }
          onClick={() => toggleFavoriteExercise(e.id)}
        >
          <i className={`ti ${favorited ? 'ti-star-filled' : 'ti-star'}`} aria-hidden />
        </button>
      </div>
    )
  }

  return (
    <div className="apex-library pb-28">
      <header className="apex-library-header">
        <div className="apex-library-header__top">
          <div className="min-w-0">
            <p className="apex-library-eyebrow">Library</p>
            <h1 className="apex-library-title">Exercises</h1>
            <p className="apex-library-subtitle">300+ movements, filters by muscle.</p>
          </div>
          <button
            type="button"
            className="apex-library-stretch-btn"
            aria-label="Browse stretches"
            onClick={() => setFilter('Stretches')}
          >
            <i className="ti ti-accessibility" aria-hidden />
          </button>
        </div>
        <button
          type="button"
          className="mt-3 text-[12px] font-medium text-[#7d7d88] touch-manipulation hover:text-[#a0a0a8]"
          onClick={() => {
            setCreateOpen(true)
            resetCreateForm()
          }}
        >
          Create custom exercise
        </button>
      </header>

      <div className="apex-library-search">
        <i className="ti ti-search apex-library-search__icon" aria-hidden />
        <input
          ref={searchRef}
          className="apex-library-search__input"
          placeholder="Search 300+ exercises"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <kbd className="apex-library-search__kbd" aria-hidden>
          ⌘K
        </kbd>
      </div>

      <div className="apex-library-filters" role="tablist" aria-label="Muscle group">
        {FILTERS.map((f) => {
          const on = filter === f
          return (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={on}
              className={`apex-library-pill${on ? ' apex-library-pill--active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f}
            </button>
          )
        })}
      </div>

      {showTargetingCard ? <MuscleGroupTargetingCard muscleGroup={filter} /> : null}

      {filter === 'Stretches' && stretchSections ? (
        STRETCH_SECTION_ORDER.map((sec) => {
          const list = stretchSections.get(sec)
          if (!list?.length) return null
          return (
            <section key={sec} className="apex-library-section">
              <div className="apex-library-section-head">
                <h2 className="apex-library-section-title">
                  {sec.toUpperCase()} · {list.length}
                </h2>
                <span className="apex-library-section-sort">A–Z</span>
              </div>
              <div className="apex-library-list">{list.map((e) => renderExerciseRow(e))}</div>
            </section>
          )
        })
      ) : filter !== 'All' ? (
        <div className="apex-library-list">{sortedFiltered.map((e) => renderExerciseRow(e))}</div>
      ) : (
        GROUP_ORDER.map((mg) => {
          const list = grouped.get(mg)
          if (!list?.length) return null
          return (
            <section key={mg} className="apex-library-section">
              <div className="apex-library-section-head">
                <h2 className="apex-library-section-title">
                  {mg.toUpperCase()} · {list.length}
                </h2>
                <span className="apex-library-section-sort">A–Z</span>
              </div>
              <div className="apex-library-list">{list.map((e) => renderExerciseRow(e))}</div>
            </section>
          )
        })
      )}

      {active && help ? (
        <div
          role="presentation"
          className="apex-modal-overlay fixed inset-0 z-[65] flex items-end sm:items-center justify-center p-4"
          onClick={() => setActiveId(null)}
        >
          <div
            className="w-full max-w-lg apex-card p-6 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between gap-2 items-start">
              <div>
                <h3 className="text-xl font-bold text-[#f4f4f5] tracking-tight">{active.name}</h3>
                {activeLastHistoryLine ? (
                  <p className="mt-1.5 text-[12px] font-medium text-[#a0a0a8] leading-relaxed">
                    {activeLastHistoryLine}
                  </p>
                ) : null}
                <p className="text-[12px] font-semibold text-[#a0a0a8] uppercase tracking-wider mt-1">
                  {activeStretch
                    ? `${activeStretch.targets.join(' · ')} · ${activeStretch.hold}`
                    : active.muscleGroup}
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
              <ExerciseMuscleDiagram
                muscleGroup={active.muscleGroup}
                exerciseName={active.name}
               
                className="w-full"
              />
            </div>
            <button
              type="button"
              className="apex-btn-primary mt-4 w-full min-h-12 rounded-[14px] text-[13px] font-semibold touch-manipulation"
              onClick={() => {
                const ex = active
                if (activeStretch) {
                  addPlanExercise(ex.id)
                  notify('Added to today’s plan')
                  setActiveId(null)
                  return
                }
                setActiveId(null)
                setQuickLogExercise(ex)
              }}
            >
              {activeStretch ? 'Add to today’s plan' : 'Log set'}
            </button>
            <div className="mt-5 space-y-4">
              {activeStretch ? (
                <>
                  <div>
                    <p className="apex-section-label mb-2">Hold</p>
                    <p className="text-[13px] font-medium text-[#a8a8b0] leading-relaxed">
                      {activeStretch.hold}
                    </p>
                  </div>
                  <div>
                    <p className="apex-section-label mb-2">Target muscles</p>
                    <p className="text-[13px] font-medium text-[#a8a8b0] leading-relaxed">
                      {activeStretch.targets.join(', ')}
                    </p>
                  </div>
                  <div>
                    <p className="apex-section-label mb-2">Instructions</p>
                    <p className="text-[13px] font-medium text-[#a8a8b0] leading-relaxed">
                      {activeStretch.instructions}
                    </p>
                  </div>
                  <div>
                    <p className="apex-section-label mb-2">Avoid</p>
                    <p className="text-[13px] font-medium text-[#a8a8b0] leading-relaxed">
                      {help.commonMistakes}
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <p className="apex-section-label mb-2">Form tips</p>
                    <p className="text-[13px] font-medium text-[#a8a8b0] leading-relaxed">
                      {help.formTips}
                    </p>
                  </div>
                  <StrengthProgressChart
                    logs={state.setLogs}
                    exerciseId={active.id}
                    unit={state.settings.unit}
                  />
                  <div>
                    <p className="apex-section-label mb-2">Common mistakes</p>
                    <p className="text-[13px] font-medium text-[#a8a8b0] leading-relaxed">
                      {help.commonMistakes}
                    </p>
                  </div>
                  <div>
                    <p className="apex-section-label mb-2">Beginner advice</p>
                    <p className="text-[13px] font-medium text-[#a8a8b0] leading-relaxed">
                      {help.beginnerAdvice}
                    </p>
                  </div>
                </>
              )}
            </div>
            {customExerciseIds.has(active.id) ? (
              <button
                type="button"
                className="apex-btn-muted mt-6 w-full min-h-12 text-[13px]"
                onClick={() => setConfirmId(active.id)}
              >
                Delete from library
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {createOpen ? (
        <div
          role="presentation"
          className="apex-modal-overlay fixed inset-0 z-[68] flex items-end sm:items-center justify-center p-4"
          onClick={() => {
            setCreateOpen(false)
            resetCreateForm()
          }}
        >
          <div
            className="w-full max-w-lg apex-card p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start gap-2">
              <div>
                <p className="apex-page-sub">Library</p>
                <h3 className="text-xl font-bold text-[#f4f4f5] tracking-tight mt-0.5">New exercise</h3>
                <p className="mt-2 text-[12px] font-medium text-[#a0a0a8] leading-relaxed">
                  Add your own movement to the library. It will show on the muscle diagram for its group.
                </p>
              </div>
              <button
                type="button"
                className="apex-btn min-h-10 min-w-10 rounded-[12px] text-[#ececee] text-lg leading-none"
                onClick={() => {
                  setCreateOpen(false)
                  resetCreateForm()
                }}
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
            {!createTipsReady ? (
              <>
                <button
                  type="button"
                  disabled={createTipsGenerating || !createName.trim()}
                  className="w-full min-h-[40px] rounded-[8px] text-[13px] font-normal touch-manipulation disabled:opacity-40 flex items-center justify-center gap-2"
                  style={{
                    border: '0.5px solid rgba(255,255,255,0.2)',
                    background: 'transparent',
                    color: createTipsGenerating ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.6)',
                  }}
                  onClick={() => {
                    const n = createName.trim()
                    if (!n) return
                    setCreateTipsGenerating(true)
                    setCreateTipsError(null)
                    void claudeExerciseFormTips(n)
                      .then((h) => {
                        setCreateFormTips(h.formTips)
                        setCreateCommonMistakes(h.commonMistakes)
                        setCreateBeginnerAdvice(h.beginnerAdvice)
                        setCreateTipsReady(true)
                      })
                      .catch(() => {
                        setCreateTipsError("Couldn't generate tips. You can add them manually.")
                      })
                      .finally(() => setCreateTipsGenerating(false))
                  }}
                >
                  {createTipsGenerating ? (
                    <>
                      <i className="ti ti-loader-2 animate-spin text-[16px]" aria-hidden />
                      <span>Generating…</span>
                    </>
                  ) : (
                    'Generate form tips with AI'
                  )}
                </button>
                {createTipsError ? (
                  <p className="text-[11px] font-normal" style={{ color: 'rgba(255,255,255,0.35)' }}>
                    {createTipsError}
                  </p>
                ) : null}
              </>
            ) : (
              <div className="space-y-3">
                <label className="block">
                  <span className="apex-section-label block mb-2">Form tips</span>
                  <textarea
                    className="apex-input w-full min-h-[4.5rem] px-3 py-2 text-[13px]"
                    value={createFormTips}
                    onChange={(e) => setCreateFormTips(e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="apex-section-label block mb-2">Common mistakes</span>
                  <textarea
                    className="apex-input w-full min-h-[4.5rem] px-3 py-2 text-[13px]"
                    value={createCommonMistakes}
                    onChange={(e) => setCreateCommonMistakes(e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="apex-section-label block mb-2">Beginner advice</span>
                  <textarea
                    className="apex-input w-full min-h-[4.5rem] px-3 py-2 text-[13px]"
                    value={createBeginnerAdvice}
                    onChange={(e) => setCreateBeginnerAdvice(e.target.value)}
                  />
                </label>
              </div>
            )}
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
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                className="apex-btn flex-1 min-h-12 rounded-[14px] border-white/[0.1]"
                onClick={() => {
                  setCreateOpen(false)
                  resetCreateForm()
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="apex-btn-primary flex-1 min-h-12 rounded-[14px] text-[13px] font-semibold"
                onClick={() => {
                  const n = createName.trim()
                  if (!n) {
                    notify('Enter a name')
                    return
                  }
                  const help =
                    createTipsReady &&
                    createFormTips.trim() &&
                    createCommonMistakes.trim() &&
                    createBeginnerAdvice.trim()
                      ? {
                          formTips: createFormTips.trim(),
                          commonMistakes: createCommonMistakes.trim(),
                          beginnerAdvice: createBeginnerAdvice.trim(),
                        }
                      : undefined
                  addCustomExercise(n, createMuscle, undefined, help)
                  setCreateOpen(false)
                  resetCreateForm()
                }}
              >
                Save exercise
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {quickLogExercise ? (
        <QuickLogModal
         
          initialExercise={quickLogExercise}
          onClose={() => setQuickLogExercise(null)}
        />
      ) : null}

      <ConfirmDialog
        open={!!confirmId}
        title="Remove exercise?"
        message="This hides the exercise from your library. History is kept."
        confirmLabel="Remove"
       
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
