import { useMemo, useState } from 'react'
import { useWorkout } from '../context/WorkoutContext'
import { exportLogsCsvFromLogs, filterLogs } from '../lib/csv'
import { dateKey, parseDateKey } from '../lib/dates'
import { ApexLogo } from './ApexLogo'
import { ConfirmDialog } from './ConfirmDialog'
import { EditSetLogModal } from './EditSetLogModal'
import type { SetLog } from '../types'

type Props = { onClose: () => void }

/** Matches app cards via theme tokens */
const historyCard =
  'rounded-[12px] border-[0.5px] bg-[var(--apex-surface-card)] [border-color:var(--apex-border)]'
const historyField = `${historyCard} w-full min-h-12 px-3 py-2.5 text-[13px] font-normal text-[color:var(--apex-text-primary)] [color-scheme:light]`
const historyGhostBtn =
  'rounded-[8px] border border-[rgba(255,255,255,0.15)] bg-transparent text-[#e0e0e0]'
const historyEditBtn =
  'min-h-9 px-3 text-[12px] font-medium rounded-[8px] border border-[rgba(255,255,255,0.12)] bg-transparent text-[#e0e0e0]'

function formatHistoryDayLabel(dayKey: string): string {
  return parseDateKey(dayKey).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function FullHistory({ onClose }: Props) {
  const { state, deleteSetLog, deleteCardio, deleteBodyweight, updateSetLog, notify, visibleExercises } =
    useWorkout()
  const [exerciseId, setExerciseId] = useState<string>('')
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [confirmClearAll, setConfirmClearAll] = useState(false)
  const [editLog, setEditLog] = useState<SetLog | null>(null)

  const filtered = useMemo(
    () =>
      filterLogs(state.setLogs, exerciseId || null, null, null).sort((a, b) => b.at - a.at),
    [state.setLogs, exerciseId],
  )

  const grouped = useMemo(() => {
    const m = new Map<string, typeof filtered>()
    for (const l of filtered) {
      const k = dateKey(new Date(l.at))
      const arr = m.get(k) ?? []
      arr.push(l)
      m.set(k, arr)
    }
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
  }, [filtered])

  function clearAllHistory() {
    const setIds = state.setLogs.map((l) => l.id)
    const cardioIds = state.cardioEntries.map((c) => c.id)
    const bodyweightIds = state.bodyweightLogs.map((b) => b.id)
    for (const id of setIds) deleteSetLog(id)
    for (const id of cardioIds) deleteCardio(id)
    for (const id of bodyweightIds) deleteBodyweight(id)
    const total = setIds.length + cardioIds.length + bodyweightIds.length
    notify(total ? 'Workout history cleared' : 'No history to clear')
  }

  return (
    <div className="apex-safe-top apex-theme-shell fixed inset-0 z-[90] flex flex-col bg-[var(--apex-surface-page)]">
      <header className="px-4 py-3 border-b border-[rgba(255,255,255,0.08)] shrink-0">
        <div className="flex items-center justify-between gap-2 mb-3">
          <ApexLogo size={48} />
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={`${historyGhostBtn} min-h-11 px-3 text-[12px] font-medium`}
              onClick={() => setConfirmClearAll(true)}
            >
              Clear all history
            </button>
            <button
              type="button"
              className={`${historyCard} min-h-11 min-w-11 px-0 flex items-center justify-center text-[13px] font-normal text-[#e0e0e0]`}
              onClick={onClose}
            >
              ✕
            </button>
          </div>
        </div>
        <p className="text-[15px] font-medium text-[#ececee] mb-3">Full history</p>
        <div className={`${historyCard} p-4 space-y-3`}>
          <select
            className={historyField}
            value={exerciseId}
            onChange={(e) => setExerciseId(e.target.value)}
          >
            <option value="">All exercises</option>
            {visibleExercises.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={`${historyGhostBtn} w-full min-h-12 text-[13px] font-medium`}
            onClick={() => downloadText('history-filtered.csv', exportLogsCsvFromLogs(filtered))}
          >
            Export CSV (filtered)
          </button>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto p-4 space-y-6 pb-24">
        {grouped.map(([day, logs]) => (
          <section key={day}>
            <h2 className="apex-section-label mb-2">{formatHistoryDayLabel(day)}</h2>
            <ul className="space-y-2">
              {logs.map((l) => (
                <li key={l.id} className={`${historyCard} p-4`}>
                  <div className="flex justify-between gap-2">
                    <p className="text-[13px] font-medium text-[#e0e0e0]">{l.exerciseName}</p>
                    {l.isPr ? (
                      <span
                        className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-black"
                      >
                        PR
                      </span>
                    ) : null}
                  </div>
                  <p className="text-[13px] font-normal text-[#a0a0a8] mt-1">
                    {l.kind === 'weighted'
                      ? `${l.bodyweight ? 'BW' : `${l.weight ?? 0} ${state.settings.unit}`} × ${l.reps} · ${l.sets} sets`
                      : `${l.durationSec}s`}
                  </p>
                  {l.note ? (
                    <p className="text-[12px] font-normal text-[#a0a0a8] mt-1">{l.note}</p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[rgba(255,255,255,0.08)] pt-3">
                    <p className="apex-section-label">
                      {new Date(l.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                    <div className="flex gap-2 shrink-0">
                      <button
                        type="button"
                        className={historyEditBtn}
                        onClick={() => setEditLog(l)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="min-h-9 px-3 text-[12px] font-normal bg-transparent text-[rgba(255,255,255,0.4)]"
                        onClick={() => setConfirmId(l.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {filtered.length === 0 ? (
          <p className="text-[13px] font-normal text-[#a0a0a8]">No sets match these filters.</p>
        ) : null}
      </div>

      <EditSetLogModal
        open={!!editLog}
        log={editLog}
        unit={state.settings.unit}
        onClose={() => setEditLog(null)}
        onSave={(logId, payload) => {
          try {
            updateSetLog(logId, payload)
          } catch (e) {
            notify(e instanceof Error ? e.message : 'Could not update set')
            throw e
          }
        }}
      />

      <ConfirmDialog
        open={!!confirmId}
        title="Delete set?"
        message="This removes the log permanently."
        confirmLabel="Delete"
        destructive
        onCancel={() => setConfirmId(null)}
        onConfirm={() => {
          if (confirmId) deleteSetLog(confirmId)
          setConfirmId(null)
        }}
      />

      <ConfirmDialog
        open={confirmClearAll}
        title="Clear all history?"
        message="This permanently deletes your entire workout history and cannot be undone."
        confirmLabel="Clear all"
        destructive
        onCancel={() => setConfirmClearAll(false)}
        onConfirm={() => {
          setConfirmClearAll(false)
          clearAllHistory()
        }}
      />
    </div>
  )
}
