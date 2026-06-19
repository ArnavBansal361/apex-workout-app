import { createClient } from '@supabase/supabase-js'
import type { User } from '@supabase/supabase-js'
import { filterClientStateForTrainer, type TrainerSharePrefs } from './trainer'
import type { AppPersisted, AssignedWorkout, ReadinessLogEntry, WorkoutMoodLogEntry } from '../types'
import { streakCurrent, workoutDaysFromLogs } from './achievements'
import { stateForCloudSync } from './cycleTracking'
import { alignScheduleWeek, migrateCustomExercises } from './persist'
import { weightToLbs } from './volumeStats'
import { dateKey, weekStartMonday } from './dates'
import type { ReadinessResponses, ReadinessResult } from './readiness'
import type { TrainingMode } from './trainingMode'
import type { WorkoutMoodResponses } from './workoutMood'
import { workoutMoodLift } from './workoutMood'
import type { BodyMeasurementInput, BodyMeasurementLog } from './bodyMeasurements'
import { hasAnyBodyMeasurement, todayMeasurementDateKey } from './bodyMeasurements'

/** Supabase table: user_workout_data (user_id uuid PK, data jsonb, updated_at timestamptz). */
const WORKOUT_DATA_TABLE = 'user_workout_data'

/** Supabase table: leaderboard — run once in SQL editor:
 *
 * create table if not exists public.leaderboard (
 *   id uuid primary key default gen_random_uuid(),
 *   user_id uuid not null unique references auth.users(id) on delete cascade,
 *   display_name text not null default '',
 *   avatar_url text,
 *   total_volume_lbs numeric not null default 0,
 *   weekly_volume_lbs numeric not null default 0,
 *   total_workouts int not null default 0,
 *   current_streak int not null default 0,
 *   xp int not null default 0,
 *   updated_at timestamptz not null default now()
 * );
 *
 * alter table public.leaderboard enable row level security;
 *
 * create policy "leaderboard read all" on public.leaderboard
 *   for select using (true);
 *
 * create policy "leaderboard insert own" on public.leaderboard
 *   for insert with check (auth.uid() = user_id);
 *
 * create policy "leaderboard update own" on public.leaderboard
 *   for update using (auth.uid() = user_id);
 */
const LEADERBOARD_TABLE = 'leaderboard'

export type LeaderboardEntry = {
  id: string
  user_id: string
  display_name: string
  avatar_url: string | null
  total_volume_lbs: number
  weekly_volume_lbs: number
  total_workouts: number
  current_streak: number
  xp: number
  updated_at: string
}

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      detectSessionInUrl: true,
      persistSession: true,
    },
  },
)

/** OAuth return URL — must match Supabase redirect allow list. */
export function getOAuthRedirectUrl(): string {
  return window.location.origin
}

export function signInWithGoogle() {
  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin,
    },
  })
}

function stateRevision(state: AppPersisted): number {
  let maxAt = 0
  for (const log of state.setLogs) {
    if (log.at > maxAt) maxAt = log.at
  }
  for (const c of state.cardioEntries) {
    if (c.at > maxAt) maxAt = c.at
  }
  for (const b of state.bodyweightLogs) {
    if (b.at > maxAt) maxAt = b.at
  }
  for (const w of state.waterLogs ?? []) {
    if (w.at > maxAt) maxAt = w.at
  }
  for (const sl of state.sleepLogs ?? []) {
    if (sl.at > maxAt) maxAt = sl.at
  }
  for (const m of state.mealLogs ?? []) {
    if (m.at > maxAt) maxAt = m.at
  }
  return maxAt
}

function normalizeRemoteState(raw: unknown): AppPersisted | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (!Array.isArray(o.setLogs) && !Array.isArray(o.schedule)) return null
  return alignScheduleWeek({
    ...(raw as AppPersisted),
    customExercises: migrateCustomExercises((raw as AppPersisted).customExercises),
  })
}

export async function fetchUserWorkoutState(
  userId: string,
): Promise<{ state: AppPersisted; updatedAt: number } | null> {
  const { data, error } = await supabase
    .from(WORKOUT_DATA_TABLE)
    .select('data, updated_at')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    if (import.meta.env.DEV) console.warn('[Apex] fetchUserWorkoutState', error.message)
    return null
  }
  if (!data?.data) return null

  const state = normalizeRemoteState(data.data)
  if (!state) return null

  const updatedAt = data.updated_at ? Date.parse(String(data.updated_at)) : stateRevision(state)
  return { state, updatedAt: Number.isFinite(updatedAt) ? updatedAt : stateRevision(state) }
}

export async function upsertUserWorkoutState(userId: string, state: AppPersisted): Promise<void> {
  const { error } = await supabase.from(WORKOUT_DATA_TABLE).upsert(
    {
      user_id: userId,
      data: stateForCloudSync(state),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  )

  if (error && import.meta.env.DEV) {
    console.warn('[Apex] upsertUserWorkoutState', error.message)
  }
}

/** Prefer the copy with more recent activity when hydrating from cloud + local. */
export function pickWorkoutStateForHydrate(
  local: AppPersisted,
  remote: AppPersisted,
  remoteUpdatedAt: number,
): AppPersisted {
  const localRev = stateRevision(local)
  const remoteRev = Math.max(remoteUpdatedAt, stateRevision(remote))
  if (remoteRev > localRev) return remote
  if (localRev > remoteRev) return local
  if (remote.setLogs.length > local.setLogs.length) return remote
  return local
}

function emailDisplayPrefix(email: string | undefined): string {
  if (!email) return ''
  const local = email.split('@')[0]?.trim() ?? ''
  return local.slice(0, 40)
}

export function avatarUrlFromUser(user: User | null | undefined): string | null {
  if (!user) return null
  const meta = user.user_metadata as Record<string, unknown> | undefined
  const url = meta?.avatar_url ?? meta?.picture
  return typeof url === 'string' && url.startsWith('http') ? url : null
}

export function displayNameFromUser(user: User | null | undefined, state: AppPersisted): string {
  const fromSettings = state.settings.displayName.trim()
  if (fromSettings) return fromSettings.slice(0, 80)
  const meta = user?.user_metadata as Record<string, unknown> | undefined
  const full = meta?.full_name ?? meta?.name
  if (typeof full === 'string' && full.trim()) return full.trim().slice(0, 80)
  const emailPrefix = emailDisplayPrefix(user?.email)
  if (emailPrefix) return emailPrefix
  return 'Athlete'
}

export function computeLeaderboardStats(state: AppPersisted, nowMs = Date.now()) {
  const ws = weekStartMonday(new Date(nowMs))
  const we = new Date(ws)
  we.setDate(ws.getDate() + 7)

  let totalVolumeLbs = 0
  let weeklyVolumeLbs = 0
  for (const log of state.setLogs) {
    if (log.kind !== 'weighted' || log.bodyweight || log.weight == null || !Number.isFinite(log.weight)) {
      continue
    }
    const lbs = weightToLbs(log.weight, state.settings.unit)
    const vol = log.reps * Math.max(1, log.sets) * lbs
    totalVolumeLbs += vol
    const at = new Date(log.at)
    if (at >= ws && at < we) weeklyVolumeLbs += vol
  }

  return {
    total_volume_lbs: Math.round(totalVolumeLbs),
    weekly_volume_lbs: Math.round(weeklyVolumeLbs),
    total_workouts: workoutDaysFromLogs(state.setLogs).size,
    current_streak: streakCurrent(state),
    xp: Math.max(0, Math.floor(state.lifetimeXp ?? 0)),
  }
}

function normalizeLeaderboardRow(raw: Record<string, unknown>): LeaderboardEntry | null {
  const userId = typeof raw.user_id === 'string' ? raw.user_id : null
  if (!userId) return null
  return {
    id: typeof raw.id === 'string' ? raw.id : userId,
    user_id: userId,
    display_name: typeof raw.display_name === 'string' ? raw.display_name : 'Athlete',
    avatar_url: typeof raw.avatar_url === 'string' ? raw.avatar_url : null,
    total_volume_lbs: Number(raw.total_volume_lbs) || 0,
    weekly_volume_lbs: Number(raw.weekly_volume_lbs) || 0,
    total_workouts: Number(raw.total_workouts) || 0,
    current_streak: Number(raw.current_streak) || 0,
    xp: Number(raw.xp) || 0,
    updated_at: typeof raw.updated_at === 'string' ? raw.updated_at : new Date().toISOString(),
  }
}

export async function upsertLeaderboardEntry(
  userId: string,
  state: AppPersisted,
  user?: User | null,
): Promise<void> {
  const stats = computeLeaderboardStats(state)
  const { error } = await supabase.from(LEADERBOARD_TABLE).upsert(
    {
      user_id: userId,
      display_name: displayNameFromUser(user, state),
      avatar_url: null,
      ...stats,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  )
  if (error && import.meta.env.DEV) {
    console.warn('[Apex] upsertLeaderboardEntry', error.message)
  }
}

export async function fetchLeaderboard(limit = 50): Promise<LeaderboardEntry[]> {
  const { data, error } = await supabase
    .from(LEADERBOARD_TABLE)
    .select(
      'id, user_id, display_name, avatar_url, total_volume_lbs, weekly_volume_lbs, total_workouts, current_streak, xp, updated_at',
    )
    .order('weekly_volume_lbs', { ascending: false })
    .limit(limit)

  if (error) {
    if (import.meta.env.DEV) console.warn('[Apex] fetchLeaderboard', error.message)
    return []
  }
  if (!Array.isArray(data)) return []
  return data
    .map((row) => normalizeLeaderboardRow(row as Record<string, unknown>))
    .filter((row): row is LeaderboardEntry => row != null)
}

/** Global ranking by lifetime XP (opt-in public board). */
export async function fetchGlobalLeaderboardByXp(limit = 50): Promise<LeaderboardEntry[]> {
  const { data, error } = await supabase
    .from(LEADERBOARD_TABLE)
    .select(
      'id, user_id, display_name, avatar_url, total_volume_lbs, weekly_volume_lbs, total_workouts, current_streak, xp, updated_at',
    )
    .order('xp', { ascending: false })
    .limit(limit)

  if (error) {
    if (import.meta.env.DEV) console.warn('[Apex] fetchLeaderboard', error.message)
    return []
  }
  if (!Array.isArray(data)) return []
  return data
    .map((row) => normalizeLeaderboardRow(row as Record<string, unknown>))
    .filter((row): row is LeaderboardEntry => row != null)
}

export function formatLeaderboardVolume(lbs: number): string {
  const n = Math.round(lbs)
  if (n >= 10_000) return `${Math.round(n / 1000)}k lbs`
  return `${n.toLocaleString()} lbs`
}

/** Supabase — run in SQL editor:
 *
 * create table if not exists public.trainer_codes (
 *   trainer_user_id uuid primary key references auth.users(id) on delete cascade,
 *   code text not null unique,
 *   updated_at timestamptz not null default now()
 * );
 *
 * create table if not exists public.trainer_connections (
 *   id uuid primary key default gen_random_uuid(),
 *   trainer_user_id uuid not null references auth.users(id) on delete cascade,
 *   client_user_id uuid not null unique references auth.users(id) on delete cascade,
 *   trainer_code text not null,
 *   connected_at timestamptz not null default now()
 * );
 *
 * create table if not exists public.trainer_notes (
 *   id uuid primary key default gen_random_uuid(),
 *   trainer_user_id uuid not null references auth.users(id) on delete cascade,
 *   client_user_id uuid not null references auth.users(id) on delete cascade,
 *   note text not null default '',
 *   created_at timestamptz not null default now()
 * );
 *
 * alter table public.trainer_codes enable row level security;
 * alter table public.trainer_connections enable row level security;
 * alter table public.trainer_notes enable row level security;
 *
 * create policy "trainer_codes read for connect" on public.trainer_codes for select to authenticated using (true);
 * create policy "trainer_codes upsert own" on public.trainer_codes for insert to authenticated with check (auth.uid() = trainer_user_id);
 * create policy "trainer_codes update own" on public.trainer_codes for update to authenticated using (auth.uid() = trainer_user_id);
 *
 * create policy "connections read own" on public.trainer_connections for select to authenticated
 *   using (auth.uid() = trainer_user_id or auth.uid() = client_user_id);
 * create policy "connections insert client" on public.trainer_connections for insert to authenticated
 *   with check (auth.uid() = client_user_id);
 * create policy "connections delete participant" on public.trainer_connections for delete to authenticated
 *   using (auth.uid() = trainer_user_id or auth.uid() = client_user_id);
 *
 * create policy "trainer_notes trainer write" on public.trainer_notes for insert to authenticated
 *   with check (auth.uid() = trainer_user_id);
 * create policy "trainer_notes read participant" on public.trainer_notes for select to authenticated
 *   using (auth.uid() = trainer_user_id or auth.uid() = client_user_id);
 *
 * create policy "workout data trainer read clients" on public.user_workout_data for select to authenticated
 *   using (
 *     auth.uid() = user_id
 *     or exists (
 *       select 1 from public.trainer_connections c
 *       where c.trainer_user_id = auth.uid() and c.client_user_id = user_workout_data.user_id
 *     )
 *   );
 */
const TRAINER_CODES_TABLE = 'trainer_codes'
const TRAINER_CONNECTIONS_TABLE = 'trainer_connections'
const TRAINER_NOTES_TABLE = 'trainer_notes'
const TRAINER_ASSIGNED_WORKOUTS_TABLE = 'trainer_assigned_workouts'

/*
 * Run once in Supabase SQL editor:
 *
 * create table if not exists public.trainer_assigned_workouts (
 *   id uuid default gen_random_uuid() primary key,
 *   trainer_user_id uuid not null references auth.users(id) on delete cascade,
 *   client_user_id uuid not null references auth.users(id) on delete cascade,
 *   date_key text not null,
 *   title text not null default '',
 *   exercises jsonb not null default '[]',
 *   notes text not null default '',
 *   created_at timestamptz default now(),
 *   unique(trainer_user_id, client_user_id, date_key)
 * );
 * alter table public.trainer_assigned_workouts enable row level security;
 * create policy "assigned_trainer_all" on public.trainer_assigned_workouts
 *   for all to authenticated using (auth.uid() = trainer_user_id) with check (auth.uid() = trainer_user_id);
 * create policy "assigned_client_read" on public.trainer_assigned_workouts
 *   for select to authenticated using (auth.uid() = client_user_id);
 */

export type TrainerConnectionRow = {
  id: string
  trainer_user_id: string
  client_user_id: string
  trainer_code: string
  connected_at: string
}

export type TrainerClientSummary = {
  connection: TrainerConnectionRow
  displayName: string
  lastActiveMs: number | null
  weeklyVolumeLbs: number
  currentStreak: number
  sharePrefs: TrainerSharePrefs
}

export type TrainerNoteRow = {
  id: string
  trainer_user_id: string
  client_user_id: string
  note: string
  created_at: string
}

export async function upsertTrainerCode(trainerUserId: string, code: string): Promise<void> {
  const normalized = code.trim().toUpperCase()
  const { error } = await supabase.from(TRAINER_CODES_TABLE).upsert(
    {
      trainer_user_id: trainerUserId,
      code: normalized,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'trainer_user_id' },
  )
  if (error) throw new Error(error.message)
}

export async function fetchTrainerCodeForUser(trainerUserId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from(TRAINER_CODES_TABLE)
    .select('code')
    .eq('trainer_user_id', trainerUserId)
    .maybeSingle()
  if (error || !data?.code) return null
  return String(data.code)
}

export async function resolveTrainerIdByCode(code: string): Promise<string | null> {
  const normalized = code.trim().toUpperCase()
  const { data, error } = await supabase
    .from(TRAINER_CODES_TABLE)
    .select('trainer_user_id')
    .eq('code', normalized)
    .maybeSingle()
  if (error || !data?.trainer_user_id) return null
  return String(data.trainer_user_id)
}

export async function connectClientToTrainer(
  clientUserId: string,
  code: string,
): Promise<TrainerConnectionRow> {
  const normalized = code.trim().toUpperCase()
  if (normalized.length !== 6) {
    throw new Error('INVALID_TRAINER_CODE')
  }

  const existing = await fetchMyTrainerConnection(clientUserId)
  if (existing) {
    if (existing.trainer_code === normalized) {
      return existing
    }
    throw new Error('ALREADY_CONNECTED')
  }

  const trainerId = await resolveTrainerIdByCode(normalized)
  if (!trainerId) throw new Error('INVALID_TRAINER_CODE')
  if (trainerId === clientUserId) throw new Error('You cannot connect to yourself')

  const { data, error } = await supabase
    .from(TRAINER_CONNECTIONS_TABLE)
    .insert({
      trainer_user_id: trainerId,
      client_user_id: clientUserId,
      trainer_code: normalized,
      connected_at: new Date().toISOString(),
    })
    .select('id, trainer_user_id, client_user_id, trainer_code, connected_at')
    .single()

  if (error) {
    if (error.code === '23505') {
      const again = await fetchMyTrainerConnection(clientUserId)
      if (again?.trainer_code === normalized) return again
      throw new Error('ALREADY_CONNECTED')
    }
    throw new Error(error.message ?? 'Could not connect to trainer')
  }
  if (!data) throw new Error('Could not connect to trainer')
  return data as TrainerConnectionRow
}

export async function fetchMyTrainerConnection(
  clientUserId: string,
): Promise<TrainerConnectionRow | null> {
  const { data, error } = await supabase
    .from(TRAINER_CONNECTIONS_TABLE)
    .select('id, trainer_user_id, client_user_id, trainer_code, connected_at')
    .eq('client_user_id', clientUserId)
    .maybeSingle()
  if (error || !data) return null
  return data as TrainerConnectionRow
}

export async function disconnectTrainerClient(clientUserId: string): Promise<void> {
  const { error } = await supabase
    .from(TRAINER_CONNECTIONS_TABLE)
    .delete()
    .eq('client_user_id', clientUserId)
  if (error) throw new Error(error.message)
}

export async function fetchTrainerConnections(
  trainerUserId: string,
): Promise<TrainerConnectionRow[]> {
  const { data, error } = await supabase
    .from(TRAINER_CONNECTIONS_TABLE)
    .select('id, trainer_user_id, client_user_id, trainer_code, connected_at')
    .eq('trainer_user_id', trainerUserId)
    .order('connected_at', { ascending: false })
  if (error || !Array.isArray(data)) return []
  return data as TrainerConnectionRow[]
}

export async function fetchUserWorkoutStateForTrainer(
  clientUserId: string,
): Promise<AppPersisted | null> {
  const remote = await fetchUserWorkoutState(clientUserId)
  return remote?.state ?? null
}

export async function fetchTrainerClientSummaries(
  trainerUserId: string,
): Promise<TrainerClientSummary[]> {
  const connections = await fetchTrainerConnections(trainerUserId)
  const summaries: TrainerClientSummary[] = []

  for (const connection of connections) {
    const raw = await fetchUserWorkoutStateForTrainer(connection.client_user_id)
    const state = raw ? filterClientStateForTrainer(raw) : null
    if (!state) {
      summaries.push({
        connection,
        displayName: 'Client',
        lastActiveMs: null,
        weeklyVolumeLbs: 0,
        currentStreak: 0,
        sharePrefs: {
          workoutLogs: true,
          bodyweight: true,
          personalRecords: true,
        },
      })
      continue
    }
    const stats = computeLeaderboardStats(state)
    let lastActiveMs = 0
    for (const l of state.setLogs) {
      if (l.at > lastActiveMs) lastActiveMs = l.at
    }
    for (const c of state.cardioEntries) {
      if (c.at > lastActiveMs) lastActiveMs = c.at
    }
    for (const b of state.bodyweightLogs) {
      if (b.at > lastActiveMs) lastActiveMs = b.at
    }
    summaries.push({
      connection,
      displayName: state.settings.displayName.trim() || 'Client',
      lastActiveMs: lastActiveMs > 0 ? lastActiveMs : null,
      weeklyVolumeLbs: stats.weekly_volume_lbs,
      currentStreak: stats.current_streak,
      sharePrefs: state.trainerShare,
    })
  }
  return summaries
}

export async function insertTrainerNote(
  trainerUserId: string,
  clientUserId: string,
  note: string,
): Promise<void> {
  const text = note.trim()
  if (!text) throw new Error('Note is empty')
  const { error } = await supabase.from(TRAINER_NOTES_TABLE).insert({
    trainer_user_id: trainerUserId,
    client_user_id: clientUserId,
    note: text,
    created_at: new Date().toISOString(),
  })
  if (error) throw new Error(error.message)
}

export async function fetchLatestCoachNoteForClient(
  clientUserId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from(TRAINER_NOTES_TABLE)
    .select('note, created_at')
    .eq('client_user_id', clientUserId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error || !data?.note) return null
  return String(data.note)
}

/** Supabase table: readiness_checks — run once in SQL editor:
 *
 * create table if not exists public.readiness_checks (
 *   id uuid primary key default gen_random_uuid(),
 *   user_id uuid not null references auth.users(id) on delete cascade,
 *   date_key text not null,
 *   recovery smallint not null check (recovery between 1 and 5),
 *   cognitive_fatigue smallint check (cognitive_fatigue is null or cognitive_fatigue between 1 and 5),
 *   stress smallint not null check (stress between 1 and 5),
 *   sleep_quality smallint not null check (sleep_quality between 1 and 5),
 *
 * -- If the table already exists:
 * alter table public.readiness_checks
 *   add column if not exists cognitive_fatigue smallint
 *   check (cognitive_fatigue is null or cognitive_fatigue between 1 and 5);
 *   combined_score smallint not null,
 *   recommendation text not null check (recommendation in ('full', 'moderate', 'recovery')),
 *   created_at timestamptz not null default now()
 * );
 *
 * alter table public.readiness_checks enable row level security;
 *
 * create policy "readiness_checks insert own" on public.readiness_checks
 *   for insert with check (auth.uid() = user_id);
 *
 * create policy "readiness_checks select own" on public.readiness_checks
 *   for select using (auth.uid() = user_id);
 */
const READINESS_CHECKS_TABLE = 'readiness_checks'

export async function insertReadinessCheck(
  userId: string,
  dayKey: string,
  responses: ReadinessResponses,
  result: ReadinessResult,
): Promise<void> {
  const { error } = await supabase.from(READINESS_CHECKS_TABLE).insert({
    user_id: userId,
    date_key: dayKey,
    recovery: responses.recovery,
    cognitive_fatigue: responses.cognitiveFatigue,
    stress: responses.stress,
    sleep_quality: responses.sleepQuality,
    combined_score: result.combinedScore,
    recommendation: result.tier,
    created_at: new Date().toISOString(),
  })
  if (error) throw new Error(error.message)
}

/** Supabase table: workout_sessions — run once in SQL editor:
 *
 * create table if not exists public.workout_sessions (
 *   id uuid primary key default gen_random_uuid(),
 *   user_id uuid not null references auth.users(id) on delete cascade,
 *   date_key text not null,
 *   training_mode text not null check (training_mode in ('energy', 'focus', 'discipline', 'recovery', 'confidence')),
 *   started_at timestamptz not null default now(),
 *   ended_at timestamptz,
 *   created_at timestamptz not null default now()
 * );
 *
 * create index if not exists workout_sessions_user_date_idx
 *   on public.workout_sessions (user_id, date_key, started_at desc);
 *
 * alter table public.workout_sessions enable row level security;
 *
 * create policy "workout_sessions insert own" on public.workout_sessions
 *   for insert with check (auth.uid() = user_id);
 *
 * create policy "workout_sessions update own" on public.workout_sessions
 *   for update using (auth.uid() = user_id);
 *
 * create policy "workout_sessions select own" on public.workout_sessions
 *   for select using (auth.uid() = user_id);
 */
const WORKOUT_SESSIONS_TABLE = 'workout_sessions'

export async function insertWorkoutSession(
  userId: string,
  dayKey: string,
  trainingMode: TrainingMode,
): Promise<void> {
  const { error } = await supabase.from(WORKOUT_SESSIONS_TABLE).insert({
    user_id: userId,
    date_key: dayKey,
    training_mode: trainingMode,
    started_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  })
  if (error) throw new Error(error.message)
}

export async function fetchWorkoutSessionsForCoach(
  userId: string,
  days = 90,
): Promise<{ dateKey: string; trainingMode: TrainingMode }[]> {
  const sinceKey = coachHistorySinceKey(days)
  const { data, error } = await supabase
    .from(WORKOUT_SESSIONS_TABLE)
    .select('date_key, training_mode, started_at')
    .eq('user_id', userId)
    .gte('date_key', sinceKey)
    .order('started_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => ({
    dateKey: String(row.date_key),
    trainingMode: row.training_mode as TrainingMode,
  }))
}

export async function completeWorkoutSession(
  userId: string,
  dayKey: string,
  trainingMode: TrainingMode,
): Promise<void> {
  const { data, error: fetchError } = await supabase
    .from(WORKOUT_SESSIONS_TABLE)
    .select('id')
    .eq('user_id', userId)
    .eq('date_key', dayKey)
    .eq('training_mode', trainingMode)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (fetchError) throw new Error(fetchError.message)
  if (!data?.id) return

  const { error } = await supabase
    .from(WORKOUT_SESSIONS_TABLE)
    .update({ ended_at: new Date().toISOString() })
    .eq('id', data.id)
  if (error) throw new Error(error.message)
}

/** Optional columns on workout_sessions: feel_rating, energy_rating (1–5). */
export async function updateLatestWorkoutSessionRatings(
  userId: string,
  dayKey: string,
  feelRating: number,
  energyRating: number,
): Promise<void> {
  const { data, error: fetchError } = await supabase
    .from(WORKOUT_SESSIONS_TABLE)
    .select('id')
    .eq('user_id', userId)
    .eq('date_key', dayKey)
    .not('ended_at', 'is', null)
    .order('ended_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (fetchError) throw new Error(fetchError.message)
  if (!data?.id) return

  const { error } = await supabase
    .from(WORKOUT_SESSIONS_TABLE)
    .update({
      feel_rating: feelRating,
      energy_rating: energyRating,
    })
    .eq('id', data.id)
  if (error && import.meta.env.DEV) {
    console.warn('[Apex] updateLatestWorkoutSessionRatings', error.message)
  }
}

export const TENDED_PREFS_PROFILE_DATE_KEY = '__apex_prefs__'

/** Profile row for cross-device prefs (optional post_workout_checkin column). */
export async function upsertTendedPostWorkoutCheckin(
  userId: string,
  enabled: boolean,
): Promise<void> {
  const now = new Date().toISOString()
  const payload: Record<string, unknown> = {
    user_id: userId,
    date_key: TENDED_PREFS_PROFILE_DATE_KEY,
    workout_done: false,
    volume_lbs: 0,
    muscle_groups_trained: [],
    water_oz: 0,
    source_app: 'apex',
    updated_at: now,
    post_workout_checkin: enabled,
  }
  const { error } = await supabase.from(TENDED_USER_STATE_TABLE).upsert(payload, {
    onConflict: 'user_id,date_key',
  })
  if (error && import.meta.env.DEV) {
    console.warn('[Apex] upsertTendedPostWorkoutCheckin', error.message)
  }
}

export async function fetchTendedPostWorkoutCheckin(userId: string): Promise<boolean | null> {
  const { data, error } = await supabase
    .from(TENDED_USER_STATE_TABLE)
    .select('post_workout_checkin')
    .eq('user_id', userId)
    .eq('date_key', TENDED_PREFS_PROFILE_DATE_KEY)
    .maybeSingle()

  if (error && import.meta.env.DEV) {
    console.warn('[Apex] fetchTendedPostWorkoutCheckin', error.message)
    return null
  }
  if (data?.post_workout_checkin == null) return null
  return Boolean(data.post_workout_checkin)
}

/** Supabase table: workout_mood_checkins — run once in SQL editor:
 *
 * create table if not exists public.workout_mood_checkins (
 *   id uuid primary key default gen_random_uuid(),
 *   user_id uuid not null references auth.users(id) on delete cascade,
 *   date_key text not null,
 *   mood_before smallint not null check (mood_before between 1 and 5),
 *   mood_after smallint not null check (mood_after between 1 and 5),
 *   mood_lift smallint not null,
 *   created_at timestamptz not null default now()
 * );
 *
 * create index if not exists workout_mood_checkins_user_idx
 *   on public.workout_mood_checkins (user_id, created_at desc);
 *
 * alter table public.workout_mood_checkins enable row level security;
 *
 * create policy "workout_mood_checkins insert own" on public.workout_mood_checkins
 *   for insert with check (auth.uid() = user_id);
 *
 * create policy "workout_mood_checkins select own" on public.workout_mood_checkins
 *   for select using (auth.uid() = user_id);
 */
const WORKOUT_MOOD_CHECKINS_TABLE = 'workout_mood_checkins'

function coachHistorySinceKey(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - (days - 1))
  return dateKey(d)
}

export async function fetchReadinessChecksForCoach(
  userId: string,
  days = 7,
): Promise<ReadinessLogEntry[]> {
  const sinceKey = coachHistorySinceKey(days)
  const { data, error } = await supabase
    .from(READINESS_CHECKS_TABLE)
    .select(
      'date_key, recovery, cognitive_fatigue, stress, sleep_quality, combined_score, recommendation, created_at',
    )
    .eq('user_id', userId)
    .gte('date_key', sinceKey)
    .order('date_key', { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => ({
    dateKey: String(row.date_key),
    recovery: Number(row.recovery),
    cognitiveFatigue:
      row.cognitive_fatigue == null ? undefined : Number(row.cognitive_fatigue),
    stress: Number(row.stress),
    sleepQuality: Number(row.sleep_quality),
    combinedScore: Number(row.combined_score),
    recommendation: row.recommendation as ReadinessLogEntry['recommendation'],
    at: row.created_at ? Date.parse(String(row.created_at)) : Date.now(),
  }))
}

export async function fetchWorkoutMoodCheckinsForCoach(
  userId: string,
  days = 28,
): Promise<WorkoutMoodLogEntry[]> {
  const sinceKey = coachHistorySinceKey(days)
  const { data, error } = await supabase
    .from(WORKOUT_MOOD_CHECKINS_TABLE)
    .select('date_key, mood_before, mood_after, mood_lift, created_at')
    .eq('user_id', userId)
    .gte('date_key', sinceKey)
    .order('created_at', { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => ({
    dateKey: String(row.date_key),
    moodBefore: Number(row.mood_before),
    moodAfter: Number(row.mood_after),
    moodLift: Number(row.mood_lift),
    at: row.created_at ? Date.parse(String(row.created_at)) : Date.now(),
  }))
}

export type MoodLiftStats = {
  averageLift: number
  checkinCount: number
}

export async function insertWorkoutMoodCheckin(
  userId: string,
  dayKey: string,
  responses: WorkoutMoodResponses,
): Promise<void> {
  const moodLift = workoutMoodLift(responses)
  const { error } = await supabase.from(WORKOUT_MOOD_CHECKINS_TABLE).insert({
    user_id: userId,
    date_key: dayKey,
    mood_before: responses.moodBefore,
    mood_after: responses.moodAfter,
    mood_lift: moodLift,
    created_at: new Date().toISOString(),
  })
  if (error) throw new Error(error.message)
}

export async function fetchAverageMoodLift(userId: string): Promise<MoodLiftStats | null> {
  const { data, error } = await supabase
    .from(WORKOUT_MOOD_CHECKINS_TABLE)
    .select('mood_lift')
    .eq('user_id', userId)

  if (error) throw new Error(error.message)
  if (!data?.length) return null

  const lifts = data.map((row) => Number(row.mood_lift)).filter((n) => Number.isFinite(n))
  if (!lifts.length) return null

  const sum = lifts.reduce((acc, n) => acc + n, 0)
  return {
    averageLift: sum / lifts.length,
    checkinCount: lifts.length,
  }
}

/** Supabase table: body_measurements — run once in SQL editor:
 *
 * create table if not exists public.body_measurements (
 *   id uuid primary key default gen_random_uuid(),
 *   user_id uuid not null references auth.users(id) on delete cascade,
 *   date_key text not null,
 *   weight numeric,
 *   chest numeric,
 *   waist numeric,
 *   hips numeric,
 *   arms numeric,
 *   thighs numeric,
 *   weight_unit text not null default 'lbs',
 *   circumference_unit text not null default 'in',
 *   created_at timestamptz not null default now()
 * );
 *
 * create index if not exists body_measurements_user_created_idx
 *   on public.body_measurements (user_id, created_at desc);
 *
 * alter table public.body_measurements enable row level security;
 *
 * create policy "body_measurements insert own" on public.body_measurements
 *   for insert with check (auth.uid() = user_id);
 *
 * create policy "body_measurements select own" on public.body_measurements
 *   for select using (auth.uid() = user_id);
 */
/** Supabase table: deload_weeks — run once in SQL editor:
 *
 * create table if not exists public.deload_weeks (
 *   id uuid primary key default gen_random_uuid(),
 *   user_id uuid not null references auth.users(id) on delete cascade,
 *   week_start_key text not null,
 *   action text not null check (action in ('suggested', 'applied', 'dismissed')),
 *   weight_reduction_pct smallint not null default 40,
 *   exercise_ids jsonb not null default '[]'::jsonb,
 *   created_at timestamptz not null default now()
 * );
 *
 * create index if not exists deload_weeks_user_week_idx
 *   on public.deload_weeks (user_id, week_start_key, created_at desc);
 *
 * alter table public.deload_weeks enable row level security;
 *
 * create policy "deload_weeks insert own" on public.deload_weeks
 *   for insert with check (auth.uid() = user_id);
 *
 * create policy "deload_weeks select own" on public.deload_weeks
 *   for select using (auth.uid() = user_id);
 */
const DELOAD_WEEKS_TABLE = 'deload_weeks'

export type DeloadWeekAction = 'suggested' | 'applied' | 'dismissed'

export type DeloadWeekRecord = {
  id: string
  weekStartKey: string
  action: DeloadWeekAction
  weightReductionPct: number
  exerciseIds: string[]
  createdAt: string
}

export async function insertDeloadWeekEvent(
  userId: string,
  weekStartKey: string,
  action: DeloadWeekAction,
  exerciseIds: string[],
  weightReductionPct = 40,
): Promise<void> {
  const { error } = await supabase.from(DELOAD_WEEKS_TABLE).insert({
    user_id: userId,
    week_start_key: weekStartKey,
    action,
    weight_reduction_pct: weightReductionPct,
    exercise_ids: exerciseIds,
    created_at: new Date().toISOString(),
  })
  if (error) throw new Error(error.message)
}

export async function fetchDeloadWeekHistory(
  userId: string,
  limit = 24,
): Promise<DeloadWeekRecord[]> {
  const { data, error } = await supabase
    .from(DELOAD_WEEKS_TABLE)
    .select('id, week_start_key, action, weight_reduction_pct, exercise_ids, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => ({
    id: String(row.id),
    weekStartKey: String(row.week_start_key),
    action: row.action as DeloadWeekAction,
    weightReductionPct: Number(row.weight_reduction_pct) || 40,
    exerciseIds: Array.isArray(row.exercise_ids)
      ? row.exercise_ids.map((x) => String(x))
      : [],
    createdAt: String(row.created_at),
  }))
}

const BODY_MEASUREMENTS_TABLE = 'body_measurements'

function parseMeasurementNumber(raw: unknown): number | null {
  if (raw == null) return null
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : null
}

function mapBodyMeasurementRow(row: Record<string, unknown>): BodyMeasurementLog {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    date_key: String(row.date_key),
    weight: parseMeasurementNumber(row.weight),
    chest: parseMeasurementNumber(row.chest),
    waist: parseMeasurementNumber(row.waist),
    hips: parseMeasurementNumber(row.hips),
    arms: parseMeasurementNumber(row.arms),
    thighs: parseMeasurementNumber(row.thighs),
    weight_unit: String(row.weight_unit ?? 'lbs'),
    circumference_unit: String(row.circumference_unit ?? 'in'),
    created_at: String(row.created_at),
  }
}

export async function insertBodyMeasurementLog(
  userId: string,
  input: BodyMeasurementInput,
  weightUnit: 'lbs' | 'kg',
): Promise<BodyMeasurementLog> {
  if (!hasAnyBodyMeasurement(input)) {
    throw new Error('Enter at least one measurement')
  }

  const payload = {
    user_id: userId,
    date_key: todayMeasurementDateKey(),
    weight: input.weight ?? null,
    chest: input.chest ?? null,
    waist: input.waist ?? null,
    hips: input.hips ?? null,
    arms: input.arms ?? null,
    thighs: input.thighs ?? null,
    weight_unit: weightUnit,
    circumference_unit: 'in',
    created_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from(BODY_MEASUREMENTS_TABLE)
    .insert(payload)
    .select('*')
    .single()

  if (error) throw new Error(error.message)
  return mapBodyMeasurementRow(data as Record<string, unknown>)
}

export async function fetchBodyMeasurementLogs(userId: string): Promise<BodyMeasurementLog[]> {
  const { data, error } = await supabase
    .from(BODY_MEASUREMENTS_TABLE)
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })

  if (error) throw new Error(error.message)
  if (!data?.length) return []
  return data.map((row) => mapBodyMeasurementRow(row as Record<string, unknown>))
}

/** Supabase table: tended_user_state — shared Tended cross-app daily physical state.
 *
 * create table if not exists public.tended_user_state (
 *   id uuid primary key default gen_random_uuid(),
 *   user_id uuid not null references auth.users(id) on delete cascade,
 *   date_key text not null,
 *   workout_done boolean not null default false,
 *   volume_lbs numeric not null default 0,
 *   muscle_groups_trained text[] not null default '{}',
 *   mood_score smallint check (mood_score is null or mood_score between 1 and 5),
 *   sleep_hours numeric check (sleep_hours is null or sleep_hours >= 0),
 *   water_oz numeric not null default 0,
 *   readiness_score smallint,
 *   energy_level smallint check (energy_level is null or energy_level between 1 and 5),
 *   stress_level smallint check (stress_level is null or stress_level between 1 and 5),
 *   onboarding_complete boolean,
 *   source_app text not null default 'apex',
 *   created_at timestamptz not null default now(),
 *   updated_at timestamptz not null default now(),
 *   unique (user_id, date_key)
 * );
 *
 * create index if not exists tended_user_state_user_date_idx
 *   on public.tended_user_state (user_id, date_key desc);
 *
 * alter table public.tended_user_state enable row level security;
 *
 * create policy "tended_user_state select own" on public.tended_user_state
 *   for select using (auth.uid() = user_id);
 *
 * create policy "tended_user_state insert own" on public.tended_user_state
 *   for insert with check (auth.uid() = user_id);
 *
 * create policy "tended_user_state update own" on public.tended_user_state
 *   for update using (auth.uid() = user_id);
 */
const TENDED_USER_STATE_TABLE = 'tended_user_state'

/** Daily physical-state row for cross-app Tended context. */
export type TendedUserStateSnapshot = {
  dateKey: string
  workoutDone: boolean
  volumeLbs: number
  muscleGroupsTrained: string[]
  moodScore: number | null
  sleepHours: number | null
  waterOz: number
  readinessScore: number | null
  energyLevel: number | null
  stressLevel: number | null
}

export async function upsertTendedUserState(
  userId: string,
  snapshot: TendedUserStateSnapshot,
  sourceApp = 'apex',
): Promise<void> {
  const now = new Date().toISOString()
  const { error } = await supabase.from(TENDED_USER_STATE_TABLE).upsert(
    {
      user_id: userId,
      date_key: snapshot.dateKey,
      workout_done: snapshot.workoutDone,
      volume_lbs: snapshot.volumeLbs,
      muscle_groups_trained: snapshot.muscleGroupsTrained,
      mood_score: snapshot.moodScore,
      sleep_hours: snapshot.sleepHours,
      water_oz: snapshot.waterOz,
      readiness_score: snapshot.readinessScore,
      energy_level: snapshot.energyLevel,
      stress_level: snapshot.stressLevel,
      source_app: sourceApp,
      updated_at: now,
    },
    { onConflict: 'user_id,date_key' },
  )
  if (error) throw new Error(error.message)
}

/** Profile row date_key for cross-device onboarding flag (optional `onboarding_complete` column). */
export const TENDED_ONBOARDING_PROFILE_DATE_KEY = '__apex_onboarding__'

/** Profile row in tended_user_state for the user's shareable friend code (`friend_code` column). */
export const TENDED_FRIEND_CODE_PROFILE_DATE_KEY = '__apex_friend_code__'

export async function upsertTendedOnboardingComplete(userId: string): Promise<void> {
  const now = new Date().toISOString()
  const payload: Record<string, unknown> = {
    user_id: userId,
    date_key: TENDED_ONBOARDING_PROFILE_DATE_KEY,
    workout_done: false,
    volume_lbs: 0,
    muscle_groups_trained: [],
    water_oz: 0,
    source_app: 'apex',
    updated_at: now,
    onboarding_complete: true,
  }
  const { error } = await supabase.from(TENDED_USER_STATE_TABLE).upsert(payload, {
    onConflict: 'user_id,date_key',
  })
  if (error && import.meta.env.DEV) {
    console.warn('[Apex] upsertTendedOnboardingComplete', error.message)
  }
}

export async function fetchTendedOnboardingComplete(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from(TENDED_USER_STATE_TABLE)
    .select('onboarding_complete')
    .eq('user_id', userId)
    .eq('date_key', TENDED_ONBOARDING_PROFILE_DATE_KEY)
    .maybeSingle()
  if (error) {
    if (import.meta.env.DEV) console.warn('[Apex] fetchTendedOnboardingComplete', error.message)
    return false
  }
  return Boolean(data?.onboarding_complete)
}

export async function fetchTendedUserState(
  userId: string,
  limit = 30,
): Promise<TendedUserStateSnapshot[]> {
  const { data, error } = await supabase
    .from(TENDED_USER_STATE_TABLE)
    .select(
      'date_key, workout_done, volume_lbs, muscle_groups_trained, mood_score, sleep_hours, water_oz, readiness_score, energy_level, stress_level',
    )
    .eq('user_id', userId)
    .order('date_key', { ascending: false })
    .limit(limit)

  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => ({
    dateKey: String(row.date_key),
    workoutDone: Boolean(row.workout_done),
    volumeLbs: Number(row.volume_lbs) || 0,
    muscleGroupsTrained: Array.isArray(row.muscle_groups_trained)
      ? row.muscle_groups_trained.map((g) => String(g))
      : [],
    moodScore: row.mood_score == null ? null : Number(row.mood_score),
    sleepHours: row.sleep_hours == null ? null : Number(row.sleep_hours),
    waterOz: Number(row.water_oz) || 0,
    readinessScore: row.readiness_score == null ? null : Number(row.readiness_score),
    energyLevel: row.energy_level == null ? null : Number(row.energy_level),
    stressLevel: row.stress_level == null ? null : Number(row.stress_level),
  }))
}

/** Supabase table: friendships — run in SQL editor:
 *
 * create table if not exists public.friendships (
 *   user_id uuid primary key references auth.users(id) on delete cascade,
 *   friend_code text not null unique,
 *   friends uuid[] not null default '{}',
 *   updated_at timestamptz not null default now()
 * );
 *
 * create index if not exists friendships_code_idx on public.friendships (friend_code);
 * alter table public.friendships enable row level security;
 *
 * create policy "friendships select own or lookup" on public.friendships
 *   for select to authenticated using (true);
 *
 * create policy "friendships insert own" on public.friendships
 *   for insert to authenticated with check (auth.uid() = user_id);
 *
 * create policy "friendships update own" on public.friendships
 *   for update to authenticated using (auth.uid() = user_id);
 *
 * create or replace function public.apex_add_friend_by_code(p_code text)
 * returns void language plpgsql security definer set search_path = public as $$
 * declare
 *   me uuid := auth.uid();
 *   them uuid;
 *   my_friends uuid[];
 *   their_friends uuid[];
 * begin
 *   if me is null then raise exception 'not authenticated'; end if;
 *   select user_id into them from friendships where upper(friend_code) = upper(trim(p_code)) limit 1;
 *   if them is null then raise exception 'code not found'; end if;
 *   if them = me then raise exception 'cannot add self'; end if;
 *   select friends into my_friends from friendships where user_id = me;
 *   if my_friends is null then my_friends := '{}'; end if;
 *   if them = any(my_friends) then return; end if;
 *   update friendships set friends = array_append(my_friends, them), updated_at = now() where user_id = me;
 *   select friends into their_friends from friendships where user_id = them;
 *   if their_friends is null then their_friends := '{}'; end if;
 *   if not (me = any(their_friends)) then
 *     update friendships set friends = array_append(their_friends, me), updated_at = now() where user_id = them;
 *   end if;
 * end;
 * $$;
 *
 * grant execute on function public.apex_add_friend_by_code(text) to authenticated;
 */
const FRIENDSHIPS_TABLE = 'friendships'
const FRIEND_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export type FriendProfileRow = {
  user_id: string
  friend_code: string
  friends: string[]
}

export type FriendLeaderboardRow = {
  id: string
  name: string
  xp: number
  isMe: boolean
  isBot: boolean
  avatarShade: number
  avatarInitial?: string
}

export const FRIEND_BOT_NAMES = ['Atlas', 'Rex', 'Luna'] as const

const FIXED_FRIEND_BOT_XP: Record<(typeof FRIEND_BOT_NAMES)[number], number> = {
  Atlas: 3200,
  Rex: 2800,
  Luna: 2450,
}

function normalizeFriendProfile(raw: Record<string, unknown>): FriendProfileRow | null {
  const user_id = typeof raw.user_id === 'string' ? raw.user_id : null
  if (!user_id) return null
  const friend_code =
    typeof raw.friend_code === 'string' ? raw.friend_code.trim().toUpperCase() : ''
  const friends = Array.isArray(raw.friends)
    ? raw.friends.filter((id): id is string => typeof id === 'string')
    : []
  if (!friend_code) return null
  return { user_id, friend_code, friends }
}

function randomFriendCode(): string {
  let out = ''
  for (let i = 0; i < 6; i++) {
    out += FRIEND_CODE_ALPHABET[Math.floor(Math.random() * FRIEND_CODE_ALPHABET.length)]!
  }
  return out
}

/** Stable fixed bot XP values for seeded leaderboard rows. */
export function botXpForUser(_viewerUserId: string, botIndex: number): number {
  const name = FRIEND_BOT_NAMES[botIndex]
  if (!name) return 0
  return FIXED_FRIEND_BOT_XP[name]
}

export function buildFriendsLeaderboardRows(
  viewerUserId: string,
  viewerName: string,
  viewerXp: number,
  friendRows: { user_id: string; display_name: string; xp: number }[],
): FriendLeaderboardRow[] {
  const real: FriendLeaderboardRow[] = [
    {
      id: viewerUserId,
      name: viewerName,
      xp: viewerXp,
      isMe: true,
      isBot: false,
      avatarShade: 0,
    },
    ...friendRows.map((f, i) => ({
      id: f.user_id,
      name: f.display_name,
      xp: f.xp,
      isMe: false,
      isBot: false,
      avatarShade: (i % 4) + 1,
    })),
  ]
  const rows = [...real]
  for (let i = 0; i < FRIEND_BOT_NAMES.length; i++) {
    const name = FRIEND_BOT_NAMES[i]!
    rows.push({
      id: `bot-${name.toLowerCase()}`,
      name,
      xp: botXpForUser(viewerUserId, i),
      isMe: false,
      isBot: true,
      avatarShade: i + 2,
    })
  }
  return rows.sort((a, b) => b.xp - a.xp)
}

export async function fetchFriendProfile(userId: string): Promise<FriendProfileRow | null> {
  const { data, error } = await supabase
    .from(FRIENDSHIPS_TABLE)
    .select('user_id, friend_code, friends')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) {
    if (import.meta.env.DEV) console.warn('[Apex] fetchFriendProfile', error.message)
    return null
  }
  if (!data) return null
  return normalizeFriendProfile(data as Record<string, unknown>)
}

export async function ensureFriendProfile(userId: string): Promise<FriendProfileRow | null> {
  const existing = await fetchFriendProfile(userId)
  if (existing) return existing
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = randomFriendCode()
    const { data, error } = await supabase
      .from(FRIENDSHIPS_TABLE)
      .insert({ user_id: userId, friend_code: code, friends: [] })
      .select('user_id, friend_code, friends')
      .single()
    if (!error && data) {
      return normalizeFriendProfile(data as Record<string, unknown>)
    }
    if (error?.code !== '23505' && import.meta.env.DEV) {
      console.warn('[Apex] ensureFriendProfile', error.message)
    }
  }
  return fetchFriendProfile(userId)
}

export async function fetchTendedUserFriendCode(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from(TENDED_USER_STATE_TABLE)
    .select('friend_code')
    .eq('user_id', userId)
    .eq('date_key', TENDED_FRIEND_CODE_PROFILE_DATE_KEY)
    .maybeSingle()
  if (error) {
    if (import.meta.env.DEV) console.warn('[Apex] fetchTendedUserFriendCode', error.message)
    return null
  }
  const code =
    typeof data?.friend_code === 'string' ? data.friend_code.trim().toUpperCase() : ''
  return code || null
}

async function upsertFriendshipsFriendCode(userId: string, code: string): Promise<void> {
  const existing = await fetchFriendProfile(userId)
  if (existing?.friend_code === code) return
  if (existing) {
    await supabase
      .from(FRIENDSHIPS_TABLE)
      .update({ friend_code: code, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
    return
  }
  await supabase.from(FRIENDSHIPS_TABLE).insert({ user_id: userId, friend_code: code, friends: [] })
}

/** Read friend code from tended_user_state; create, persist, and return one if missing. */
export async function ensureTendedUserFriendCode(userId: string): Promise<string | null> {
  const existing = await fetchTendedUserFriendCode(userId)
  if (existing) {
    void upsertFriendshipsFriendCode(userId, existing).catch(() => {})
    return existing
  }
  const now = new Date().toISOString()
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase()
    const { error } = await supabase.from(TENDED_USER_STATE_TABLE).upsert(
      {
        user_id: userId,
        date_key: TENDED_FRIEND_CODE_PROFILE_DATE_KEY,
        friend_code: code,
        workout_done: false,
        volume_lbs: 0,
        muscle_groups_trained: [],
        water_oz: 0,
        source_app: 'apex',
        updated_at: now,
      },
      { onConflict: 'user_id,date_key' },
    )
    if (!error) {
      void upsertFriendshipsFriendCode(userId, code).catch(() => {})
      return code
    }
    if (import.meta.env.DEV && error.code !== '23505') {
      console.warn('[Apex] ensureTendedUserFriendCode', error.message)
    }
  }
  return fetchTendedUserFriendCode(userId)
}

export async function fetchLeaderboardXpForUsers(userIds: string[]): Promise<
  { user_id: string; display_name: string; xp: number }[]
> {
  if (!userIds.length) return []
  const { data, error } = await supabase
    .from(LEADERBOARD_TABLE)
    .select('user_id, display_name, xp')
    .in('user_id', userIds)
  if (error) {
    if (import.meta.env.DEV) console.warn('[Apex] fetchLeaderboardXpForUsers', error.message)
    return []
  }
  return (data ?? [])
    .map((row) => ({
      user_id: String(row.user_id),
      display_name: typeof row.display_name === 'string' ? row.display_name : 'Athlete',
      xp: Number(row.xp) || 0,
    }))
    .filter((r) => r.user_id)
}

export type AddFriendResult = 'ok' | 'not_found' | 'self' | 'already' | 'error'

export async function addFriendByCode(userId: string, rawCode: string): Promise<AddFriendResult> {
  const code = rawCode.trim().toUpperCase()
  if (!code) return 'not_found'
  await ensureFriendProfile(userId)
  const { error: rpcError } = await supabase.rpc('apex_add_friend_by_code', { p_code: code })
  if (!rpcError) return 'ok'

  const profile = await fetchFriendProfile(userId)
  const { data: target, error: lookupError } = await supabase
    .from(FRIENDSHIPS_TABLE)
    .select('user_id, friends')
    .eq('friend_code', code)
    .maybeSingle()
  if (lookupError || !target) return 'not_found'
  const friendId = String(target.user_id)
  if (friendId === userId) return 'self'
  const myFriends = profile?.friends ?? []
  if (myFriends.includes(friendId)) return 'already'
  const { error: updateError } = await supabase
    .from(FRIENDSHIPS_TABLE)
    .update({ friends: [...myFriends, friendId], updated_at: new Date().toISOString() })
    .eq('user_id', userId)
  if (updateError) {
    if (import.meta.env.DEV) console.warn('[Apex] addFriendByCode', rpcError?.message, updateError.message)
    return 'error'
  }
  return 'ok'
}

/** Delete this user's synced Apex rows from Supabase tables used by the app. */
export async function clearUserSupabaseData(userId: string): Promise<void> {
  const ops = [
    Promise.resolve(supabase.from(WORKOUT_DATA_TABLE).delete().eq('user_id', userId)),
    Promise.resolve(supabase.from(LEADERBOARD_TABLE).delete().eq('user_id', userId)),
    Promise.resolve(supabase.from(READINESS_CHECKS_TABLE).delete().eq('user_id', userId)),
    Promise.resolve(supabase.from(WORKOUT_SESSIONS_TABLE).delete().eq('user_id', userId)),
    Promise.resolve(supabase.from(WORKOUT_MOOD_CHECKINS_TABLE).delete().eq('user_id', userId)),
    Promise.resolve(supabase.from(DELOAD_WEEKS_TABLE).delete().eq('user_id', userId)),
    Promise.resolve(supabase.from(BODY_MEASUREMENTS_TABLE).delete().eq('user_id', userId)),
    Promise.resolve(supabase.from(TENDED_USER_STATE_TABLE).delete().eq('user_id', userId)),
    Promise.resolve(supabase.from(FRIENDSHIPS_TABLE).delete().eq('user_id', userId)),
    Promise.resolve(supabase.from(TRAINER_CODES_TABLE).delete().eq('trainer_user_id', userId)),
    Promise.resolve(supabase.from(TRAINER_CONNECTIONS_TABLE).delete().eq('client_user_id', userId)),
    Promise.resolve(supabase.from(TRAINER_CONNECTIONS_TABLE).delete().eq('trainer_user_id', userId)),
    Promise.resolve(supabase.from(TRAINER_NOTES_TABLE).delete().eq('client_user_id', userId)),
    Promise.resolve(supabase.from(TRAINER_NOTES_TABLE).delete().eq('trainer_user_id', userId)),
    Promise.resolve(supabase.from(TRAINER_ASSIGNED_WORKOUTS_TABLE).delete().eq('trainer_user_id', userId)),
    Promise.resolve(supabase.from(TRAINER_ASSIGNED_WORKOUTS_TABLE).delete().eq('client_user_id', userId)),
  ]
  await Promise.allSettled(ops)
}

export async function upsertAssignedWorkout(
  workout: Omit<AssignedWorkout, 'id' | 'createdAt'>,
): Promise<void> {
  const { error } = await supabase.from(TRAINER_ASSIGNED_WORKOUTS_TABLE).upsert(
    {
      trainer_user_id: workout.trainerUserId,
      client_user_id: workout.clientUserId,
      date_key: workout.dateKey,
      title: workout.title,
      exercises: workout.exercises,
      notes: workout.notes,
    },
    { onConflict: 'trainer_user_id,client_user_id,date_key' },
  )
  if (error) throw error
}

export async function fetchAssignedWorkoutForClient(
  clientUserId: string,
  dateKey: string,
): Promise<AssignedWorkout | null> {
  const { data, error } = await supabase
    .from(TRAINER_ASSIGNED_WORKOUTS_TABLE)
    .select('*')
    .eq('client_user_id', clientUserId)
    .eq('date_key', dateKey)
    .maybeSingle()
  if (error || !data) return null
  return {
    id: data.id,
    trainerUserId: data.trainer_user_id,
    clientUserId: data.client_user_id,
    dateKey: data.date_key,
    title: data.title,
    exercises: data.exercises ?? [],
    notes: data.notes ?? '',
    createdAt: data.created_at,
  }
}

export async function fetchAssignedWorkoutsForTrainer(
  trainerUserId: string,
  clientUserId: string,
): Promise<AssignedWorkout[]> {
  const { data, error } = await supabase
    .from(TRAINER_ASSIGNED_WORKOUTS_TABLE)
    .select('*')
    .eq('trainer_user_id', trainerUserId)
    .eq('client_user_id', clientUserId)
    .order('date_key', { ascending: false })
    .limit(30)
  if (error || !Array.isArray(data)) return []
  return data.map((d) => ({
    id: d.id,
    trainerUserId: d.trainer_user_id,
    clientUserId: d.client_user_id,
    dateKey: d.date_key,
    title: d.title,
    exercises: d.exercises ?? [],
    notes: d.notes ?? '',
    createdAt: d.created_at,
  }))
}
