import type { AppPersisted } from '../types'
import { supabase } from './supabase'
import { computeWeekSummary } from './weekSummary'

export type WeeklyInsight = {
  insight: string
  week_start: string
  stats: { sessions: number; sets: number; reps: number; prs: number } | null
}

function mondayOfWeek(d: Date): string {
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(d)
  monday.setDate(d.getDate() + diff)
  return monday.toISOString().split('T')[0]!
}

function weekSessionCount(state: AppPersisted, nowMs: number): number {
  const ws = new Date(nowMs)
  const day = ws.getDay()
  ws.setDate(ws.getDate() + (day === 0 ? -6 : 1 - day))
  ws.setHours(0, 0, 0, 0)
  const we = new Date(ws)
  we.setDate(ws.getDate() + 7)
  const days = new Set(
    state.setLogs
      .filter((l) => l.at >= ws.getTime() && l.at < we.getTime())
      .map((l) => new Date(l.at).toDateString()),
  )
  return days.size
}

async function generateInsight(state: AppPersisted, nowMs: number): Promise<string> {
  const summary = computeWeekSummary(state, nowMs)
  const sessions = weekSessionCount(state, nowMs)
  const muscles = summary.muscleGroups.join(', ') || 'none logged'
  const vol =
    summary.totalVolumeLbs >= 1000
      ? `${(summary.totalVolumeLbs / 1000).toFixed(1)}K lbs`
      : `${summary.totalVolumeLbs} lbs`

  const prompt = `You are a brief, data-driven strength coach. Based on this week's training data, write ONE sentence of insight or advice (max 25 words). Be specific to the numbers. No filler. No greeting.

Week: ${summary.weekLabel}
Sessions: ${sessions}
Sets: ${summary.totalSets}
Volume: ${vol}
Muscle groups: ${muscles}
PRs: ${summary.prCount}`

  const apiKey =
    import.meta.env.VITE_ANTHROPIC_API_KEY?.trim() ||
    import.meta.env.VITE_CLAUDE_API_KEY?.trim()
  if (!apiKey) return ''

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 80,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!res.ok) return ''
  const data = (await res.json()) as { content?: { type: string; text?: string }[] }
  return data.content?.find((b) => b.type === 'text')?.text?.trim() ?? ''
}

export async function fetchWeeklyInsight(state?: AppPersisted): Promise<WeeklyInsight | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const nowMs = Date.now()
  const weekStart = mondayOfWeek(new Date(nowMs))

  const { data: existing } = await supabase
    .from('weekly_insights')
    .select('insight, week_start, stats')
    .eq('user_id', user.id)
    .eq('week_start', weekStart)
    .maybeSingle()

  if (existing) return existing as WeeklyInsight

  // Nothing stored for this week — generate client-side if we have state
  if (!state) return null

  const summary = computeWeekSummary(state, nowMs)
  if (summary.totalSets === 0) return null // no data yet this week

  const insight = await generateInsight(state, nowMs)
  if (!insight) return null

  const sessions = weekSessionCount(state, nowMs)
  const stats = {
    sessions,
    sets: summary.totalSets,
    reps: state.setLogs
      .filter((l) => {
        const ws = new Date(nowMs)
        const day = ws.getDay()
        ws.setDate(ws.getDate() + (day === 0 ? -6 : 1 - day))
        ws.setHours(0, 0, 0, 0)
        const we = new Date(ws)
        we.setDate(ws.getDate() + 7)
        return l.at >= ws.getTime() && l.at < we.getTime()
      })
      .reduce((acc, l) => acc + (('reps' in l ? l.reps : null) ?? 0), 0),
    prs: summary.prCount,
  }

  const row: WeeklyInsight = { insight, week_start: weekStart, stats }

  await supabase
    .from('weekly_insights')
    .upsert({ user_id: user.id, ...row }, { onConflict: 'user_id,week_start' })

  return row
}
