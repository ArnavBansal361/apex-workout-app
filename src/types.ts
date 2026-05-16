export type MuscleGroup =
  | 'Chest'
  | 'Back'
  | 'Legs'
  | 'Shoulders'
  | 'Arms'
  | 'Core'
  | 'Cardio'
  | 'Stretches'

export type TabId = 'today' | 'exercises' | 'schedule' | 'profile'

/** Reorderable / toggleable blocks on the Today tab (see `todayLayout`). */
export type TodaySectionId =
  | 'daily-motivation'
  | 'weekly-volume'
  | 'muscle-balance'
  | 'gym-tracker'
  | 'cardio-tracker'
  | 'my-plan'
  | 'todays-log'

export interface TodayLayoutPersist {
  order: TodaySectionId[]
  hidden: TodaySectionId[]
}

export type ProfileAvatarId =
  | 'dumbbell'
  | 'flame'
  | 'lightning'
  | 'mountain'
  | 'trophy'
  | 'star'
  | 'shield'
  | 'crown'

export interface Exercise {
  id: string
  name: string
  muscleGroup: MuscleGroup
  /** Optional demo GIF (e.g. user-pasted URL for custom exercises). */
  gifUrl?: string
}

export interface ExerciseHelp {
  formTips: string
  commonMistakes: string
  beginnerAdvice: string
  diagramDescription: string
}

export interface WeightedSetLog {
  kind: 'weighted'
  id: string
  exerciseId: string
  exerciseName: string
  muscleGroup: MuscleGroup
  weight: number | null
  bodyweight: boolean
  reps: number
  sets: number
  note: string
  at: number
  isPr: boolean
}

export interface TimedSetLog {
  kind: 'timed'
  id: string
  exerciseId: string
  exerciseName: string
  muscleGroup: MuscleGroup
  durationSec: number
  note: string
  at: number
  isPr: boolean
}

export type SetLog = WeightedSetLog | TimedSetLog

/** User-editable fields when updating an existing set (`id` / `at` unchanged). */
export type SetLogEditPayload =
  | Pick<WeightedSetLog, 'kind' | 'weight' | 'bodyweight' | 'reps' | 'sets' | 'note'>
  | Pick<TimedSetLog, 'kind' | 'durationSec' | 'note'>

export interface CardioEntry {
  id: string
  name: string
  /** Duration in minutes (fractional allowed). */
  durationMinutes: number | null
  at: number
}

export interface BodyweightEntry {
  id: string
  at: number
  value: number
}

export interface ScheduleDay {
  dateKey: string
  workoutName: string
  notes: string
  aiSummary?: string
  /** Google Calendar event id when this day was synced to the user’s primary calendar */
  googleCalendarEventId?: string
  /** Exercises planned for this day (picked in schedule editor) */
  plannedExerciseIds: string[]
}

export interface WorkoutTemplate {
  id: string
  name: string
  exerciseIds: string[]
  createdAt: number
}

/** Friend entries store username + weekly sets (you report friends’ totals for the leaderboard). */
export interface FriendEntry {
  id: string
  username: string
  weeklySets: number
}

export interface Settings {
  displayName: string
  fitnessGoals: string
  unit: 'lbs' | 'kg'
  restTimerSeconds: number
  restTimerEnabled: boolean
  accentColor: string
  trainerMode: boolean
  trainerNotes: string
  /** Selected profile icon; null shows initials. */
  profileAvatarId: ProfileAvatarId | null
}

export interface GymSessionPersist {
  active: boolean
  mode: 'stopwatch' | 'manual'
  startedAt: number | null
  /** When mode is manual, user-set session start timestamp */
  manualStartedAt: number | null
  pauseStartedAt: number | null
  accumulatedPauseMs: number
}

export interface CardioTimerPersist {
  running: boolean
  baseMs: number
  segmentStartAt: number | null
}

export interface RestTimerPersist {
  endAt: number | null
  dismissed: boolean
}

export interface ChatMessage {
  id: string
  role: 'user' | 'model'
  text: string
  at: number
}

export interface AppPersisted {
  version: 1
  setLogs: SetLog[]
  todayPlanExerciseIds: string[]
  /** Starred exercises in the library (persisted). */
  favoriteExerciseIds: string[]
  hiddenExerciseIds: string[]
  /** User-created exercises (merged with built-in catalog in the library). */
  customExercises: Exercise[]
  schedule: ScheduleDay[]
  templates: WorkoutTemplate[]
  settings: Settings
  bodyweightLogs: BodyweightEntry[]
  cardioEntries: CardioEntry[]
  gymSession: GymSessionPersist
  cardioTimer: CardioTimerPersist
  achievements: string[]
  restTimer: RestTimerPersist
  chatMessages: ChatMessage[]
  /** week start Monday YYYY-MM-DD for schedule anchor */
  scheduleWeekStart: string
  friends: FriendEntry[]
  /** False until user finishes first-launch onboarding. */
  onboardingComplete: boolean
  /** Lifetime XP for level progression (awarded on sets, PRs, completed gym sessions). */
  lifetimeXp: number
  /** Custom Today tab section order and visibility. */
  todayLayout: TodayLayoutPersist
  /** After user responds to the one-time notification permission prompt (either choice). */
  notificationPromptDone: boolean
  /** Monday `dateKey` of the week we last showed the Sunday weekly summary notification for. */
  lastWeeklySummaryNotifWeekStart: string | null
}

export const DEFAULT_SETTINGS: Settings = {
  displayName: '',
  fitnessGoals: '',
  unit: 'lbs',
  restTimerSeconds: 90,
  restTimerEnabled: true,
  accentColor: '#3b82f6',
  trainerMode: false,
  trainerNotes: '',
  profileAvatarId: null,
}

export const ACHIEVEMENT_DEFS = [
  { id: 'first-pr', title: 'First PR', description: 'Hit your first personal record.' },
  { id: 'streak-7', title: '7 Day Streak', description: 'Train at least once per day for 7 days.' },
  { id: 'sets-100', title: '100 Total Sets', description: 'Log 100 sets in total.' },
  { id: 'workouts-30', title: '30 Workouts', description: 'Complete 30 workout days.' },
  { id: 'six-groups', title: 'Full-Body Day', description: 'Hit 6 muscle groups in one session.' },
  { id: 'bw-7', title: 'Scale Watcher', description: 'Log bodyweight 7 times.' },
  { id: 'first-workout', title: 'First Workout', description: 'Log your first set.' },
  { id: 'night-owl', title: 'Night Owl', description: 'Log a workout after 9pm.' },
  { id: 'early-bird', title: 'Early Bird', description: 'Log a workout before 7am.' },
] as const
