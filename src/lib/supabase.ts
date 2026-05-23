import { createClient } from '@supabase/supabase-js'
import type { User } from '@supabase/supabase-js'
import { filterClientStateForTrainer } from './trainer'
import type { AppPersisted } from '../types'
import { streakCurrent, workoutDaysFromLogs } from './achievements'
import { alignScheduleWeek, migrateCustomExercises } from './persist'
import { weightToLbs } from './volumeStats'
import { weekStartMonday } from './dates'

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
      data: state,
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
  const trainerId = await resolveTrainerIdByCode(code)
  if (!trainerId) throw new Error('Invalid trainer code')
  if (trainerId === clientUserId) throw new Error('You cannot connect to yourself')

  const { data, error } = await supabase
    .from(TRAINER_CONNECTIONS_TABLE)
    .upsert(
      {
        trainer_user_id: trainerId,
        client_user_id: clientUserId,
        trainer_code: code.trim().toUpperCase(),
        connected_at: new Date().toISOString(),
      },
      { onConflict: 'client_user_id' },
    )
    .select('id, trainer_user_id, client_user_id, trainer_code, connected_at')
    .single()

  if (error || !data) throw new Error(error?.message ?? 'Could not connect to trainer')
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
