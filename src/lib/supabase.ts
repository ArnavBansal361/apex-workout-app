import { createClient } from '@supabase/supabase-js'
import type { User } from '@supabase/supabase-js'
import { filterClientStateForTrainer, type TrainerSharePrefs } from './trainer'
import type { AppPersisted, ReadinessLogEntry, WorkoutMoodLogEntry } from '../types'
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
