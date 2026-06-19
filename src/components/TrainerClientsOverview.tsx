import { useEffect, useState } from 'react'
import { useWorkout } from '../context/WorkoutContext'
import {
  fetchTrainerClientSummaries,
  fetchAssignedWorkoutsForTrainer,
  fetchUserWorkoutStateForTrainer,
  type TrainerClientSummary,
} from '../lib/supabase'
import { filterClientStateForTrainer, formatLastActive } from '../lib/trainer'
import type { AppPersisted, AssignedWorkout } from '../types'
import { FITNESS_GOAL_OPTIONS } from '../types'
import { streakCurrent } from '../lib/achievements'

type ClientRow = TrainerClientSummary & {
  state: AppPersisted | null
  todayPlan: AssignedWorkout | null
  todayCheckin: { weightLbs: number | null; foodNote: string } | null
}

function CompliancePill({ done, assigned }: { done: boolean; assigned: boolean }) {
  if (!assigned) return <span className="text-[11px] text-[var(--apex-text-tertiary)]">—</span>
  return (
    <span
      className="rounded-full px-2.5 py-0.5 text-[11px] font-medium"
      style={done
        ? { background: 'rgba(74,222,128,0.12)', color: '#4ade80' }
        : { background: 'rgba(248,113,113,0.12)', color: '#f87171' }
      }
    >
      {done ? 'Done' : 'Not logged'}
    </span>
  )
}

export function TrainerClientsOverview({ onSelectClient }: { onSelectClient: (c: TrainerClientSummary) => void }) {
  const { userId } = useWorkout()
  const [rows, setRows] = useState<ClientRow[]>([])
  const [loading, setLoading] = useState(true)
  const today = new Date().toISOString().slice(0, 10)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void (async () => {
      const summaries = await fetchTrainerClientSummaries(userId)
      if (cancelled) return

      const enriched: ClientRow[] = await Promise.all(
        summaries.map(async (s) => {
          const [rawState, plans] = await Promise.all([
            fetchUserWorkoutStateForTrainer(s.connection.client_user_id),
            fetchAssignedWorkoutsForTrainer(userId, s.connection.client_user_id),
          ])
          const state = rawState ? filterClientStateForTrainer(rawState) : null
          const todayPlan = plans.find((p) => p.dateKey === today) ?? null
          const todayCheckin = state?.dailyCheckins?.find((c) => c.dateKey === today)
            ? { weightLbs: state.dailyCheckins.find((c) => c.dateKey === today)!.weightLbs, foodNote: state.dailyCheckins.find((c) => c.dateKey === today)!.foodNote }
            : null
          return { ...s, state, todayPlan, todayCheckin }
        })
      )
      if (!cancelled) {
        setRows(enriched)
        setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [userId, today])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <p className="text-[13px] text-[var(--apex-text-tertiary)]">Loading clients…</p>
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-2">
        <p className="text-[15px] font-medium text-[var(--apex-text-primary)]">No clients yet</p>
        <p className="text-[13px] text-[var(--apex-text-tertiary)]">Share your trainer code with clients to get started.</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-[0.5px] border-[var(--apex-border)]">
            {['Client', 'Goal', 'Weight', 'Today\'s check-in', 'Today\'s plan', 'Logged today', 'Streak', 'Last active'].map((h) => (
              <th key={h} className="pb-3 pr-6 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--apex-text-tertiary)] whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const s = row.state
            const latestWeight = s?.bodyweightLogs?.length
              ? [...s.bodyweightLogs].sort((a, b) => b.at - a.at)[0]
              : null
            const goalLabel = s?.settings.fitnessGoalType
              ? FITNESS_GOAL_OPTIONS.find((o) => o.id === s.settings.fitnessGoalType)?.label ?? '—'
              : '—'
            const streak = s ? streakCurrent(s) : 0
            const todayLogged = s
              ? s.setLogs.some((l) => new Date(l.at).toISOString().slice(0, 10) === today)
              : false

            return (
              <tr
                key={row.connection.id}
                className="border-b border-[0.5px] border-[var(--apex-border)] cursor-pointer hover:bg-[var(--apex-surface-card)] transition-colors"
                onClick={() => onSelectClient(row)}
              >
                <td className="py-4 pr-6">
                  <p className="text-[14px] font-medium text-[var(--apex-text-primary)]">{row.displayName}</p>
                </td>
                <td className="py-4 pr-6">
                  <p className="text-[13px] text-[var(--apex-text-secondary)]">{goalLabel}</p>
                </td>
                <td className="py-4 pr-6">
                  <p className="text-[13px] text-[var(--apex-text-secondary)] tabular-nums">
                    {latestWeight ? `${latestWeight.value} ${s?.settings.unit ?? 'lbs'}` : '—'}
                  </p>
                </td>
                <td className="py-4 pr-6 max-w-[180px]">
                  {row.todayCheckin ? (
                    <div>
                      {row.todayCheckin.weightLbs != null && (
                        <p className="text-[13px] font-medium text-[var(--apex-text-primary)] tabular-nums">{row.todayCheckin.weightLbs} {s?.settings.unit ?? 'lbs'}</p>
                      )}
                      {row.todayCheckin.foodNote && (
                        <p className="text-[12px] text-[var(--apex-text-tertiary)] truncate max-w-[160px]">{row.todayCheckin.foodNote}</p>
                      )}
                    </div>
                  ) : (
                    <p className="text-[13px] text-[var(--apex-text-tertiary)]">—</p>
                  )}
                </td>
                <td className="py-4 pr-6">
                  <p className="text-[13px] text-[var(--apex-text-secondary)]">
                    {row.todayPlan ? (row.todayPlan.title || `${row.todayPlan.exercises.length} exercises`) : '—'}
                  </p>
                </td>
                <td className="py-4 pr-6">
                  <CompliancePill done={todayLogged} assigned={!!row.todayPlan} />
                </td>
                <td className="py-4 pr-6">
                  <p className="text-[13px] text-[var(--apex-text-secondary)] tabular-nums">{streak > 0 ? `${streak}d` : '—'}</p>
                </td>
                <td className="py-4">
                  <p className="text-[13px] text-[var(--apex-text-tertiary)]">{formatLastActive(row.lastActiveMs)}</p>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
