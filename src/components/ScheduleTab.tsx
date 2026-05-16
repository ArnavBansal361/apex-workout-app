import { useCallback, useMemo, useState, type DragEvent } from 'react'
import { useWorkout } from '../context/WorkoutContext'
import { EXERCISE_BY_ID, EXERCISES } from '../data/exercises'
import { PLAN_PRESETS } from '../data/planPresets'
import { dateKey, formatShortWeekday, parseDateKey } from '../lib/dates'
import {
  isGoogleCalendarConfigured,
  isGoogleCalendarConnected,
  startGoogleCalendarOAuth,
  syncScheduleToGoogle,
  syncSingleScheduleDay,
} from '../lib/googleCalendar'
import type { Exercise, MuscleGroup, ScheduleDay } from '../types'

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
const DND_TYPE = 'application/x-apex-schedule-day'

/** Strong accent colors for dots, bars, and month cells (Chest = red, Back = blue, Legs = yellow). */
const MUSCLE_SCHEDULE_COLOR: Record<MuscleGroup, string> = {
  Chest: '#ef4444',
  Back: '#3b82f6',
  Legs: '#eab308',
  Shoulders: '#f97316',
  Arms: '#22c55e',
  Core: '#a855f7',
  Cardio: '#ec4899',
  Stretches: '#14b8a6',
}

const MUSCLE_TAG_STYLES: Record<MuscleGroup, string> = {
  Chest: 'bg-red-500/15 text-red-100/95 border border-red-500/25',
  Back: 'bg-blue-500/15 text-blue-100/95 border border-blue-500/25',
  Legs: 'bg-yellow-500/15 text-yellow-100/95 border border-yellow-500/30',
  Shoulders: 'bg-orange-500/15 text-orange-100/95 border border-orange-500/25',
  Arms: 'bg-emerald-500/15 text-emerald-100/95 border border-emerald-500/25',
  Core: 'bg-violet-500/15 text-violet-100/95 border border-violet-500/25',
  Cardio: 'bg-pink-500/15 text-pink-100/95 border border-pink-500/25',
  Stretches: 'bg-teal-500/15 text-teal-100/95 border border-teal-500/25',
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
}

export function ScheduleTab() {
  const {
    state,
    todayKey,
    updateScheduleDay,
    batchPatchSchedule,
    disconnectGoogleCalendar,
    notify,
    visibleExercises,
    resolveExerciseById,
  } = useWorkout()
  const accent = state.settings.accentColor
  const [viewMode, setViewMode] = useState<ViewMode>('week')
  const [calendarMonth, setCalendarMonth] = useState(() =>
    parseDateKey(state.schedule[0]?.dateKey ?? todayKey),
  )
  const [draftName, setDraftName] = useState('')
  const [draftNotes, setDraftNotes] = useState('')
  const [draftPlannedIds, setDraftPlannedIds] = useState<string[]>([])
  const [draftExSearch, setDraftExSearch] = useState('')
  const [calendarBusy, setCalendarBusy] = useState(false)
  const [dragOverKey, setDragOverKey] = useState<string | null>(null)
  const [planWeekOpen, setPlanWeekOpen] = useState(false)
  const [weekBulkDraft, setWeekBulkDraft] = useState<WeekBulkRow[]>([])
  const [bulkExpandIdx, setBulkExpandIdx] = useState<number | null>(null)
  const [bulkSearch, setBulkSearch] = useState('')
  const [editing, setEditing] = useState<string | null>(null)

  const scheduleKeys = useMemo(() => new Set(state.schedule.map((d) => d.dateKey)), [state.schedule])

  const jumpMonthToScheduleWeek = useCallback(() => {
    const k = state.schedule[0]?.dateKey
    if (k) setCalendarMonth(parseDateKey(k))
  }, [state.schedule])

  const configured = isGoogleCalendarConfigured()
  const connected = isGoogleCalendarConnected()

  const muscleBalance = useMemo(
    () => weeklyMuscleDayCounts(state.schedule, state.customExercises),
    [state.schedule, state.customExercises],
  )

  const monthLabel = useMemo(() => {
    return calendarMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  }, [calendarMonth])

  const monthGrid = useMemo(
    () => monthCellMatrix(calendarMonth.getFullYear(), calendarMonth.getMonth()),
    [calendarMonth],
  )

  const weekTitle = useMemo(() => {
    const first = state.schedule[0]?.dateKey
    if (!first) return 'This week'
    const d0 = parseDateKey(first)
    return d0.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  }, [state.schedule])

  function open(dk: string) {
    const day = state.schedule.find((s) => s.dateKey === dk)
    setDraftName(day?.workoutName ?? '')
    setDraftNotes(day?.notes ?? '')
    setDraftPlannedIds([...(day?.plannedExerciseIds ?? [])])
    setDraftExSearch('')
    setEditing(dk)
  }

  function openPlanWeek() {
    setWeekBulkDraft(
      state.schedule.map((d) => ({
        workoutName: d.workoutName,
        notes: d.notes,
        plannedExerciseIds: [...d.plannedExerciseIds],
      })),
    )
    setBulkExpandIdx(null)
    setBulkSearch('')
    setPlanWeekOpen(true)
  }

  function savePlanWeek() {
    const patches: { dateKey: string; patch: Partial<ScheduleDay> }[] = []
    state.schedule.forEach((d, i) => {
      const row = weekBulkDraft[i]
      if (!row) return
      const workoutName = row.workoutName.trim()
      const notes = row.notes.trim()
      const plannedExerciseIds = row.plannedExerciseIds
      if (
        workoutName === d.workoutName.trim() &&
        notes === d.notes.trim() &&
        JSON.stringify(plannedExerciseIds) === JSON.stringify(d.plannedExerciseIds)
      ) {
        return
      }
      patches.push({
        dateKey: d.dateKey,
        patch: { workoutName, notes, plannedExerciseIds },
      })
    })
    if (!patches.length) {
      notify('No changes to save')
      setPlanWeekOpen(false)
      return
    }
    batchPatchSchedule(patches)
    setPlanWeekOpen(false)
    notify('Week plan updated — tap Sync to Google if you use Calendar.')
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
    setDragOverKey(dateKeyVal)
  }

  function onDropDay(e: DragEvent, targetKey: string) {
    e.preventDefault()
    setDragOverKey(null)
    if (!scheduleKeys.has(targetKey)) return
    const sourceKey = e.dataTransfer.getData(DND_TYPE)
    if (!sourceKey) return
    swapScheduleDays(sourceKey, targetKey)
  }

  async function handleSyncWeek() {
    if (!configured) {
      notify('Add VITE_GOOGLE_CALENDAR_CLIENT_ID in .env to enable Calendar sync.')
      return
    }
    if (!connected) {
      notify('Connect Google Calendar first.')
      return
    }
    setCalendarBusy(true)
    try {
      const patches = await syncScheduleToGoogle(state, todayKey)
      batchPatchSchedule(patches)
      notify('Schedule synced to Google Calendar')
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Sync failed')
    } finally {
      setCalendarBusy(false)
    }
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
    }
    updateScheduleDay(dateKeyVal, {
      workoutName: merged.workoutName,
      notes: merged.notes,
      plannedExerciseIds: merged.plannedExerciseIds,
    })
    setEditing(null)

    if (!configured || !connected) return
    void (async () => {
      setCalendarBusy(true)
      try {
        const { patch } = await syncSingleScheduleDay(state, merged, todayKey)
        if (Object.keys(patch).length) {
          batchPatchSchedule([{ dateKey: dateKeyVal, patch }])
        }
      } catch (e) {
        notify(e instanceof Error ? e.message : 'Could not update Google Calendar')
      } finally {
        setCalendarBusy(false)
      }
    })()
  }

  async function handleConnect() {
    try {
      startGoogleCalendarOAuth()
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not start Google sign-in')
    }
  }

  const bulkPickList = useMemo(() => {
    if (bulkExpandIdx == null) return []
    const row = weekBulkDraft[bulkExpandIdx]
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
  }, [bulkExpandIdx, bulkSearch, visibleExercises, weekBulkDraft])

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
            style={{ backgroundColor: MUSCLE_SCHEDULE_COLOR[mg], boxShadow: `0 0 0 1px rgba(255,255,255,0.12)` }}
          />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-8 pb-32" style={{ ['--accent' as string]: accent }}>
      <header>
        <p className="apex-page-sub">Calendar</p>
        <h1 className="apex-page-title mt-1">Schedule</h1>
        <p className="mt-2 text-[13px] font-medium text-[#7c7c84] leading-relaxed">
          Plan the week, spot muscle balance, drag days to reshuffle. Sync optional to Google Calendar.
        </p>
      </header>

      <div className="apex-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="apex-section-label">Google Calendar</p>
            <p className="mt-2 text-[13px] font-medium leading-relaxed text-[#8b8b93]">
              {configured
                ? connected
                  ? 'Workout days sync as events on your primary calendar (9:00 local, 60 min).'
                  : 'Connect to create and update events when you save the schedule or tap Sync.'
                : 'Set VITE_GOOGLE_CALENDAR_CLIENT_ID in your environment to enable OAuth and sync.'}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            {connected ? (
              <button
                type="button"
                className="apex-btn min-h-10 px-4 text-[12px] font-semibold text-[#b4b4bc]"
                onClick={() => disconnectGoogleCalendar()}
                disabled={calendarBusy}
              >
                Disconnect
              </button>
            ) : (
              <button
                type="button"
                className="apex-btn-primary min-h-10 px-4 text-[12px] font-semibold disabled:opacity-50"
                style={{ backgroundColor: accent }}
                onClick={() => void handleConnect()}
                disabled={!configured || calendarBusy}
              >
                Connect
              </button>
            )}
            <button
              type="button"
              className="apex-btn min-h-10 px-4 text-[12px] font-semibold text-[#93c5fd] border-[#1e3a5f]/80 bg-[#0f1729]/80 disabled:opacity-50"
              onClick={() => void handleSyncWeek()}
              disabled={calendarBusy || !configured || !connected}
            >
              {calendarBusy ? 'Syncing…' : 'Sync to Google'}
            </button>
          </div>
        </div>
      </div>

      {/* Weekly muscle balance */}
      <section className="apex-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <p className="apex-section-label">This week · muscle balance</p>
            <p className="mt-1 text-[12px] font-medium text-[#6b6b73]">
              Days per group (from planned exercises). Wider bars = more exposure.
            </p>
          </div>
        </div>
        {muscleBalance.rows.length ? (
          <ul className="space-y-3">
            {muscleBalance.rows.map(({ group, days }) => (
              <li key={group} className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-[11px] font-bold uppercase tracking-wide text-[#9a9aa3]">
                  {group}
                </span>
                <div className="flex-1 min-w-0 h-2.5 rounded-full bg-white/[0.06] border border-white/[0.06] overflow-hidden">
                  <div
                    className="h-full rounded-full transition-[width] duration-300"
                    style={{
                      width: `${(days / muscleBalance.max) * 100}%`,
                      backgroundColor: MUSCLE_SCHEDULE_COLOR[group],
                      boxShadow: `0 0 12px color-mix(in srgb, ${MUSCLE_SCHEDULE_COLOR[group]} 45%, transparent)`,
                    }}
                  />
                </div>
                <span className="w-8 shrink-0 text-right text-[13px] font-bold tabular-nums text-[#e4e4e8]">
                  {days}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] font-medium text-[#5c5c64]">
            Add planned exercises to days below — balance bars fill in automatically.
          </p>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="inline-flex rounded-[14px] border border-white/[0.1] bg-black/30 p-1">
            <button
              type="button"
              className={`min-h-10 px-4 rounded-[11px] text-[12px] font-bold transition-all ${
                viewMode === 'week'
                  ? 'text-[#0a0a0c] shadow-md'
                  : 'text-[#9a9aa3] hover:text-[#d4d4dc]'
              }`}
              style={
                viewMode === 'week'
                  ? { backgroundColor: accent, boxShadow: `0 4px 14px color-mix(in srgb, ${accent} 35%, transparent)` }
                  : undefined
              }
              onClick={() => setViewMode('week')}
            >
              Week
            </button>
            <button
              type="button"
              className={`min-h-10 px-4 rounded-[11px] text-[12px] font-bold transition-all ${
                viewMode === 'month'
                  ? 'text-[#0a0a0c] shadow-md'
                  : 'text-[#9a9aa3] hover:text-[#d4d4dc]'
              }`}
              style={
                viewMode === 'month'
                  ? { backgroundColor: accent, boxShadow: `0 4px 14px color-mix(in srgb, ${accent} 35%, transparent)` }
                  : undefined
              }
              onClick={() => {
                setViewMode('month')
                jumpMonthToScheduleWeek()
              }}
            >
              Month
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="apex-btn-primary min-h-11 px-4 text-[13px] font-bold rounded-[14px]"
              style={{ backgroundColor: accent }}
              onClick={openPlanWeek}
            >
              Plan this week
            </button>
          </div>
        </div>

        {viewMode === 'week' ? (
          <>
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="apex-page-sub">Week view</p>
                <h2 className="text-xl font-bold text-[#f4f4f5] tracking-tight mt-0.5">{weekTitle}</h2>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1 sm:gap-1.5 mb-1 px-0.5">
              {WEEKDAY_LABELS.map((label) => (
                <div
                  key={label}
                  className="text-center text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.12em] text-[#5c5c64]"
                >
                  {label}
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-3">
              {state.schedule.map((d, idx) => {
                const isToday = d.dateKey === todayKey
                const dt = parseDateKey(d.dateKey)
                const title = d.workoutName.trim() || 'Rest'
                const dayNum = dt.getDate()
                const monthBit = d.dateKey.slice(5)
                const muscleTags = plannedMuscleGroups(d, state.customExercises)
                const primaryMuscle = muscleTags[0]
                const cellTint = primaryMuscle
                  ? `linear-gradient(135deg, color-mix(in srgb, ${MUSCLE_SCHEDULE_COLOR[primaryMuscle]} 12%, transparent) 0%, transparent 55%)`
                  : undefined
                const isDrop = dragOverKey === d.dateKey

                return (
                  <div
                    key={d.dateKey}
                    onDragOver={(e) => onDragOverDay(e, d.dateKey)}
                    onDragLeave={() => setDragOverKey((k) => (k === d.dateKey ? null : k))}
                    onDrop={(e) => onDropDay(e, d.dateKey)}
                    className={`group flex w-full gap-2 sm:gap-4 rounded-[18px] border text-left transition-all duration-200 touch-manipulation ${
                      isToday
                        ? 'apex-card-accent-left border-white/[0.08] p-3 sm:p-5 shadow-lg'
                        : 'apex-card border-white/[0.08] p-3 sm:p-5'
                    }`}
                    style={{
                      ...(cellTint ? { backgroundImage: cellTint } : {}),
                      ...(isDrop ? { boxShadow: `0 0 0 2px ${accent}, 0 0 24px color-mix(in srgb, ${accent} 25%, transparent)` } : {}),
                    }}
                  >
                    <div
                      draggable
                      onDragStart={(e) => onDragStartDay(e, d.dateKey)}
                      className="flex shrink-0 cursor-grab touch-none flex-col items-center justify-center rounded-xl border border-white/[0.08] bg-black/35 px-2 py-3 active:cursor-grabbing"
                      title="Drag to swap with another day"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span className="text-[14px] leading-none text-[#6b6b73] select-none" aria-hidden>
                        ⣿
                      </span>
                      <span className="mt-2 text-[9px] font-bold uppercase tracking-widest text-[#5c5c64]">
                        {WEEKDAY_LABELS[idx]?.slice(0, 1)}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="min-w-0 flex-1 flex gap-4 text-left rounded-[14px] -m-1 p-1"
                      onClick={() => open(d.dateKey)}
                    >
                      <div
                        className={`hidden sm:flex w-[4.25rem] shrink-0 flex-col items-center justify-center rounded-2xl border py-3 ${
                          isToday ? 'border-white/15 bg-black/25' : 'border-white/[0.07] bg-black/20'
                        }`}
                      >
                        <span className="text-[10px] font-bold uppercase tracking-widest text-[#6b6b73]">
                          {WEEKDAY_LABELS[idx] ?? formatShortWeekday(dt).slice(0, 3)}
                        </span>
                        <span className="mt-1 text-[1.75rem] font-black tabular-nums leading-none text-[#f4f4f5]">
                          {dayNum}
                        </span>
                        <span className="mt-1 text-[10px] font-semibold text-[#5c5c64] tabular-nums">{monthBit}</span>
                      </div>
                      <div className="min-w-0 flex-1 flex flex-col justify-center py-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          {hasPlannedWork(d) ? renderMuscleDots(muscleTags, 'md') : null}
                          <p className="text-[15px] font-bold text-[#f0f0f2] tracking-tight">{title}</p>
                          {isToday ? (
                            <span
                              className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#0a0a0c]"
                              style={{ backgroundColor: accent }}
                            >
                              Today
                            </span>
                          ) : null}
                          {d.googleCalendarEventId ? (
                            <span className="rounded-full border border-white/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[#7c9cff]">
                              Synced
                            </span>
                          ) : null}
                        </div>
                        {muscleTags.length ? (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {muscleTags.map((mg) => (
                              <span
                                key={mg}
                                className={`rounded-md px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${MUSCLE_TAG_STYLES[mg]}`}
                              >
                                {mg}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        {d.aiSummary?.trim() ? (
                          <p className="mt-2 text-[12px] font-medium text-[#7c7c84] leading-relaxed line-clamp-2">
                            {d.aiSummary}
                          </p>
                        ) : (
                          <p className="mt-2 text-[11px] font-medium text-[#5c5c64]">Tap to edit · drag handle to reschedule</p>
                        )}
                      </div>
                    </button>
                  </div>
                )
              })}
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 mb-2">
              <button
                type="button"
                className="apex-btn min-h-10 px-3 text-[13px] font-semibold rounded-[12px]"
                onClick={() =>
                  setCalendarMonth(
                    new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1),
                  )
                }
                aria-label="Previous month"
              >
                ‹
              </button>
              <h2 className="text-lg font-bold text-[#f4f4f5] tracking-tight text-center flex-1">{monthLabel}</h2>
              <button
                type="button"
                className="apex-btn min-h-10 px-3 text-[13px] font-semibold rounded-[12px]"
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
            <p className="text-[11px] font-medium text-[#5c5c64] mb-2">
              This app stores one training week. Days outside your current week are read-only. Drag between colored
              week days to swap plans.
            </p>
            <div className="grid grid-cols-7 gap-1 sm:gap-1.5 mb-2">
              {WEEKDAY_LABELS.map((label) => (
                <div
                  key={label}
                  className="text-center text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.12em] text-[#5c5c64] py-1"
                >
                  {label}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
              {monthGrid.flat().map(({ dateKey: dk, inMonth }) => {
                const sched = state.schedule.find((s) => s.dateKey === dk)
                const inWeek = Boolean(sched)
                const muscleTags = sched ? plannedMuscleGroups(sched, state.customExercises) : []
                const title = sched?.workoutName.trim() || ''
                const showRest = inWeek && !title
                const primaryMuscle = muscleTags[0]
                const isToday = dk === todayKey
                const isDrop = dragOverKey === dk && inWeek
                const dt = parseDateKey(dk)

                return (
                  <div
                    key={dk}
                    onDragOver={(e) => inWeek && onDragOverDay(e, dk)}
                    onDragLeave={() => setDragOverKey((k) => (k === dk ? null : k))}
                    onDrop={(e) => inWeek && onDropDay(e, dk)}
                    className={`min-h-[5.5rem] sm:min-h-[6.5rem] rounded-[14px] border p-1.5 sm:p-2 flex flex-col transition-all ${
                      !inMonth ? 'border-white/[0.04] bg-black/20 opacity-40' : 'border-white/[0.08] bg-black/25'
                    } ${inWeek ? 'ring-1 ring-white/[0.14]' : ''} ${isDrop ? 'ring-2' : ''}`}
                    style={{
                      ...(primaryMuscle && inWeek
                        ? {
                            background: `linear-gradient(160deg, color-mix(in srgb, ${MUSCLE_SCHEDULE_COLOR[primaryMuscle]} 18%, #121214) 0%, #0f0f12 100%)`,
                          }
                        : {}),
                      ...(isDrop ? { boxShadow: `0 0 0 2px ${accent}` } : {}),
                    }}
                  >
                    <div className="flex items-start justify-between gap-0.5">
                      <span
                        className={`text-[11px] sm:text-[12px] font-black tabular-nums leading-none ${
                          isToday ? 'text-[#f4f4f5]' : inMonth ? 'text-[#a1a1a8]' : 'text-[#5c5c64]'
                        }`}
                      >
                        {dt.getDate()}
                      </span>
                      {inWeek ? (
                        <div
                          draggable
                          onDragStart={(e) => onDragStartDay(e, dk)}
                          className="cursor-grab rounded-md p-0.5 text-[10px] text-[#6b6b73] hover:bg-white/10 active:cursor-grabbing"
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
                            <p className="text-[10px] sm:text-[11px] font-bold text-[#f0f0f2] leading-tight line-clamp-3">
                              {title || 'Rest'}
                            </p>
                          </>
                        ) : showRest ? (
                          <p className="text-[10px] font-medium text-[#5c5c64]">Rest</p>
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
        <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/88 backdrop-blur-sm p-4">
          <div className="w-full max-w-md apex-card p-6 shadow-2xl max-h-[min(92dvh,40rem)] overflow-y-auto">
            <p className="apex-page-sub">Edit day</p>
            <h3 className="text-xl font-bold text-[#f4f4f5] tracking-tight mt-1">
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
            <div className="mt-5">
              <span className="apex-section-label block mb-2">Quick presets</span>
              <p className="text-[12px] font-medium text-[#5c5c64] mb-3 leading-relaxed">
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
                      className="rounded-[12px] border border-white/[0.08] bg-black/25 px-3 py-3 text-left transition-colors hover:border-white/[0.14] hover:bg-white/[0.04] active:scale-[0.99]"
                      onClick={() => {
                        setDraftPlannedIds(resolved)
                        setDraftExSearch('')
                      }}
                    >
                      <p className="text-[14px] font-semibold text-[#f0f0f2] leading-snug">{p.title}</p>
                      <p className="mt-1 text-[11px] font-medium text-[#6b6b73] leading-snug line-clamp-2">
                        {p.subtitle}
                      </p>
                      <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#5c5c64]">
                        {resolved.length} exercise{resolved.length === 1 ? '' : 's'}
                      </p>
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="mt-5">
              <span className="apex-section-label block mb-2">My templates</span>
              <p className="text-[12px] font-medium text-[#5c5c64] mb-3 leading-relaxed">
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
                        className="rounded-[12px] border border-white/[0.08] bg-black/25 px-3 py-3 text-left transition-colors hover:border-white/[0.14] hover:bg-white/[0.04] active:scale-[0.99]"
                        onClick={() => {
                          setDraftPlannedIds(resolved)
                          setDraftExSearch('')
                        }}
                      >
                        <p className="text-[14px] font-semibold text-[#f0f0f2] leading-snug line-clamp-2">
                          {t.name}
                        </p>
                        <p className="mt-1 text-[11px] font-medium text-[#6b6b73]">
                          {resolved.length} exercise{resolved.length === 1 ? '' : 's'}
                        </p>
                      </button>
                    )
                  })}
                </div>
              ) : (
                <p className="text-[12px] font-medium text-[#5c5c64] leading-relaxed">
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
              <div className="mt-2 max-h-40 overflow-y-auto rounded-[12px] border border-white/[0.08] bg-black/20">
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
                      <span className="text-[13px] font-semibold text-[#ececee]">{e.name}</span>
                      <span className="ml-2 text-[11px] font-medium text-[#6b6b73]">{e.muscleGroup}</span>
                    </button>
                  ))
                ) : (
                  <p className="px-3 py-4 text-[12px] font-medium text-[#5c5c64]">
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
                        className="inline-flex items-center gap-1 rounded-full border border-white/[0.12] bg-black/35 pl-2.5 pr-1 py-1 text-[11px] font-semibold text-[#e4e4e8]"
                      >
                        {ex.name}
                        <button
                          type="button"
                          className="flex h-6 w-6 items-center justify-center rounded-full text-[#8b8b93] hover:bg-white/10 hover:text-[#ececee]"
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
                <p className="mt-2 text-[12px] font-medium text-[#5c5c64]">
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
                className="apex-btn min-h-12 flex-1 text-[14px] font-semibold"
                onClick={() => setEditing(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="apex-btn-primary min-h-12 flex-1 text-[14px] font-semibold"
                style={{ backgroundColor: accent }}
                onClick={save}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {planWeekOpen ? (
        <div className="fixed inset-0 z-[66] flex items-end sm:items-center justify-center bg-black/88 backdrop-blur-sm p-0 sm:p-4">
          <div className="w-full max-w-lg max-h-[min(92dvh,44rem)] flex flex-col rounded-t-[20px] sm:rounded-[20px] apex-card shadow-2xl sm:max-h-[85vh]">
            <div className="shrink-0 p-5 pb-3 border-b border-white/[0.06]">
              <p className="apex-page-sub">Bulk edit</p>
              <h3 className="text-xl font-bold text-[#f4f4f5] tracking-tight mt-0.5">Plan this week</h3>
              <p className="mt-2 text-[12px] font-medium text-[#6b6b73] leading-relaxed">
                Set workout names and exercises for every day at once. Save applies all changes together.
              </p>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
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
                const expanded = bulkExpandIdx === i
                return (
                  <div
                    key={d.dateKey}
                    className="rounded-[16px] border border-white/[0.08] bg-black/25 p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-wider text-[#6b6b73]">
                          {WEEKDAY_LABELS[i]} · {d.dateKey}
                        </p>
                        <p className="text-[12px] font-medium text-[#5c5c64] mt-0.5">
                          {dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </p>
                      </div>
                      {muscles.length ? renderMuscleDots(muscles) : null}
                    </div>
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
                    <div className="flex flex-wrap gap-2">
                      {PLAN_PRESETS.slice(0, 4).map((p) => {
                        const resolved = resolvePlannedExerciseIds(
                          p.exerciseIds,
                          state.hiddenExerciseIds,
                          state.customExercises,
                        )
                        return (
                          <button
                            key={p.id}
                            type="button"
                            className="rounded-full border border-white/[0.1] bg-white/[0.04] px-2.5 py-1 text-[10px] font-semibold text-[#c4c4cc] hover:bg-white/[0.08]"
                            onClick={() =>
                              setWeekBulkDraft((rows) =>
                                rows.map((r, j) => (j === i ? { ...r, plannedExerciseIds: resolved } : r)),
                              )
                            }
                          >
                            {p.title}
                          </button>
                        )
                      })}
                    </div>
                    <button
                      type="button"
                      className="text-[12px] font-semibold text-[#93c5fd]"
                      onClick={() => {
                        setBulkExpandIdx(expanded ? null : i)
                        setBulkSearch('')
                      }}
                    >
                      {expanded
                        ? 'Hide exercises'
                        : `Exercises (${row.plannedExerciseIds.length}) — tap to edit`}
                    </button>
                    {expanded ? (
                      <div className="rounded-[12px] border border-white/[0.06] bg-black/35 p-3 space-y-2">
                        <input
                          className="apex-input w-full min-h-10 px-3 text-[13px]"
                          placeholder="Search library…"
                          value={bulkSearch}
                          onChange={(e) => setBulkSearch(e.target.value)}
                        />
                        <div className="max-h-32 overflow-y-auto rounded-[10px] border border-white/[0.06] divide-y divide-white/[0.05]">
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
                              <span className="text-[#6b6b73]">· {e.muscleGroup}</span>
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
                                  className="inline-flex items-center gap-0.5 rounded-full border border-white/10 bg-black/40 pl-2 pr-1 py-0.5 text-[10px] font-semibold text-[#e0e0e4]"
                                >
                                  {ex.name}
                                  <button
                                    type="button"
                                    className="h-5 w-5 rounded-full text-[#8b8b93] hover:bg-white/10"
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
                )
              })}
            </div>
            <div className="shrink-0 flex gap-3 p-5 pt-3 border-t border-white/[0.06]">
              <button
                type="button"
                className="apex-btn min-h-12 flex-1 text-[14px] font-semibold rounded-[14px]"
                onClick={() => setPlanWeekOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="apex-btn-primary min-h-12 flex-1 text-[14px] font-semibold rounded-[14px]"
                style={{ backgroundColor: accent }}
                disabled={calendarBusy}
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
