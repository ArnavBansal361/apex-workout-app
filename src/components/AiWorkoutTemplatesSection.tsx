import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  generateAiWeeklyWorkoutTemplates,
  readCachedAiTemplates,
  templatesCacheKey,
  type AiWeeklyWorkoutTemplate,
  writeCachedAiTemplates,
} from '../lib/aiWorkoutTemplates'
import { useWorkout } from '../context/WorkoutContext'

const btnNeutral =
  'apex-btn min-h-11 px-3 text-[13px] font-medium touch-manipulation w-full'

type Props = {
  enabled: boolean
}

export function AiWorkoutTemplatesSection({ enabled }: Props) {
  const { state, applyAiWeeklyTemplate, resolveExerciseById } = useWorkout()
  const cacheKey = useMemo(() => templatesCacheKey(state), [state.scheduleWeekStart, state.setLogs.length])

  const [templates, setTemplates] = useState<AiWeeklyWorkoutTemplate[] | null>(() =>
    readCachedAiTemplates(cacheKey),
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const load = useCallback(
    async (force = false) => {
      if (!force) {
        const cached = readCachedAiTemplates(cacheKey)
        if (cached?.length) {
          setTemplates(cached)
          setError(null)
          return
        }
      }
      setLoading(true)
      setError(null)
      try {
        const next = await generateAiWeeklyWorkoutTemplates(state)
        setTemplates(next)
        writeCachedAiTemplates(cacheKey, next)
        setExpandedId(next[0]?.id ?? null)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not generate templates')
      } finally {
        setLoading(false)
      }
    },
    [cacheKey, state],
  )

  useEffect(() => {
    if (!enabled) return
    const cached = readCachedAiTemplates(cacheKey)
    if (cached?.length) {
      setTemplates(cached)
      return
    }
    void load(false)
  }, [enabled, cacheKey, load])

  if (!enabled) return null

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="apex-section-label">AI templates</p>
        <button
          type="button"
          className="text-[12px] font-medium text-[#a0a0a8] hover:text-[#ececee] touch-manipulation disabled:opacity-40"
          disabled={loading}
          onClick={() => void load(true)}
        >
          {loading ? 'Generating…' : 'Refresh'}
        </button>
      </div>
      <p className="text-[12px] font-medium text-[#a0a0a8] leading-snug">
        Personalized weekly splits from your history, PRs, and muscle balance. Tap one to apply to
        this week&apos;s schedule.
      </p>

      {error ? (
        <div className="rounded-[12px] border border-red-900/40 bg-red-950/20 px-4 py-3">
          <p className="text-[13px] font-medium text-red-300/90">{error}</p>
          <button
            type="button"
            className={`${btnNeutral} mt-3 min-h-10`}
            onClick={() => void load(true)}
          >
            Try again
          </button>
        </div>
      ) : null}

      {loading && !templates?.length ? (
        <p className="text-[13px] font-medium text-[#a0a0a8] py-4">Building your templates…</p>
      ) : null}

      {templates?.map((tpl) => {
        const open = expandedId === tpl.id
        const workoutDays = tpl.days.filter(
          (d) => d.exercises.length > 0 && !/^rest$/i.test(d.sessionName),
        )
        return (
          <div
            key={tpl.id}
            className="rounded-[12px] border border-white/[0.07] bg-white/[0.03] overflow-hidden"
          >
            <button
              type="button"
              className="w-full text-left p-4 touch-manipulation hover:bg-white/[0.04] active:bg-white/[0.06]"
              onClick={() => setExpandedId(open ? null : tpl.id)}
            >
              <p className="text-[15px] font-medium text-[#f0f0f2] leading-tight tracking-tight">
                {tpl.name}
              </p>
              {tpl.subtitle ? (
                <p className="text-[11px] text-[#8e8e96] mt-1.5 leading-snug font-medium">
                  {tpl.subtitle}
                </p>
              ) : null}
              <p className="text-[11px] text-[#7d7d88] mt-2 font-medium">
                {workoutDays.length} training day{workoutDays.length === 1 ? '' : 's'} ·{' '}
                {open ? 'Hide' : 'Show'} details
              </p>
            </button>

            {open ? (
              <div className="px-4 pb-4 space-y-3 border-t border-white/[0.06]">
                {tpl.days.map((day) => {
                  const label = day.weekday.charAt(0).toUpperCase() + day.weekday.slice(1, 3)
                  const isRest = /^rest$/i.test(day.sessionName) || day.exercises.length === 0
                  return (
                    <div key={`${tpl.id}-${day.weekday}`}>
                      <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-[#a0a0a8]">
                        {label} · {isRest ? 'Rest' : day.sessionName}
                      </p>
                      {isRest ? (
                        <p className="text-[12px] text-[#7d7d88] mt-1">Rest day</p>
                      ) : (
                        <ul className="mt-1.5 space-y-1">
                          {day.exercises.map((ex) => {
                            const meta = resolveExerciseById(ex.exerciseId)
                            return (
                              <li
                                key={`${day.weekday}-${ex.exerciseId}`}
                                className="text-[13px] font-medium text-[#c8c8ce] flex justify-between gap-2"
                              >
                                <span className="min-w-0 truncate">
                                  {meta?.name ?? ex.exerciseId}
                                </span>
                                <span className="shrink-0 tabular-nums text-[#a0a0a8]">
                                  {ex.sets}×{ex.reps}
                                </span>
                              </li>
                            )
                          })}
                        </ul>
                      )}
                    </div>
                  )
                })}
                <button
                  type="button"
                  className="apex-btn-primary w-full min-h-11 rounded-[8px] text-[13px] font-medium touch-manipulation"
                  onClick={() => applyAiWeeklyTemplate(tpl)}
                >
                  Apply to this week
                </button>
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
