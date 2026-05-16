import { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useWorkout } from '../context/WorkoutContext'
import {
  muscleGroupsThisWeek,
  minutesThisWeek,
  sessionsThisWeek,
  setsThisWeek,
  streakCurrent,
} from '../lib/achievements'
import { computePersonalRecords } from '../lib/personalRecords'
import { getLevelInfo } from '../lib/xpLevel'
import { exportFullDataCsv } from '../lib/csv'
import {
  claudeCoachComplete,
  claudeParseImport,
  dailyCoachSuggestions,
} from '../lib/anthropicCoach'
import { normalizeImportedCardio, sanitizeCoachBubbleText } from '../lib/persist'
import { bodyweightSeries, weeklyVolumeSeries } from '../lib/stats'
import type { AppPersisted, SetLog, ChatMessage } from '../types'
import { ConfirmDialog } from './ConfirmDialog'
import { PROFILE_AVATAR_IDS, ProfileAvatarGlyph } from './ProfileAvatarIcons'
type Sub = 'stats' | 'settings' | 'ai'

type Props = { onOpenAchievements: () => void }

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function ensureSetLogIds(logs: SetLog[]): SetLog[] {
  return logs.map((l) => {
    const row = l as SetLog & { id?: string }
    return row.id ? row : { ...row, id: crypto.randomUUID() }
  })
}

function sanitizeMerge(raw: unknown): Partial<AppPersisted> {
  if (!raw || typeof raw !== 'object') return {}
  const o = raw as Record<string, unknown>
  const out: Partial<AppPersisted> = {}
  if (Array.isArray(o.setLogs)) {
    const logs = o.setLogs.filter(Boolean) as SetLog[]
    out.setLogs = ensureSetLogIds(logs)
  }
  if (Array.isArray(o.bodyweightLogs)) {
    const bw = o.bodyweightLogs as AppPersisted['bodyweightLogs']
    out.bodyweightLogs = bw.map((b) =>
      b.id ? b : { ...b, id: crypto.randomUUID() },
    )
  }
  if (Array.isArray(o.cardioEntries) && o.cardioEntries.length) {
    out.cardioEntries = normalizeImportedCardio(o.cardioEntries)
  }
  if (Array.isArray(o.schedule) && o.schedule.length) {
    out.schedule = (o.schedule as AppPersisted['schedule']).map((d) => ({
      ...d,
      plannedExerciseIds: d.plannedExerciseIds ?? [],
    }))
  }
  return out
}

const inp = 'apex-input w-full min-h-12 px-3 py-2.5'

export function ProfileTab({ onOpenAchievements }: Props) {
  const {
    state,
    todayKey,
    updateSettings,
    mergeImport,
    pushChat,
    notify,
    addFriend,
    removeFriend,
    setFriendWeeklySets,
    addBodyweight,
  } = useWorkout()
  const accent = state.settings.accentColor
  const [sub, setSub] = useState<Sub>('stats')
  const [chatInput, setChatInput] = useState('')
  const [importText, setImportText] = useState('')
  const [importPreview, setImportPreview] = useState<Partial<AppPersisted> | null>(null)
  const [busy, setBusy] = useState(false)
  const [friendUser, setFriendUser] = useState('')
  const [friendSetsIn, setFriendSetsIn] = useState('')
  const [confirmFriendId, setConfirmFriendId] = useState<string | null>(null)
  const [bwInput, setBwInput] = useState('')
  const vol = useMemo(() => weeklyVolumeSeries(state), [state])
  const bw = useMemo(() => bodyweightSeries(state), [state])
  const lastBodyweight = useMemo(() => {
    const sorted = [...state.bodyweightLogs].sort((a, b) => b.at - a.at)
    return sorted[0] ?? null
  }, [state.bodyweightLogs])

  const profileInitials = useMemo(() => {
    const n = state.settings.displayName.trim()
    if (!n) return 'AX'
    const parts = n.split(/\s+/).filter(Boolean)
    if (parts.length >= 2) {
      return `${parts[0]!.slice(0, 1)}${parts[parts.length - 1]!.slice(0, 1)}`.toUpperCase()
    }
    return n.slice(0, 2).toUpperCase()
  }, [state.settings.displayName])

  const leaderboardRows = useMemo(() => {
    const mySets = setsThisWeek(state)
    const myName = state.settings.displayName.trim() || 'You'
    const rows = [
      { id: 'me' as const, name: myName, sets: mySets },
      ...state.friends.map((f) => ({ id: f.id as string, name: f.username, sets: f.weeklySets })),
    ]
    return [...rows].sort((a, b) => b.sets - a.sets).map((r, i) => ({ ...r, rank: i + 1 }))
  }, [state])

  const levelInfo = useMemo(() => getLevelInfo(state.lifetimeXp ?? 0), [state.lifetimeXp])
  const prRows = useMemo(
    () => computePersonalRecords(state.setLogs, state.settings.unit),
    [state.setLogs, state.settings.unit],
  )
  const streakDays = useMemo(() => streakCurrent(state), [state])

  const coachSuggestions = useMemo(() => dailyCoachSuggestions(todayKey), [todayKey])

  async function runCoachTurn(userText: string) {
    const msg = userText.trim()
    if (!msg || busy) return
    const pending: ChatMessage = {
      id: 'pending-user',
      role: 'user',
      text: msg,
      at: 0,
    }
    const historyForApi = [...state.chatMessages, pending]
    pushChat('user', msg)
    setBusy(true)
    try {
      const reply = await claudeCoachComplete(state, historyForApi)
      pushChat('model', reply)
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Coach error')
    } finally {
      setBusy(false)
    }
  }

  async function sendCoach() {
    if (!chatInput.trim()) return
    const msg = chatInput.trim()
    setChatInput('')
    await runCoachTurn(msg)
  }

  async function runParseImport() {
    if (!importText.trim()) {
      notify('Paste workout notes first')
      return
    }
    setBusy(true)
    try {
      const raw = await claudeParseImport(state, importText)
      const partial = sanitizeMerge(raw)
      if (
        !partial.setLogs?.length &&
        !partial.cardioEntries?.length &&
        !partial.bodyweightLogs?.length &&
        !partial.schedule
      ) {
        notify('No entries found — try different wording')
        return
      }
      setImportPreview(partial)
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Parse failed')
    } finally {
      setBusy(false)
    }
  }

  function confirmImportMerge() {
    if (!importPreview) return
    mergeImport(importPreview)
    setImportPreview(null)
    setImportText('')
  }

  return (
    <div className="space-y-6 pb-32" style={{ ['--accent' as string]: accent }}>
      <section className="apex-card p-6">
        <div className="flex items-center gap-4">
          <div
            className="flex h-[4.5rem] w-[4.5rem] shrink-0 items-center justify-center rounded-2xl shadow-lg border-[3px] border-solid"
            style={{
              borderColor: levelInfo.ringColor,
              background: state.settings.profileAvatarId
                ? `linear-gradient(145deg, color-mix(in srgb, ${levelInfo.ringColor} 30%, #121214), #141418)`
                : `linear-gradient(145deg, ${accent}, color-mix(in srgb, ${accent} 42%, #0f0f12))`,
              boxShadow: `0 12px 32px color-mix(in srgb, ${levelInfo.ringColor} 34%, transparent)`,
            }}
          >
            {state.settings.profileAvatarId ? (
              <ProfileAvatarGlyph id={state.settings.profileAvatarId} className="h-9 w-9 text-[#0a0a0c]" />
            ) : (
              <span className="text-[1.125rem] font-black tracking-tight text-[#0a0a0c]">
                {profileInitials}
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="apex-page-sub">Profile</p>
            <h1 className="text-[1.375rem] font-bold text-[#f4f4f5] tracking-tight leading-tight truncate">
              {state.settings.displayName.trim() || 'Apex Athlete'}
            </h1>
            <p className="mt-1.5 text-[13px] font-medium text-[#7c7c84] leading-relaxed line-clamp-2">
              {state.settings.fitnessGoals.trim() || 'Train consistently — stats update as you log work.'}
            </p>
          </div>
        </div>

        <div className="mt-5 rounded-[14px] border border-white/[0.08] bg-black/22 px-4 py-3.5">
          <div className="flex items-center justify-between gap-2 mb-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#9a9aa3]">Level & XP</p>
            <p className="text-[12px] font-bold text-[#ececee] tabular-nums">{state.lifetimeXp ?? 0} XP</p>
          </div>
          <p className="text-[15px] font-bold text-[#f4f4f5]">{levelInfo.label}</p>
          <div className="mt-2 h-2 rounded-full bg-[#1a1a1e] overflow-hidden border border-white/[0.05]">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.round(levelInfo.progressInTier * 100)}%`,
                backgroundColor: levelInfo.ringColor,
              }}
            />
          </div>
          <p className="mt-1.5 text-[11px] font-medium text-[#6b6b73]">
            {levelInfo.nextThreshold != null
              ? `${Math.max(0, levelInfo.nextThreshold - (state.lifetimeXp ?? 0))} XP until next level`
              : 'Elite tier — keep stacking XP'}
          </p>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <div className="apex-metric-card p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#6b6b73]">Sessions</p>
            <p className="apex-stat-num mt-2 tabular-nums">{sessionsThisWeek(state)}</p>
            <p className="text-[11px] font-semibold text-[#5c5c64] mt-1">This week</p>
          </div>
          <div className="apex-metric-card p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#6b6b73]">Sets</p>
            <p className="apex-stat-num mt-2 tabular-nums">{setsThisWeek(state)}</p>
            <p className="text-[11px] font-semibold text-[#5c5c64] mt-1">This week</p>
          </div>
          <div className="apex-metric-card p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#6b6b73]">Minutes</p>
            <p className="apex-stat-num mt-2 tabular-nums">{minutesThisWeek(state)}</p>
            <p className="text-[11px] font-semibold text-[#5c5c64] mt-1">Cardio · week</p>
          </div>
          <div className="apex-metric-card apex-metric-card-accent p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#6b6b73]">Streak</p>
            <p className="apex-stat-num mt-2 flex items-center justify-center gap-1 tabular-nums">
              {streakDays >= 3 ? (
                <span className="apex-streak-fire text-base leading-none" aria-hidden>
                  🔥
                </span>
              ) : null}
              <span>{streakDays}d</span>
            </p>
            <p className="text-[11px] font-semibold text-[#5c5c64] mt-1">Keep it going</p>
          </div>
        </div>
      </section>

      <div
        className="flex rounded-[16px] p-1.5 border border-white/[0.08] relative overflow-hidden"
        style={{
          background: 'linear-gradient(180deg, rgba(30,30,36,0.9) 0%, rgba(14,14,18,0.98) 100%)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
        }}
      >
        {(
          [
            ['stats', 'Stats'],
            ['settings', 'Settings'],
            ['ai', 'AI Coach'],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            className={`relative min-h-12 flex-1 rounded-[12px] text-[13px] font-semibold transition-all duration-200 active:scale-[0.98] ${
              sub === k ? 'text-[#0a0a0c] shadow-md' : 'text-[#8b8b93] hover:text-[#c8c8ce]'
            }`}
            style={
              sub === k
                ? {
                    backgroundColor: accent,
                    boxShadow: `0 6px 20px color-mix(in srgb, ${accent} 40%, transparent)`,
                  }
                : undefined
            }
            onClick={() => setSub(k)}
          >
            {label}
          </button>
        ))}
      </div>

      <button
        type="button"
        className="apex-btn w-full min-h-12 text-[14px] font-semibold border-white/[0.1]"
        onClick={onOpenAchievements}
      >
        Achievements
      </button>

      {sub === 'stats' ? (
        <div className="space-y-5">
          <div className="apex-card p-5">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#9a9aa3] mb-2">Muscle groups</p>
            <p className="text-[15px] font-semibold text-[#ececee] leading-relaxed">
              {muscleGroupsThisWeek(state).length
                ? muscleGroupsThisWeek(state).join(', ')
                : 'None yet'}
            </p>
            <p className="text-[12px] font-medium text-[#6b6b73] mt-2">Hit this week</p>
          </div>
          <div className="apex-card p-5">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <p className="apex-section-label">Personal records</p>
              <span className="rounded-md border border-amber-500/35 bg-amber-500/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-amber-100/95">
                PR
              </span>
            </div>
            <p className="text-[12px] font-medium text-[#6b6b73] mb-3 leading-relaxed">
              Best logged performance per exercise (max weight, bodyweight reps, or timed hold).
            </p>
            {prRows.length ? (
              <ul className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {prRows.slice(0, 24).map((r) => (
                  <li
                    key={r.exerciseId}
                    className="flex items-center justify-between gap-2 rounded-[12px] border border-white/[0.06] bg-black/20 px-3 py-2.5"
                  >
                    <span className="min-w-0 truncate text-[13px] font-semibold text-[#ececee]">
                      {r.exerciseName}
                    </span>
                    <span className="shrink-0 rounded-lg border border-amber-500/30 bg-amber-500/12 px-2 py-0.5 text-[11px] font-bold text-amber-100/95 tabular-nums">
                      {r.detail}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] font-medium text-[#6b6b73]">Log sets to build your PR board.</p>
            )}
          </div>
          <div className="apex-card p-5">
            <p className="apex-section-label mb-1">Weekly leaderboard</p>
            <p className="text-[13px] font-medium text-[#8b8b93] mb-5 leading-relaxed">
              Add friends by username and their weekly set count to rank together (local only).
            </p>
            <div className="flex flex-wrap gap-2 mb-4">
              <input
                className={`min-h-11 flex-1 min-w-[8rem] ${inp}`}
                placeholder="Username"
                value={friendUser}
                onChange={(e) => setFriendUser(e.target.value)}
              />
              <input
                inputMode="numeric"
                className={`min-h-11 w-20 ${inp} text-center px-2`}
                placeholder="Sets"
                value={friendSetsIn}
                onChange={(e) => setFriendSetsIn(e.target.value)}
              />
              <button
                type="button"
                className="apex-btn min-h-11 shrink-0 px-5 text-[13px] font-semibold"
                onClick={() => {
                  addFriend(friendUser, Number(friendSetsIn) || 0)
                  setFriendUser('')
                  setFriendSetsIn('')
                }}
              >
                Add
              </button>
            </div>
            <ul className="space-y-2">
              {leaderboardRows.map((row) => (
                <li
                  key={row.id}
                  className={`flex items-center justify-between rounded-[14px] border px-4 py-3.5 border-white/[0.08] transition-colors hover:border-white/[0.12] ${
                    row.id === 'me' ? 'bg-black/25' : 'bg-black/15'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-[13px] font-normal text-[#bdbdbd] tabular-nums w-8 shrink-0">
                      #{row.rank}
                    </span>
                    <span className="truncate text-[13px] font-normal text-[#e0e0e0]">
                      {row.name}
                      {row.id === 'me' ? (
                        <span className="ml-2 text-[10px] uppercase tracking-[0.5px] text-[#bdbdbd]">
                          You
                        </span>
                      ) : null}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {row.id !== 'me' ? (
                      <input
                        inputMode="numeric"
                        className={`w-14 min-h-9 ${inp} text-center px-2 py-1 text-[13px]`}
                        value={String(row.sets)}
                        onChange={(e) =>
                          setFriendWeeklySets(row.id, Number(e.target.value) || 0)
                        }
                      />
                    ) : (
                      <span className="apex-stat-num tabular-nums">{row.sets}</span>
                    )}
                    {row.id !== 'me' ? (
                      <button
                        type="button"
                        className="text-[12px] font-normal text-red-500 px-1"
                        onClick={() => setConfirmFriendId(row.id)}
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="apex-card p-5 space-y-4">
            <p className="apex-section-label">Log bodyweight</p>
            {lastBodyweight ? (
              <p className="text-[13px] font-normal text-[#e0e0e0]">
                Last entry:{' '}
                <span className="tabular-nums">
                  {lastBodyweight.value} {state.settings.unit}
                </span>
                <span className="text-[#bdbdbd] text-[12px] ml-2">
                  {new Date(lastBodyweight.at).toLocaleDateString()}
                </span>
              </p>
            ) : (
              <p className="text-[13px] font-normal text-[#bdbdbd]">No bodyweight logged yet.</p>
            )}
            <div className="flex gap-2">
              <input
                inputMode="decimal"
                className={`min-h-11 flex-1 ${inp}`}
                placeholder={state.settings.unit === 'kg' ? 'Weight (kg)' : 'Weight (lbs)'}
                value={bwInput}
                onChange={(e) => setBwInput(e.target.value)}
              />
              <button
                type="button"
                className="apex-btn-primary min-h-11 px-6 text-[13px] font-semibold shrink-0 rounded-[14px]"
                style={{ backgroundColor: accent }}
                onClick={() => {
                  const v = Number(bwInput)
                  if (!Number.isFinite(v)) return
                  addBodyweight(v)
                  setBwInput('')
                  notify('Bodyweight saved')
                }}
              >
                Save
              </button>
            </div>
          </div>
          <div className="apex-card p-5 h-64">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#9a9aa3] mb-3">
              Weekly volume (8 wks)
            </p>
            <ResponsiveContainer width="100%" height="85%">
              <BarChart data={vol} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid stroke="#1e1e1e" vertical={false} />
                <XAxis dataKey="label" stroke="#444" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#444" fontSize={10} width={44} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ background: '#161616', border: '1px solid #1e1e1e' }}
                  labelStyle={{ color: '#e0e0e0' }}
                  itemStyle={{ color: '#e0e0e0' }}
                />
                <Bar dataKey="volume" fill={accent} radius={[3, 3, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="apex-card p-5 h-56">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#9a9aa3] mb-3">Bodyweight</p>
            <ResponsiveContainer width="100%" height="85%">
              <LineChart data={bw}>
                <CartesianGrid stroke="#1e1e1e" strokeDasharray="3 3" />
                <XAxis dataKey="at" stroke="#444" fontSize={10} />
                <YAxis stroke="#444" fontSize={10} width={36} />
                <Tooltip
                  contentStyle={{ background: '#161616', border: '1px solid #1e1e1e' }}
                  labelStyle={{ color: '#e0e0e0' }}
                />
                <Line type="monotone" dataKey="value" stroke="#555" dot={false} strokeWidth={1.5} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : null}

      {sub === 'settings' ? (
        <div className="space-y-5">
          <label className="block">
            <span className="apex-section-label block mb-2">Display name</span>
            <input
              className={`w-full min-h-12 ${inp}`}
              value={state.settings.displayName}
              onChange={(e) => updateSettings({ displayName: e.target.value })}
            />
          </label>
          <div>
            <span className="apex-section-label block mb-2">Profile avatar</span>
            <p className="text-[12px] font-medium text-[#6b6b73] mb-3 leading-relaxed">
              Choose a fitness icon, or use initials from your display name.
            </p>
            <div className="grid grid-cols-4 gap-2">
              {PROFILE_AVATAR_IDS.map((id) => {
                const selected = state.settings.profileAvatarId === id
                return (
                  <button
                    key={id}
                    type="button"
                    aria-label={`Avatar ${id}`}
                    aria-pressed={selected}
                    className={`flex min-h-[3.25rem] items-center justify-center rounded-[14px] border transition-colors active:scale-[0.98] ${
                      selected
                        ? 'border-white/25 bg-white/[0.12]'
                        : 'border-white/[0.08] bg-black/25 hover:border-white/[0.14]'
                    }`}
                    style={selected ? { boxShadow: `0 0 0 2px color-mix(in srgb, ${accent} 55%, transparent)` } : undefined}
                    onClick={() => updateSettings({ profileAvatarId: id })}
                  >
                    <ProfileAvatarGlyph id={id} className="h-7 w-7 text-[#ececee]" />
                  </button>
                )
              })}
            </div>
            <button
              type="button"
              className="apex-btn mt-3 w-full min-h-11 text-[13px] font-semibold"
              onClick={() => updateSettings({ profileAvatarId: null })}
            >
              Use initials instead
            </button>
          </div>
          <label className="block">
            <span className="apex-section-label block mb-2">Fitness goals</span>
            <textarea
              className="apex-input mt-1 w-full min-h-24 px-3 py-3 resize-y"
              value={state.settings.fitnessGoals}
              onChange={(e) => updateSettings({ fitnessGoals: e.target.value })}
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              className={`apex-btn min-h-12 flex-1 text-[14px] font-semibold ${
                state.settings.unit === 'lbs' ? 'border-white/15 bg-white/[0.08] text-[#f4f4f5]' : ''
              }`}
              onClick={() => updateSettings({ unit: 'lbs' })}
            >
              lbs
            </button>
            <button
              type="button"
              className={`apex-btn min-h-12 flex-1 text-[14px] font-semibold ${
                state.settings.unit === 'kg' ? 'border-white/15 bg-white/[0.08] text-[#f4f4f5]' : ''
              }`}
              onClick={() => updateSettings({ unit: 'kg' })}
            >
              kg
            </button>
          </div>
          <label className="flex items-center gap-3 min-h-12 text-[13px] font-normal text-[#e0e0e0]">
            <input
              type="checkbox"
              checked={state.settings.restTimerEnabled}
              onChange={(e) => updateSettings({ restTimerEnabled: e.target.checked })}
              className="h-4 w-4"
              style={{ accentColor: accent }}
            />
            Start rest countdown after each set
          </label>
          <label className="block">
            <span className="apex-section-label block mb-2">Rest timer (seconds)</span>
            <input
              inputMode="numeric"
              className={`mt-1 w-full min-h-12 ${inp}`}
              value={String(state.settings.restTimerSeconds)}
              onChange={(e) =>
                updateSettings({ restTimerSeconds: Math.max(0, Number(e.target.value) || 0) })
              }
            />
          </label>
          <div className="apex-card p-4 space-y-3">
            <p className="apex-section-label">Accent color</p>
            <div className="flex gap-3 items-center">
              <input
                type="color"
                className="h-12 w-14 rounded-[12px] border border-[#1e1e1e] bg-transparent"
                value={state.settings.accentColor}
                onChange={(e) => updateSettings({ accentColor: e.target.value })}
              />
              <input
                className={`min-h-12 flex-1 ${inp} font-mono`}
                value={state.settings.accentColor}
                onChange={(e) => updateSettings({ accentColor: e.target.value })}
                placeholder="#3b82f6"
              />
            </div>
          </div>
          <label className="flex items-center gap-3 min-h-12 text-[13px] font-normal text-[#e0e0e0]">
            <input
              type="checkbox"
              checked={state.settings.trainerMode}
              onChange={(e) => updateSettings({ trainerMode: e.target.checked })}
              className="h-4 w-4"
              style={{ accentColor: accent }}
            />
            Trainer mode
          </label>
          <label className="block">
            <span className="apex-section-label block mb-2">Trainer notes (shown on Today)</span>
            <textarea
              className="apex-input mt-1 w-full min-h-24 px-3 py-3 resize-y"
              value={state.settings.trainerNotes}
              onChange={(e) => updateSettings({ trainerNotes: e.target.value })}
            />
          </label>
          <button
            type="button"
            className="apex-btn w-full min-h-12 text-[14px] font-semibold"
            onClick={() => downloadText('workout-export.csv', exportFullDataCsv(state))}
          >
            Export CSV
          </button>
          <div className="apex-card p-5 space-y-3">
            <p className="apex-section-label">Import with AI</p>
            <p className="text-[12px] font-medium text-[#8b8b93] leading-relaxed">
              Paste workout notes, preview structured entries, then confirm before they are saved.
            </p>
            <textarea
              className="apex-input w-full min-h-32 px-3 py-3 resize-y"
              placeholder="Paste workout notes…"
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
            />
            <button
              type="button"
              disabled={busy}
              className="w-full min-h-12 rounded-[12px] text-[13px] font-medium text-[#0c0c0c] disabled:opacity-50"
              style={{ backgroundColor: accent }}
              onClick={() => void runParseImport()}
            >
              Parse
            </button>
          </div>
        </div>
      ) : null}

      {sub === 'ai' ? (
        <div className="flex flex-col min-h-[min(70vh,32rem)] max-h-[calc(100dvh-11rem)]">
          <div className="grid grid-cols-1 gap-2 shrink-0 sm:grid-cols-3">
            {coachSuggestions.map((label) => (
              <button
                key={label}
                type="button"
                disabled={busy}
                className="apex-btn min-h-11 px-2 text-[12px] font-medium leading-snug text-[#e8e8ec] border-white/[0.12] disabled:opacity-45"
                onClick={() => void runCoachTurn(label)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto space-y-3 rounded-[16px] border border-white/[0.08] bg-black/20 p-4 mt-3 mb-2">
            {state.chatMessages.length === 0 ? (
              <p className="text-[13px] font-normal text-[#bdbdbd] leading-relaxed">
                Ask for form cues, programming ideas, or recovery tips. Your goals, this week&apos;s logged
                work, schedule, and streak are sent with every message.
              </p>
            ) : null}
            {state.chatMessages.map((m) => {
              const display = m.role === 'model' ? sanitizeCoachBubbleText(m.text) : m.text
              if (!display.trim()) return null
              return (
                <div
                  key={m.id}
                  className={`max-w-[92%] rounded-[12px] p-3 text-[13px] font-normal leading-relaxed ${
                    m.role === 'user'
                      ? 'ml-auto text-white border border-transparent'
                      : 'mr-auto text-[#e0e0e0] border border-[#2a2a2a]'
                  }`}
                  style={
                    m.role === 'user' ? { backgroundColor: accent } : { backgroundColor: '#1e1e1e' }
                  }
                >
                  {display}
                </div>
              )
            })}
            {busy ? (
              <div className="flex justify-center py-3" role="status" aria-label="Loading">
                <div
                  className="h-7 w-7 rounded-full border-2 border-[#333] border-t-transparent animate-spin"
                  style={{ borderTopColor: accent }}
                />
              </div>
            ) : null}
          </div>
          <div className="shrink-0 flex gap-2 pt-3 border-t border-[#1e1e1e] pb-2">
            <input
              className={`min-h-12 flex-1 ${inp}`}
              placeholder="Message coach…"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void sendCoach()
              }}
            />
            <button
              type="button"
              disabled={busy}
              className="min-h-12 px-5 rounded-[12px] text-[13px] font-medium text-[#0c0c0c] disabled:opacity-50"
              style={{ backgroundColor: accent }}
              onClick={() => void sendCoach()}
            >
              Send
            </button>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={!!confirmFriendId}
        title="Remove friend?"
        message="This removes them from your weekly leaderboard."
        confirmLabel="Remove"
        accent={accent}
        onCancel={() => setConfirmFriendId(null)}
        onConfirm={() => {
          if (confirmFriendId) removeFriend(confirmFriendId)
          setConfirmFriendId(null)
        }}
      />

      {importPreview ? (
        <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/85 p-4">
          <div className="w-full max-w-md apex-card p-5 max-h-[85vh] overflow-y-auto">
            <h3 className="text-[13px] font-normal text-[#e0e0e0]">Import preview</h3>
            <p className="mt-2 text-[13px] font-normal text-[#bdbdbd] leading-relaxed">
              These entries will be merged into your data. Existing logs stay; new rows are appended.
            </p>
            <ul className="mt-4 space-y-2 text-[13px] font-normal text-[#e0e0e0]">
              <li>
                Set logs:{' '}
                <span className="tabular-nums text-[#e0e0e0]">{importPreview.setLogs?.length ?? 0}</span>
              </li>
              <li>
                Cardio:{' '}
                <span className="tabular-nums text-[#e0e0e0]">
                  {importPreview.cardioEntries?.length ?? 0}
                </span>
              </li>
              <li>
                Bodyweight:{' '}
                <span className="tabular-nums text-[#e0e0e0]">
                  {importPreview.bodyweightLogs?.length ?? 0}
                </span>
              </li>
              <li>
                Schedule:{' '}
                <span className="text-[#e0e0e0]">
                  {importPreview.schedule ? `${importPreview.schedule.length} days` : 'unchanged'}
                </span>
              </li>
            </ul>
            {importPreview.setLogs?.length ? (
              <div className="mt-4 max-h-40 overflow-y-auto rounded-[14px] border border-white/[0.08] bg-black/25 p-3">
                <p className="apex-section-label mb-2">Sample sets</p>
                <ul className="space-y-1 text-[12px] text-[#bdbdbd]">
                  {importPreview.setLogs.slice(0, 8).map((l) => (
                    <li key={l.id}>
                      {l.exerciseName}
                      {l.kind === 'weighted'
                        ? ` · ${l.bodyweight ? 'BW' : l.weight} × ${l.reps}`
                        : ` · ${l.durationSec}s`}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="mt-6 flex gap-2">
              <button
                type="button"
                className="apex-btn min-h-12 flex-1 text-[14px] font-semibold"
                onClick={() => setImportPreview(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="min-h-12 flex-1 rounded-[12px] text-[13px] font-medium text-[#0c0c0c]"
                style={{ backgroundColor: accent }}
                onClick={confirmImportMerge}
              >
                Save merge
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
