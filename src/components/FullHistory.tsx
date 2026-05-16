import { useMemo, useState } from 'react'
import { useWorkout } from '../context/WorkoutContext'
import { exportLogsCsvFromLogs, filterLogs } from '../lib/csv'
import { dateKey } from '../lib/dates'
import { ApexLogo } from './ApexLogo'
import { ConfirmDialog } from './ConfirmDialog'
import { EditSetLogModal } from './EditSetLogModal'
import type { SetLog } from '../types'

type Props = { onClose: () => void }

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
  const { state, deleteSetLog, updateSetLog, notify, visibleExercises } = useWorkout()
  const accent = state.settings.accentColor
  const [exerciseId, setExerciseId] = useState<string>('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [editLog, setEditLog] = useState<SetLog | null>(null)

  const filtered = useMemo(
    () =>
      filterLogs(
        state.setLogs,
        exerciseId || null,
        from || null,
        to || null,
      ).sort((a, b) => b.at - a.at),
    [state.setLogs, exerciseId, from, to],
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

  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-[#0c0c0c]">
      <header className="px-4 py-3 border-b border-[#1e1e1e] space-y-3">
        <div className="flex items-center justify-between gap-2">
          <ApexLogo accent={accent} />
          <button
            type="button"
            className="min-h-11 min-w-11 rounded-[12px] border border-[#1e1e1e] bg-[#161616] text-[13px] text-[#e0e0e0]"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <p className="text-[13px] font-normal text-[#555]">Full history</p>
        <select
          className="w-full min-h-12 rounded-[12px] border border-[#1e1e1e] bg-[#161616] px-3 text-[13px] font-normal text-[#e0e0e0]"
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
        <div className="flex gap-2">
          <input
            type="date"
            className="min-h-12 flex-1 rounded-[12px] border border-[#1e1e1e] bg-[#161616] px-2 text-[13px] text-[#e0e0e0]"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
          <input
            type="date"
            className="min-h-12 flex-1 rounded-[12px] border border-[#1e1e1e] bg-[#161616] px-2 text-[13px] text-[#e0e0e0]"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        <button
          type="button"
          className="w-full min-h-12 rounded-[12px] border border-[#1e1e1e] bg-[#161616] text-[13px] font-normal text-[#e0e0e0]"
          onClick={() => downloadText('history-filtered.csv', exportLogsCsvFromLogs(filtered))}
        >
          Export CSV (filtered)
        </button>
      </header>
      <div className="flex-1 overflow-y-auto p-4 space-y-6 pb-24">
        {grouped.map(([day, logs]) => (
          <section key={day}>
            <h2 className="apex-section-label mb-2">{day}</h2>
            <ul className="space-y-2">
              {logs.map((l) => (
                <li key={l.id} className="apex-card p-3">
                  <div className="flex justify-between gap-2">
                    <p className="text-[13px] font-normal text-[#bbb]">{l.exerciseName}</p>
                    {l.isPr ? (
                      <span
                        className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium text-[#0c0c0c]"
                        style={{ backgroundColor: accent }}
                      >
                        PR
                      </span>
                    ) : null}
                  </div>
                  <p className="text-[13px] font-normal text-[#bbb] mt-1">
                    {l.kind === 'weighted'
                      ? `${l.bodyweight ? 'BW' : `${l.weight ?? 0} ${state.settings.unit}`} × ${l.reps} · ${l.sets} sets`
                      : `${l.durationSec}s`}
                  </p>
                  {l.note ? <p className="text-[12px] text-[#555] mt-1">{l.note}</p> : null}
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#1e1e1e] pt-3">
                    <p className="apex-section-label opacity-80">
                      {new Date(l.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                    <div className="flex gap-2 shrink-0">
                      <button
                        type="button"
                        className="min-h-9 rounded-[12px] px-3 text-[12px] font-medium text-[#0c0c0c]"
                        style={{ backgroundColor: accent }}
                        onClick={() => setEditLog(l)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="min-h-9 rounded-[12px] border border-red-900/50 bg-[#121212] px-3 text-[12px] font-normal text-red-500"
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
          <p className="text-[13px] font-normal text-[#555]">No sets match these filters.</p>
        ) : null}
      </div>

      <EditSetLogModal
        open={!!editLog}
        log={editLog}
        accent={accent}
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
        accent={accent}
        destructive
        onCancel={() => setConfirmId(null)}
        onConfirm={() => {
          if (confirmId) deleteSetLog(confirmId)
          setConfirmId(null)
        }}
      />
    </div>
  )
}
