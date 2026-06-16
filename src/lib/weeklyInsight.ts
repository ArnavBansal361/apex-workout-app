import { supabase } from './supabase'

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
  return monday.toISOString().split('T')[0]
}

export async function fetchWeeklyInsight(): Promise<WeeklyInsight | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const weekStart = mondayOfWeek(new Date())

  const { data } = await supabase
    .from('weekly_insights')
    .select('insight, week_start, stats')
    .eq('user_id', user.id)
    .eq('week_start', weekStart)
    .maybeSingle()

  return data ?? null
}
