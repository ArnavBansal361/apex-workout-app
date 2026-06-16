import { useCallback, useMemo, useRef, useState, type DragEvent } from 'react'
import { useWorkout } from '../context/WorkoutContext'
import { AiWorkoutTemplatesSection } from './AiWorkoutTemplatesSection'
import { EXERCISE_BY_ID, EXERCISES } from '../data/exercises'
import { PLAN_PRESETS } from '../data/planPresets'
import { dateKey, formatShortWeekday, mondayFirstColumnIndex, parseDateKey, todayDateKey } from '../lib/dates'
import {
  dayHasLoggedWork,
  estimateDayDurationMinutes,
  muscleVolumeBalanceRows,
  totalSetsLoggedThisWeek,
} from '../lib/scheduleWeekStats'
import { TRAINING_MODES, trainingModeDef } from '../lib/trainingMode'
import type { Exercise, MuscleGroup, ScheduleDay, WorkoutTemplate } from '../types'
import type { TrainingMode } from '../lib/trainingMode'

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
const DND_TYPE = 'application/x-apex-schedule-day'

/** Monochrome opacities for schedule muscle-group indicators. */
const MUSCLE_SCHEDULE_COLOR: Record<MuscleGroup, string> = {
  Chest: 'rgba(255,255,255,0.95)',
  Back: 'rgba(255,255,255,0.85)',
  Legs: 'rgba(255,255,255,0.75)',
  Shoulders: 'rgba(255,255,255,0.65)',
  Arms: 'rgba(255,255,255,0.55)',
  Core: 'rgba(255,255,255,0.45)',
  Cardio: 'rgba(255,255,255,0.38)',
  Stretches: 'rgba(255,255,255,0.3)',
}

const MUSCLE_BALANCE_ORDER: MuscleGroup[] = [
  'Chest',
  'Back',
  'Legs',
  'Shoulders',
  'Arms',
  'Core',
  'Cardio',
  'Stretches',
]

function plannedMuscleGroups(day: ScheduleDay, customExercises: Exercise[]): MuscleGroup[] {
  const ids = day.plannedExerciseIds ?? []
  const seen = new Set<MuscleGroup>()
  const out: MuscleGroup[] = []
  for (const id of ids) {
    const ex = EXERCISE_BY_ID[id] ?? customExercises.find((e) => e.id === id)
    if (ex && !seen.has(ex.muscleGroup)) {
      seen.add(ex.muscleGroup)
      out.push(ex.muscleGroup)
    }
  }
  return out
}

function resolvePlannedExerciseIds(
  exerciseIds: string[],
  hiddenExerciseIds: string[],
  customExercises: Exercise[],
): string[] {
  const customIds = new Set(customExercises.map((e) => e.id))
  const valid = new Set([...EXERCISES.map((e) => e.id), ...customIds])
  const hidden = new Set(hiddenExerciseIds)
  const out: string[] = []
  const seen = new Set<string>()
  for (const id of exerciseIds) {
    if (!valid.has(id) || hidden.has(id) || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

function swapFieldsFrom(day: ScheduleDay): Partial<ScheduleDay> {
  return {
    workoutName: day.workoutName,
    notes: day.notes,
    plannedExerciseIds: [...day.plannedExerciseIds],
    trainingMode: day.trainingMode ?? null,
    aiSummary: day.aiSummary,
    googleCalendarEventId: day.googleCalendarEventId,
  }
}

function hasPlannedWork(d: ScheduleDay): boolean {
  return Boolean(d.workoutName.trim()) || (d.plannedExerciseIds?.length ?? 0) > 0
}

function weeklyMuscleDayCounts(schedule: ScheduleDay[], customExercises: Exercise[]) {
  const perGroup: Record<MuscleGroup, Set<string>> = {
    Chest: new Set(),
    Back: new Set(),
    Legs: new Set(),
    Shoulders: new Set(),
    Arms: new Set(),
    Core: new Set(),
    Cardio: new Set(),
    Stretches: new Set(),
  }
  for (const day of schedule) {
    for (const mg of plannedMuscleGroups(day, customExercises)) {
      perGroup[mg].add(day.dateKey)
    }
  }
  const rows = MUSCLE_BALANCE_ORDER.map((group) => ({
    group,
    days: perGroup[group].size,
  })).filter((r) => r.days > 0)
  const max = Math.max(1, ...rows.map((r) => r.days))
  return { rows, max }
}

/** Monday-first calendar: 6 rows × 7 cols for `month` (0–11). */
function monthCellMatrix(year: number, month: number): { dateKey: string; inMonth: boolean }[][] {
  const first = new Date(year, month, 1)
  const dow = first.getDay()
  const mondayOffset = dow === 0 ? -6 : 1 - dow
  const start = new Date(first)
  start.setDate(first.getDate() + mondayOffset)
  const matrix: { dateKey: string; inMonth: boolean }[][] = []
  for (let w = 0; w < 6; w++) {
    const row: { dateKey: string; inMonth: boolean }[] = []
    for (let c = 0; c < 7; c++) {
      const cell = new Date(start)
      cell.setDate(start.getDate() + w * 7 + c)
      row.push({
        dateKey: dateKey(cell),
        inMonth: cell.getMonth() === month,
      })
    }
    matrix.push(row)
  }
  return matrix
}

type ViewMode = 'week' | 'month'

type WeekBulkRow = {
  workoutName: string
  notes: string
  plannedExerciseIds: string[]
  trainingMode: TrainingMode | null
}

function planIdsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

const BULK_PLAN_CUSTOM = '__custom'

function bulkRowPlanSelectValue(
  row: WeekBulkRow,
  hiddenExerciseIds: string[],
  customExercises: Exercise[],
  templates: WorkoutTemplate[],
): string {
  const wn = row.workoutName.trim()
  const ids = row.plannedExerciseIds
  if (ids.length === 0 && (!wn || wn.toLowerCase() === 'rest')) return 'rest'

  for (const p of PLAN_PRESETS) {
    const resolved = resolvePlannedExerciseIds(p.exerciseIds, hiddenExerciseIds, customExercises)
    if (wn === p.title && planIdsEqual(ids, resolved)) return `preset:${p.id}`
  }
  for (const t of templates) {
    const resolved = resolvePlannedExerciseIds(t.exerciseIds, hiddenExerciseIds, customExercises)
    if (wn === t.name && planIdsEqual(ids, resolved)) return `template:${t.id}`
  }
  return BULK_PLAN_CUSTOM
}

type ScheduleTabProps = {
  defaultViewMode?: ViewMode
}

export function ScheduleTab({ defaultViewMode = 'week' }: ScheduleTabProps) {
  const {
    state,
    todayKey,
    updateScheduleDay,
    batchPatchSchedule,
    notify,
    visibleExercises,
    resolveExerciseById,
  } = useWorkout()
  const [viewMode, setViewMode] = useState<ViewMode>(defaultViewMode)
  const [calendarMonth, setCalendarMonth] = useState(() =>
    parseDateKey(state.schedule[0]?.dateKey ?? todayKey),
  )
  const [draftName, setDraftName] = useState('')
  const [draftNotes, setDraftNotes] = useState('')
  const [draftPlannedIds, setDraftPlannedIds] = useState<string[]>([])
  const [draftTrainingMode, setDraftTrainingMode] = useState<TrainingMode | null>(null)
  const [draftExSearch, setDraftExSearch] = useState('')
  const [planWeekOpen, setPlanWeekOpen] = useState(false)
  const [weekBulkDraft, setWeekBulkDraft] = useState<WeekBulkRow[]>([])
  const [bulkDayOpenIdx, setBulkDayOpenIdx] = useState<number | null>(null)
  const [bulkExercisesOpenIdx, setBulkExercisesOpenIdx] = useState<number | null>(null)
  const [bulkSearch, setBulkSearch] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const dayCardRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const scheduleKeys = useMemo(() => new Set(state.schedule.map((d) => d.dateKey)), [state.schedule])

  const jumpMonthToScheduleWeek = useCallback(() => {
    const k = state.schedule[0]?.dateKey
    if (k) setCalendarMonth(parseDateKey(k))
  }, [state.schedule])

  const muscleBalance = useMemo(
    () => weeklyMuscleDayCounts(state.schedule, state.customExercises),
    [state.schedule, state.customExercises],
  )

  const volumeBalance = useMemo(
    () => muscleVolumeBalanceRows(state),
    [state.setLogs, state.schedule, state.customExercises],
  )

  const setsThisWeekTotal = useMemo(() => totalSetsLoggedThisWeek(state), [state.setLogs])

  const weekOfLabel = useMemo(() => {
    const first = state.schedule[0]?.dateKey
    if (!first) return 'WEEK OF —'
    const d = parseDateKey(first)
    const month = d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()
    const day = d.getDate()
    return `WEEK OF ${month} ${day}`
  }, [state.schedule])

  const monthLabel = useMemo(() => {
    return calendarMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  }, [calendarMonth])

  const monthGrid = useMemo(
    () => monthCellMatrix(calendarMonth.getFullYear(), calendarMonth.getMonth()),
    [calendarMonth],
  )

  function open(dk: string) {
    const day = state.schedule.find((s) => s.dateKey === dk)
    setDraftName(day?.workoutName ?? '')
    setDraftNotes(day?.notes ?? '')
    setDraftPlannedIds([...(day?.plannedExerciseIds ?? [])])
    setDraftTrainingMode(day?.trainingMode ?? null)
    setDraftExSearch('')
    setEditing(dk)
  }

  function openPlanWeek(draft?: WeekBulkRow[]) {
    setWeekBulkDraft(
      draft ??
        state.schedule.map((d) => ({
          workoutName: d.workoutName,
          notes: d.notes,
          plannedExerciseIds: [...d.plannedExerciseIds],
          trainingMode: d.trainingMode ?? null,
        })),
    )
    setBulkDayOpenIdx(null)
    setBulkExercisesOpenIdx(null)
    setBulkSearch('')
    setPlanWeekOpen(true)
  }

  async function handlePlanThisWeek() {
    openPlanWeek()
  }

  function savePlanWeek() {
    const patches: { dateKey: string; patch: Partial<ScheduleDay> }[] = []
    state.schedule.forEach((d, i) => {
      const row = weekBulkDraft[i]
      if (!row) return
      const workoutName = row.workoutName.trim()
      const notes = row.notes.trim()
      const plannedExerciseIds = row.plannedExerciseIds
      const trainingMode = row.trainingMode ?? null
      const prevMode = d.trainingMode ?? null
      if (
        workoutName === d.workoutName.trim() &&
        notes === d.notes.trim() &&
        trainingMode === prevMode &&
        JSON.stringify(plannedExerciseIds) === JSON.stringify(d.plannedExerciseIds)
      ) {
        return
      }
      patches.push({
        dateKey: d.dateKey,
        patch: { workoutName, notes, plannedExerciseIds, trainingMode },
      })
    })
    if (!patches.length) {
      notify('No changes to save')
      setPlanWeekOpen(false)
      return
    }
    batchPatchSchedule(patches)
    setPlanWeekOpen(false)
    notify('Week plan updated.')
  }

  const swapScheduleDays = useCallback(
    (sourceKey: string, targetKey: string) => {
      if (sourceKey === targetKey) return
      const a = state.schedule.find((s) => s.dateKey === sourceKey)
      const b = state.schedule.find((s) => s.dateKey === targetKey)
      if (!a || !b) return
      batchPatchSchedule([
        { dateKey: sourceKey, patch: swapFieldsFrom(b) },
        { dateKey: targetKey, patch: swapFieldsFrom(a) },
      ])
      notify('Workouts swapped')
    },
    [batchPatchSchedule, notify, state.schedule],
  )

  function onDragStartDay(e: DragEvent, dateKeyVal: string) {
    if (!scheduleKeys.has(dateKeyVal)) return
    e.dataTransfer.setData(DND_TYPE, dateKeyVal)
    e.dataTransfer.effectAllowed = 'move'
  }

  function onDragOverDay(e: DragEvent, dateKeyVal: string) {
    if (!scheduleKeys.has(dateKeyVal)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  function onDropDay(e: DragEvent, targetKey: string) {
    e.preventDefault()
    if (!scheduleKeys.has(targetKey)) return
    const sourceKey = e.dataTransfer.getData(DND_TYPE)
    if (!sourceKey) return
    swapScheduleDays(sourceKey, targetKey)
  }

  const pickList = useMemo(() => {
    const q = draftExSearch.trim().toLowerCase()
    return visibleExercises
      .filter((e) => !draftPlannedIds.includes(e.id))
      .filter(
        (e) =>
          !q ||
          e.name.toLowerCase().includes(q) ||
          e.muscleGroup.toLowerCase().includes(q),
      )
      .slice(0, 36)
  }, [visibleExercises, draftExSearch, draftPlannedIds])

  function save() {
    if (!editing) return
    const dateKeyVal = editing
    const prev = state.schedule.find((s) => s.dateKey === dateKeyVal)
    if (!prev) return
    const merged: ScheduleDay = {
      ...prev,
      workoutName: draftName.trim(),
      notes: draftNotes.trim(),
      plannedExerciseIds: draftPlannedIds,
      trainingMode: draftTrainingMode,
    }
    updateScheduleDay(dateKeyVal, {
      workoutName: merged.workoutName,
      notes: merged.notes,
      plannedExerciseIds: merged.plannedExerciseIds,
      trainingMode: merged.trainingMode,
    })
    setEditing(null)

  }

  const bulkPickList = useMemo(() => {
    if (bulkExercisesOpenIdx == null) return []
    const row = weekBulkDraft[bulkExercisesOpenIdx]
    if (!row) return []
    const q = bulkSearch.trim().toLowerCase()
    return visibleExercises
      .filter((e) => !row.plannedExerciseIds.includes(e.id))
      .filter(
        (e) =>
          !q ||
          e.name.toLowerCase().includes(q) ||
          e.muscleGroup.toLowerCase().includes(q),
      )
      .slice(0, 24)
  }, [bulkExercisesOpenIdx, bulkSearch, visibleExercises, weekBulkDraft])

  const now = new Date()
  const liveTodayKey = todayDateKey(now)
  const todayColIdx = mondayFirstColumnIndex(now)

  function scrollToDayCard(dateKeyVal: string) {
    dayCardRefs.current[dateKeyVal]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function renderMuscleTagPills(muscles: MuscleGroup[]) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {muscles.map((mg) => (
          <span key={mg} className="apex-schedule-muscle-pill">
            {mg}
          </span>
        ))}
      </div>
    )
  }

  function renderMuscleDots(muscles: MuscleGroup[], size: 'sm' | 'md' = 'sm') {
    const dot =
      size === 'sm' ? 'h-1.5 w-1.5 rounded-full shrink-0' : 'h-2 w-2 rounded-full shrink-0'
    return (
      <div className="flex flex-wrap items-center gap-1">
        {muscles.map((mg) => (
          <span
            key={mg}
            title={mg}
            className={dot}
            style={{ backgroundColor: MUSCLE_SCHEDULE_COLOR[mg] }}
          />
        ))}
      </div>
    )
  }

  return (
    <div className={`${viewMode === 'week' ? 'apex-schedule' : 'apex-tab-stack'} pb-28`}>
      <header className={viewMode === 'week' ? 'apex-schedule-header' : undefined}>
        {viewMode === 'week' ? (
          <>
            <p className="apex-schedule-eyebrow">{weekOfLabel}</p>
            <h1 className="apex-schedule-title">Schedule</h1>
            <p className="apex-schedule-subtitle">Plan your week, spot muscle balance.</p>
          </>
        ) : (
          <>
            <p className="apex-page-sub">Calendar</p>
            <h1 className="apex-page-title mt-1">Schedule</h1>
            <p className="mt-2 text-[13px] font-medium text-[#a0a0a8] leading-relaxed">
              Plan the week, spot muscle balance, and drag days to reshuffle.
            </p>
          </>
        )}
      </header>

      {viewMode === 'week' ? (
        <section className="apex-schedule-volume">
          <div className="apex-schedule-volume__head">
            <p className="apex-schedule-volume__label">Volume balance</p>
            <span className="apex-schedule-volume__meta">sets this week</span>
          </div>
          <div className="apex-schedule-volume__card">
            <ul className="apex-schedule-volume__list">
              {volumeBalance.map(({ group, done, target }) => {
                const pct = target > 0 ? Math.min(100, (done / target) * 100) : done > 0 ? 100 : 0
                return (
                  <li key={group} className="apex-schedule-volume__row">
                    <span className="apex-schedule-volume__muscle">{group}</span>
                    <div className="apex-schedule-volume__bar-track">
                      <div
                        className="apex-schedule-volume__bar-fill"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="apex-schedule-volume__count tabular-nums">
                      {done} / {target}
                    </span>
                  </li>
                )
              })}
            </ul>
            {setsThisWeekTotal === 0 ? (
              <p className="apex-schedule-volume__empty">
                Log sets this week to fill volume bars — targets come from your planned exercises.
              </p>
            ) : null}
          </div>
        </section>
      ) : (
        <section className="apex-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <p className="apex-section-label">This week · muscle balance</p>
              <p className="mt-1 text-[12px] font-medium text-[#a0a0a8]">
                Days per group (from planned exercises). Wider bars = more exposure.
              </p>
            </div>
          </div>
          {muscleBalance.rows.length ? (
            <ul className="space-y-3">
              {muscleBalance.rows.map(({ group, days }) => (
                <li key={group} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 text-[11px] font-medium text-[#a0a0a8]">
                    {group}
                  </span>
                  <div className="flex-1 min-w-0 h-2.5 rounded-full bg-white/[0.06] border border-white/[0.06] overflow-hidden">
                    <div
                      className="h-full rounded-full transition-[width] duration-300"
                      style={{
                        width: `${(days / muscleBalance.max) * 100}%`,
                        backgroundColor: MUSCLE_SCHEDULE_COLOR[group],
                      }}
                    />
                  </div>
                  <span className="w-8 shrink-0 text-right text-[13px] font-medium tabular-nums text-[#e4e4e8]">
                    {days}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] font-medium text-[#9898a0]">
              Add planned exercises to days below — balance bars fill in automatically.
            </p>
          )}
        </section>
      )}

      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="inline-flex rounded-[8px] border border-white/[0.1] p-1">
            <button
              type="button"
              className={`min-h-10 px-4 rounded-[11px] text-[12px] font-medium transition-colors ${
                viewMode === 'week' ? 'text-white' : 'text-white/35 hover:text-white/55'
              }`}
              onClick={() => setViewMode('week')}
            >
              Week
            </button>
            <button
              type="button"
              className={`min-h-10 px-4 rounded-[11px] text-[12px] font-medium transition-colors ${
                viewMode === 'month' ? 'text-white' : 'text-white/35 hover:text-white/55'
              }`}
              onClick={() => {
                setViewMode('month')
                jumpMonthToScheduleWeek()
              }}
            >
              Month
            </button>
          </div>
        </div>

        {viewMode === 'week' ? (
          <>
            <div className="apex-schedule-strip" role="tablist" aria-label="Week days">
              {state.schedule.map((d, idx) => {
                const isToday = d.dateKey === liveTodayKey
                const dt = parseDateKey(d.dateKey)
                const label = WEEKDAY_LABELS[idx] ?? formatShortWeekday(dt).slice(0, 3).toUpperCase()
                const logged = dayHasLoggedWork(state, d.dateKey)
                return (
                  <button
                    key={d.dateKey}
                    type="button"
                    role="tab"
                    aria-selected={isToday}
                    className={`apex-schedule-strip-pill${isToday ? ' apex-schedule-strip-pill--today' : ''}`}
                    onClick={() => scrollToDayCard(d.dateKey)}
                  >
                    <span className="apex-schedule-strip-pill__dow">{label}</span>
                    <span className="apex-schedule-strip-pill__date">{dt.getDate()}</span>
                    {isToday ? (
                      <span className="apex-schedule-strip-pill__dot apex-schedule-strip-pill__dot--today" aria-hidden />
                    ) : logged ? (
                      <span className="apex-schedule-strip-pill__dot" aria-hidden />
                    ) : (
                      <span className="apex-schedule-strip-pill__dot-spacer" aria-hidden />
                    )}
                  </button>
                )
              })}
            </div>

            <div className="apex-schedule-week-actions">
              <button
                type="button"
                className="apex-schedule-week-actions__month"
                onClick={() => {
                  setViewMode('month')
                  jumpMonthToScheduleWeek()
                }}
              >
                Month
              </button>
              <button
                type="button"
                className="apex-schedule-week-actions__plan"
                onClick={() => void handlePlanThisWeek()}
              >
                Plan this week
              </button>
            </div>

            <section className="apex-schedule-this-week">
              <h2 className="apex-schedule-this-week__title">This week</h2>
              <div className="apex-schedule-day-list">
                {state.schedule.map((d, idx) => {
                  const isToday = d.dateKey === liveTodayKey
                  const dt = parseDateKey(d.dateKey)
                  const dow = WEEKDAY_LABELS[idx] ?? formatShortWeekday(dt)
                  const dateLabel = dt.toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                  })
                  const workoutName = d.workoutName.trim()
                  const hasAssignedWorkout = hasPlannedWork(d) && !!workoutName && !/^rest$/i.test(workoutName)
                  const muscleTags = plannedMuscleGroups(d, state.customExercises)
                  const durationMin = hasAssignedWorkout
                    ? estimateDayDurationMinutes(d, state.customExercises)
                    : 0

                  return (
                    <div
                      key={d.dateKey}
                      ref={(el) => {
                        dayCardRefs.current[d.dateKey] = el
                      }}
                      className={`apex-schedule-day-card${isToday ? ' apex-schedule-day-card--today' : ''}`}
                    >
                      <button
                        type="button"
                        className="apex-schedule-day-card__btn"
                        onClick={() => open(d.dateKey)}
                      >
                        <div className="apex-schedule-day-card__top">
                          <p className="apex-schedule-day-card__meta">
                            {dow} · {dateLabel}
                            {d.trainingMode ? (
                              <span className="apex-schedule-day-card__mode">
                                {trainingModeDef(d.trainingMode).label}
                              </span>
                            ) : null}
                          </p>
                          {hasAssignedWorkout && durationMin > 0 ? (
                            <span className="apex-schedule-day-card__duration">
                              <i className="ti ti-clock" aria-hidden />
                              {durationMin} min
                            </span>
                          ) : null}
                        </div>
                        {hasAssignedWorkout ? (
                          <>
                            <h3 className="apex-schedule-day-card__workout">{workoutName}</h3>
                            <div className="apex-schedule-day-card__tags">
                              {renderMuscleTagPills(muscleTags)}
                            </div>
                          </>
                        ) : null}
                      </button>
                    </div>
                  )
                })}
              </div>
            </section>

            <section className="apex-card p-5">
              <AiWorkoutTemplatesSection enabled />
            </section>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 mb-2">
              <button
                type="button"
                className="apex-btn min-h-10 px-3 text-[13px] font-medium rounded-[8px]"
                onClick={() =>
                  setCalendarMonth(
                    new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1),
                  )
                }
                aria-label="Previous month"
              >
                ‹
              </button>
              <h2 className="text-lg font-medium text-[#f4f4f5] tracking-tight text-center flex-1">{monthLabel}</h2>
              <button
                type="button"
                className="apex-btn min-h-10 px-3 text-[13px] font-medium rounded-[8px]"
                onClick={() =>
                  setCalendarMonth(
                    new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1),
                  )
                }
                aria-label="Next month"
              >
                ›
              </button>
            </div>
            <p className="text-[11px] font-medium text-[#9898a0] mb-2">
              This app stores one training week. Days outside your current week are read-only. Drag between colored
              week days to swap plans.
            </p>
            <div className="grid grid-cols-7 gap-1 sm:gap-1.5 mb-2">
              {WEEKDAY_LABELS.map((label, colIdx) => (
                <div
                  key={label}
                  className={`text-center text-[9px] sm:text-[10px] font-medium uppercase tracking-[0.12em] py-1 rounded-t-md ${
                    colIdx === todayColIdx
                      ? 'text-[#f4f4f5] bg-white/[0.08]'
                      : 'text-[#9898a0]'
                  }`}
                >
                  {label}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
              {monthGrid.flat().map(({ dateKey: dk, inMonth }, cellIdx) => {
                const sched = state.schedule.find((s) => s.dateKey === dk)
                const inWeek = Boolean(sched)
                const muscleTags = sched ? plannedMuscleGroups(sched, state.customExercises) : []
                const title = sched?.workoutName.trim() || ''
                const primaryMuscle = muscleTags[0]
                const isToday = dk === liveTodayKey
                const isTodayCol = cellIdx % 7 === todayColIdx
                const dt = parseDateKey(dk)

                return (
                  <div
                    key={dk}
                    onDragOver={(e) => inWeek && onDragOverDay(e, dk)}
                    onDrop={(e) => inWeek && onDropDay(e, dk)}
                    className={`min-h-[5.5rem] sm:min-h-[6.5rem] rounded-[8px] p-1.5 sm:p-2 flex flex-col transition-all ${
                      !inMonth ? 'opacity-40' : ''
                    } ${isTodayCol && inMonth ? 'bg-white/[0.04]' : ''}`}
                    style={{
                      ...(primaryMuscle && inWeek
                        ? {
                            background: '#1a1a1a',
                          }
                        : {}),
                    }}
                  >
                    <div className="flex items-start justify-between gap-0.5">
                      <span
                        className={`text-[11px] sm:text-[12px] font-medium tabular-nums leading-none ${
                          isToday ? 'text-[#f4f4f5]' : inMonth ? 'text-[#a8a8b0]' : 'text-[#9898a0]'
                        }`}
                      >
                        {dt.getDate()}
                      </span>
                      {inWeek ? (
                        <div
                          draggable
                          onDragStart={(e) => onDragStartDay(e, dk)}
                          className="cursor-grab rounded-md p-0.5 text-[10px] text-[#a0a0a8] hover:bg-white/10 active:cursor-grabbing"
                          title="Drag"
                        >
                          ⣿
                        </div>
                      ) : null}
                    </div>
                    {inWeek ? (
                      <button
                        type="button"
                        className="mt-1 flex-1 min-h-0 w-full text-left rounded-lg px-0.5"
                        onClick={() => open(dk)}
                      >
                        {hasPlannedWork(sched!) ? (
                          <>
                            <div className="mb-1">{renderMuscleDots(muscleTags)}</div>
                            {title ? (
                              <p className="text-[10px] sm:text-[11px] font-medium text-[#f0f0f2] leading-tight line-clamp-3">
                                {title}
                              </p>
                            ) : null}
                          </>
                        ) : null}
                      </button>
                    ) : (
                      <div className="mt-1 flex-1 min-h-[2rem]" />
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </section>

      {editing ? (
        <div
          role="presentation"
          className="apex-modal-overlay fixed inset-0 z-[65] flex items-center justify-center p-4"
          onClick={() => setEditing(null)}
        >
          <div
            className="w-full max-w-md apex-card p-6 max-h-[min(92dvh,40rem)] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="apex-page-sub">Edit day</p>
            <h3 className="text-xl font-medium text-[#f4f4f5] tracking-tight mt-1">
              {formatShortWeekday(parseDateKey(editing))} · {editing}
            </h3>
            <label className="mt-5 block">
              <span className="apex-section-label block mb-2">Workout name</span>
              <input
                className="apex-input mt-1 w-full min-h-12 px-3"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                placeholder="Rest"
              />
            </label>
            <label className="mt-4 block">
              <span className="apex-section-label block mb-2">Training mode (optional)</span>
              <select
                className="apex-input mt-1 w-full min-h-12 px-3 text-[13px] font-medium"
                value={draftTrainingMode ?? ''}
                onChange={(e) => {
                  const v = e.target.value
                  setDraftTrainingMode(v ? (v as TrainingMode) : null)
                }}
              >
                <option value="">None</option>
                {TRAINING_MODES.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label} — {m.hint}
                  </option>
                ))}
              </select>
            </label>
            <div className="mt-5">
              <span className="apex-section-label block mb-2">Quick presets</span>
              <p className="text-[12px] font-medium text-[#9898a0] mb-3 leading-relaxed">
                One tap fills this day&apos;s planned exercises. Edit chips below or use search to tweak.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-52 overflow-y-auto pr-0.5">
                {PLAN_PRESETS.map((p) => {
                  const resolved = resolvePlannedExerciseIds(
                    p.exerciseIds,
                    state.hiddenExerciseIds,
                    state.customExercises,
                  )
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className="rounded-[12px] border border-white/[0.08] px-3 py-3 text-left transition-colors hover:border-white/[0.14] hover:bg-white/[0.04] active:scale-[0.99]"
                      onClick={() => {
                        setDraftPlannedIds(resolved)
                        setDraftExSearch('')
                      }}
                    >
                      <p className="text-[14px] font-medium text-[#f0f0f2] leading-snug">{p.title}</p>
                      <p className="mt-1 text-[11px] font-medium text-[#a0a0a8] leading-snug line-clamp-2">
                        {p.subtitle}
                      </p>
                      <p className="mt-1.5 text-[10px] font-medium uppercase tracking-wide text-[#9898a0]">
                        {resolved.length} exercise{resolved.length === 1 ? '' : 's'}
                      </p>
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="mt-5">
              <span className="apex-section-label block mb-2">My templates</span>
              <p className="text-[12px] font-medium text-[#9898a0] mb-3 leading-relaxed">
                Saved from Today (&quot;My templates&quot;). Tap to replace this day&apos;s planned list — you can
                still adjust below.
              </p>
              {state.templates.length ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-44 overflow-y-auto pr-0.5">
                  {state.templates.map((t) => {
                    const resolved = resolvePlannedExerciseIds(
                      t.exerciseIds,
                      state.hiddenExerciseIds,
                      state.customExercises,
                    )
                    return (
                      <button
                        key={t.id}
                        type="button"
                        className="rounded-[12px] border border-white/[0.08] px-3 py-3 text-left transition-colors hover:border-white/[0.14] hover:bg-white/[0.04] active:scale-[0.99]"
                        onClick={() => {
                          setDraftPlannedIds(resolved)
                          setDraftExSearch('')
                        }}
                      >
                        <p className="text-[14px] font-medium text-[#f0f0f2] leading-snug line-clamp-2">
                          {t.name}
                        </p>
                        <p className="mt-1 text-[11px] font-medium text-[#a0a0a8]">
                          {resolved.length} exercise{resolved.length === 1 ? '' : 's'}
                        </p>
                      </button>
                    )
                  })}
                </div>
              ) : (
                <p className="text-[12px] font-medium text-[#9898a0] leading-relaxed">
                  No saved templates yet — build a plan on Today, open &quot;My templates&quot;, and save one to reuse
                  here.
                </p>
              )}
            </div>
            <div className="mt-5">
              <span className="apex-section-label block mb-2">Planned exercises</span>
              <input
                className="apex-input w-full min-h-11 px-3"
                value={draftExSearch}
                onChange={(e) => setDraftExSearch(e.target.value)}
                placeholder="Search your library…"
              />
              <div className="mt-2 max-h-40 overflow-y-auto rounded-[12px] border border-white/[0.08]">
                {pickList.length ? (
                  pickList.map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      className="w-full border-b border-white/[0.05] last:border-b-0 px-3 py-2.5 text-left transition-colors hover:bg-white/[0.04] active:bg-white/[0.06]"
                      onClick={() => {
                        setDraftPlannedIds((ids) => (ids.includes(e.id) ? ids : [...ids, e.id]))
                        setDraftExSearch('')
                      }}
                    >
                      <span className="text-[13px] font-medium text-[#ececee]">{e.name}</span>
                      <span className="ml-2 text-[11px] font-medium text-[#a0a0a8]">{e.muscleGroup}</span>
                    </button>
                  ))
                ) : (
                  <p className="px-3 py-4 text-[12px] font-medium text-[#9898a0]">
                    {draftPlannedIds.length >= visibleExercises.length
                      ? 'All exercises are already added.'
                      : 'No matches — try another search.'}
                  </p>
                )}
              </div>
              {draftPlannedIds.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {draftPlannedIds.map((id) => {
                    const ex = resolveExerciseById(id)
                    if (!ex) return null
                    return (
                      <span
                        key={id}
                        className="inline-flex items-center gap-1 rounded-full border border-white/[0.12] pl-2.5 pr-1 py-1 text-[11px] font-medium text-[#e4e4e8]"
                      >
                        {ex.name}
                        <button
                          type="button"
                          className="flex h-6 w-6 items-center justify-center rounded-full text-[#a0a0a8] hover:bg-white/10 hover:text-[#ececee]"
                          aria-label={`Remove ${ex.name}`}
                          onClick={() => setDraftPlannedIds((ids) => ids.filter((x) => x !== id))}
                        >
                          ✕
                        </button>
                      </span>
                    )
                  })}
                </div>
              ) : (
                <p className="mt-2 text-[12px] font-medium text-[#9898a0]">
                  Pick exercises from your library — muscle tags appear on the week cards.
                </p>
              )}
            </div>
            <label className="mt-4 block">
              <span className="apex-section-label block mb-2">Notes</span>
              <textarea
                className="apex-input mt-1 w-full min-h-28 px-3 py-3 resize-y"
                value={draftNotes}
                onChange={(e) => setDraftNotes(e.target.value)}
              />
            </label>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                className="apex-btn min-h-12 flex-1 text-[14px] font-medium"
                onClick={() => setEditing(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="apex-btn-primary min-h-12 flex-1 text-[14px] font-medium"
                onClick={save}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {planWeekOpen ? (
        <div
          role="presentation"
          className="apex-modal-overlay fixed inset-0 z-[66] flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setPlanWeekOpen(false)}
        >
          <div
            className="w-full max-w-lg max-h-[min(92dvh,44rem)] flex flex-col rounded-t-[12px] sm:rounded-[12px] apex-card sm:max-h-[85vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 p-5 pb-3 border-b border-white/[0.06]">
              <p className="apex-page-sub">Bulk edit</p>
              <h3 className="text-xl font-medium text-[#f4f4f5] tracking-tight mt-0.5">Plan this week</h3>
              <p className="mt-2 text-[12px] font-medium text-[#a0a0a8] leading-relaxed">
                Set workout names and exercises for every day at once. Save applies all changes together.
              </p>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-4 apex-tab-stack">
              {state.schedule.map((d, i) => {
                const row = weekBulkDraft[i]
                if (!row) return null
                const dt = parseDateKey(d.dateKey)
                const muscles = plannedMuscleGroups(
                  {
                    dateKey: d.dateKey,
                    workoutName: row.workoutName,
                    notes: row.notes,
                    plannedExerciseIds: row.plannedExerciseIds,
                  },
                  state.customExercises,
                )
                const dayExpanded = bulkDayOpenIdx === i
                const exercisesExpanded = bulkExercisesOpenIdx === i
                const planSummary = row.workoutName.trim() || 'Rest'
                return (
                  <div
                    key={d.dateKey}
                    className="apex-card !p-0 overflow-hidden"
                  >
                    <button
                      type="button"
                      className="w-full flex items-center justify-between gap-3 p-4 text-left transition-colors hover:bg-white/[0.03]"
                      onClick={() => {
                        setBulkDayOpenIdx(dayExpanded ? null : i)
                        setBulkExercisesOpenIdx(null)
                        setBulkSearch('')
                      }}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="apex-section-label">
                          {WEEKDAY_LABELS[i]} ·{' '}
                          {dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </p>
                        <p className="apex-section-title mt-1 truncate">{planSummary}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {muscles.length ? renderMuscleDots(muscles) : null}
                        <span className="text-[#a0a0a8] text-lg font-light" aria-hidden>
                          {dayExpanded ? '−' : '+'}
                        </span>
                      </div>
                    </button>
                    {dayExpanded ? (
                      <div className="border-t border-white/[0.06] p-4 space-y-3">
                    <label className="block">
                      <span className="apex-section-label block mb-1.5">Day plan</span>
                      <select
                        className="apex-input w-full min-h-11 px-3 text-[13px] font-medium"
                        value={bulkRowPlanSelectValue(
                          row,
                          state.hiddenExerciseIds,
                          state.customExercises,
                          state.templates,
                        )}
                        onChange={(e) => {
                          const v = e.target.value
                          setWeekBulkDraft((rows) =>
                            rows.map((r, j) => {
                              if (j !== i) return r
                              if (v === 'rest') return { ...r, workoutName: '', plannedExerciseIds: [] }
                              if (v === BULK_PLAN_CUSTOM) return r
                              if (v.startsWith('preset:')) {
                                const pid = v.slice('preset:'.length)
                                const p = PLAN_PRESETS.find((x) => x.id === pid)
                                if (!p) return r
                                const resolved = resolvePlannedExerciseIds(
                                  p.exerciseIds,
                                  state.hiddenExerciseIds,
                                  state.customExercises,
                                )
                                return { ...r, workoutName: p.title, plannedExerciseIds: resolved }
                              }
                              if (v.startsWith('template:')) {
                                const tid = v.slice('template:'.length)
                                const t = state.templates.find((x) => x.id === tid)
                                if (!t) return r
                                const resolved = resolvePlannedExerciseIds(
                                  t.exerciseIds,
                                  state.hiddenExerciseIds,
                                  state.customExercises,
                                )
                                return { ...r, workoutName: t.name, plannedExerciseIds: resolved }
                              }
                              return r
                            }),
                          )
                        }}
                      >
                        <option value="rest">Rest</option>
                        {PLAN_PRESETS.map((p) => (
                          <option key={p.id} value={`preset:${p.id}`}>
                            {p.title}
                          </option>
                        ))}
                        {state.templates.map((t) => (
                          <option key={t.id} value={`template:${t.id}`}>
                            {t.name} (template)
                          </option>
                        ))}
                        <option value={BULK_PLAN_CUSTOM}>Custom…</option>
                      </select>
                    </label>
                    <label className="block">
                      <span className="apex-section-label block mb-1.5">Workout name</span>
                      <input
                        className="apex-input w-full min-h-11 px-3"
                        value={row.workoutName}
                        onChange={(e) =>
                          setWeekBulkDraft((rows) =>
                            rows.map((r, j) => (j === i ? { ...r, workoutName: e.target.value } : r)),
                          )
                        }
                        placeholder="Rest"
                      />
                    </label>
                    <label className="block">
                      <span className="apex-section-label block mb-1.5">Training mode (optional)</span>
                      <select
                        className="apex-input w-full min-h-11 px-3 text-[13px] font-medium"
                        value={row.trainingMode ?? ''}
                        onChange={(e) => {
                          const v = e.target.value
                          setWeekBulkDraft((rows) =>
                            rows.map((r, j) =>
                              j === i ? { ...r, trainingMode: v ? (v as TrainingMode) : null } : r,
                            ),
                          )
                        }}
                      >
                        <option value="">None</option>
                        {TRAINING_MODES.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className="text-[12px] font-medium text-white/70"
                      onClick={() => {
                        setBulkExercisesOpenIdx(exercisesExpanded ? null : i)
                        setBulkSearch('')
                      }}
                    >
                      {exercisesExpanded
                        ? 'Hide exercises'
                        : `Exercises (${row.plannedExerciseIds.length}) — tap to edit`}
                    </button>
                    {exercisesExpanded ? (
                      <div className="rounded-[12px] border border-white/[0.06] p-3 space-y-2">
                        <input
                          className="apex-input w-full min-h-10 px-3 text-[13px]"
                          placeholder="Search library…"
                          value={bulkSearch}
                          onChange={(e) => setBulkSearch(e.target.value)}
                        />
                        <div className="max-h-32 overflow-y-auto rounded-[8px] border border-white/[0.06] divide-y divide-white/[0.05]">
                          {bulkPickList.map((e) => (
                            <button
                              key={e.id}
                              type="button"
                              className="w-full text-left px-3 py-2 text-[12px] font-medium text-[#e4e4e8] hover:bg-white/[0.05]"
                              onClick={() =>
                                setWeekBulkDraft((rows) =>
                                  rows.map((r, j) =>
                                    j === i && !r.plannedExerciseIds.includes(e.id)
                                      ? { ...r, plannedExerciseIds: [...r.plannedExerciseIds, e.id] }
                                      : r,
                                  ),
                                )
                              }
                            >
                              {e.name}{' '}
                              <span className="text-[#a0a0a8]">· {e.muscleGroup}</span>
                            </button>
                          ))}
                        </div>
                        {row.plannedExerciseIds.length ? (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {row.plannedExerciseIds.map((id) => {
                              const ex = resolveExerciseById(id)
                              if (!ex) return null
                              return (
                                <span
                                  key={id}
                                  className="inline-flex items-center gap-0.5 rounded-full border border-white/10 pl-2 pr-1 py-0.5 text-[10px] font-medium text-[#e0e0e4]"
                                >
                                  {ex.name}
                                  <button
                                    type="button"
                                    className="h-5 w-5 rounded-full text-[#a0a0a8] hover:bg-white/10"
                                    aria-label="Remove"
                                    onClick={() =>
                                      setWeekBulkDraft((rows) =>
                                        rows.map((r, j) =>
                                          j === i
                                            ? {
                                                ...r,
                                                plannedExerciseIds: r.plannedExerciseIds.filter((x) => x !== id),
                                              }
                                            : r,
                                        ),
                                      )
                                    }
                                  >
                                    ✕
                                  </button>
                                </span>
                              )
                            })}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    <label className="block">
                      <span className="apex-section-label block mb-1.5">Notes</span>
                      <textarea
                        className="apex-input w-full min-h-16 px-3 py-2 resize-y text-[13px]"
                        value={row.notes}
                        onChange={(e) =>
                          setWeekBulkDraft((rows) =>
                            rows.map((r, j) => (j === i ? { ...r, notes: e.target.value } : r)),
                          )
                        }
                      />
                    </label>
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
            <div className="shrink-0 flex gap-3 p-5 pt-3 border-t border-white/[0.06]">
              <button
                type="button"
                className="apex-btn min-h-12 flex-1 text-[14px] font-medium rounded-[8px]"
                onClick={() => setPlanWeekOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="apex-btn-primary min-h-12 flex-1 text-[14px] font-medium rounded-[8px]"
                onClick={savePlanWeek}
              >
                Save week
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
