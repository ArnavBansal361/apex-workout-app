import type { TrainingMode } from './lib/trainingMode'

export type MuscleGroup =
  | 'Chest'
  | 'Back'
  | 'Legs'
  | 'Shoulders'
  | 'Arms'
  | 'Core'
  | 'Cardio'
  | 'Stretches'

export type EquipmentType = 'Barbell' | 'Dumbbell' | 'Cable' | 'Machine' | 'Bodyweight'

export type TabId = 'today' | 'library' | 'plan' | 'ai' | 'me'

/** Reorderable / toggleable blocks on the Today tab (see `todayLayout`). */
export type TodaySectionId =
  | 'daily-motivation'
  | 'spotify-player'
  | 'weekly-volume'
  | 'muscle-balance'
  | 'gym-tracker'
  | 'cardio-tracker'
  | 'water-tracker'
  | 'sleep-tracker'
  | 'nutrition-tracker'
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
  equipment: EquipmentType
  /** Optional demo GIF (e.g. user-pasted URL for custom exercises). */
  gifUrl?: string
  /** User- or AI-authored help (custom exercises). */
  formTips?: string
  commonMistakes?: string
  beginnerAdvice?: string
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

export type PrCelebrationData = {
  exerciseName: string
  detail: string
  dateLabel: string
  headlineValue: string
  headlineUnit: string
  pillLast: string | null
  pillDelta: string | null
}

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

export interface WaterLogEntry {
  id: string
  /** Calendar day the intake counts toward (YYYY-MM-DD). */
  dateKey: string
  oz: number
  at: number
}

export interface SleepLogEntry {
  id: string
  /** Morning date after the sleep night (YYYY-MM-DD). */
  dateKey: string
  durationMinutes: number
  quality: 1 | 2 | 3 | 4 | 5
  at: number
}

export interface MealLogEntry {
  id: string
  dateKey: string
  name: string
  calories: number
  proteinG: number
  carbsG: number
  fatG: number
  at: number
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
  /** Optional coach tone for this day (set in Plan tab). */
  trainingMode?: TrainingMode | null
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
  /** PR overlay, rest-timer haptics, workout-complete haptics (set log haptic always on). */
  celebrationsEnabled: boolean
  /** Desktop/in-app reminder 5 min after a completed workout (if no recent meal logged). */
  postWorkoutProteinNotificationEnabled: boolean
  trainerMode: boolean
  trainerNotes: string
  /** Selected profile icon; null shows initials. */
  profileAvatarId: ProfileAvatarId | null
  /** Daily water intake goal in fluid ounces. */
  waterGoalOz: number
  macroGoalCalories: number
  macroGoalProteinG: number
  macroGoalCarbsG: number
  macroGoalFatG: number
  /** Local-only hormonal cycle tracking (never synced to Supabase). */
  cycleTrackingEnabled: boolean
  /** Prompt to open Spotify when a gym session starts. */
  gymSessionSpotifyPromptEnabled: boolean
  /** Watch geolocation and prompt when near saved gym (browser Geolocation API). */
  gymLocationDetectionEnabled: boolean
  gymLocationLat: number | null
  gymLocationLng: number | null
  gymLocationLabel: string
  /** Sync read/write with Apple Health on iOS (enabled after permission grant). */
  appleHealthSyncEnabled: boolean
}

/** Cached Apple Health metrics for the current calendar day. */
export type AppleHealthTodayMetrics = {
  dateKey: string
  steps: number | null
  activeCalories: number | null
  heartRateBpm: number | null
  restingHeartRateBpm: number | null
  hrvMs: number | null
  sleepMinutes: number | null
  syncedAt: number
}

export interface GymSessionPersist {
  active: boolean
  mode: 'stopwatch' | 'manual'
  startedAt: number | null
  /** When mode is manual, user-set session start timestamp */
  manualStartedAt: number | null
  pauseStartedAt: number | null
  accumulatedPauseMs: number
  /** Copied from today's Plan assignment when a gym session starts. */
  trainingMode: TrainingMode | null
}

export interface CardioTimerPersist {
  running: boolean
  baseMs: number
  segmentStartAt: number | null
}

export interface RestTimerPersist {
  endAt: number | null
  startedAt: number | null
  durationSec: number
  dismissed: boolean
}

/** Base64 image attached to a coach user message (Anthropic vision). */
export type CoachChatImage = {
  mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
  data: string
}

/** Local copy of a readiness check (also stored in Supabase when signed in). */
export type ReadinessLogEntry = {
  dateKey: string
  recovery: number
  /** 1–5; omitted on logs before cognitive fatigue was added */
  cognitiveFatigue?: number
  stress: number
  sleepQuality: number
  combinedScore: number
  recommendation: 'full' | 'moderate' | 'recovery'
  at: number
}

/** Local copy of a post-workout mood check-in. */
export type WorkoutMoodLogEntry = {
  dateKey: string
  moodBefore: number
  moodAfter: number
  moodLift: number
  at: number
}

/** Post-workout feel + energy ratings (synced in user_workout_data). */
export type PostWorkoutCheckinLogEntry = {
  dateKey: string
  feelRating: number
  energyRating: number
  at: number
  trainingMode?: TrainingMode | null
}

export interface ChatMessage {
  id: string
  role: 'user' | 'model'
  text: string
  at: number
  /** Model reply from workout-plan generation — show Apply to today. */
  workoutPlan?: boolean
  /** User-attached photo (form check, meal, etc.). */
  image?: CoachChatImage
}

/** Two exercise ids linked as a superset in today's plan. */
export type TodaySupersetPair = [string, string]

export interface AppPersisted {
  version: 1
  setLogs: SetLog[]
  todayPlanExerciseIds: string[]
  /** Paired exercises in My Plan (order follows plan list). */
  todaySupersetPairs: TodaySupersetPair[]
  /** Starred exercises in the library (persisted). */
  favoriteExerciseIds: string[]
  hiddenExerciseIds: string[]
  /** User-created exercises (merged with built-in catalog in the library). */
  customExercises: Exercise[]
  schedule: ScheduleDay[]
  templates: WorkoutTemplate[]
  settings: Settings
  bodyweightLogs: BodyweightEntry[]
  waterLogs: WaterLogEntry[]
  sleepLogs: SleepLogEntry[]
  readinessLogs: ReadinessLogEntry[]
  workoutMoodLogs: WorkoutMoodLogEntry[]
  postWorkoutCheckins: PostWorkoutCheckinLogEntry[]
  mealLogs: MealLogEntry[]
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
  /** After first Apple Health permission prompt post-onboarding. */
  appleHealthPermissionPromptDone: boolean
  /** Latest Apple Health sync for today (iOS). */
  appleHealthToday: AppleHealthTodayMetrics | null
  /** Monday `dateKey` of the week we last showed the Sunday weekly summary notification for. */
  lastWeeklySummaryNotifWeekStart: string | null
  /** Week start (Mon YYYY-MM-DD) when user dismissed burnout warnings on Insights. */
  burnoutDismissedWeekStart: string | null
  /** Week start (Mon YYYY-MM-DD) when the one-per-week streak shield was consumed. */
  streakShieldUsedWeekStart: string | null
  /** Week start when user activated a deload week (logging prefills at −40% weight). */
  deloadActiveWeekStart: string | null
  /** Week start when the deload suggestion banner was dismissed. */
  deloadDismissedWeekStart: string | null
  /** Day 1 of current cycle (YYYY-MM-DD). Local only — never synced to Supabase. */
  cycleStartDateKey: string | null
  /** Synced to cloud so trainers can respect client privacy toggles. */
  trainerShare?: {
    workoutLogs: boolean
    bodyweight: boolean
    personalRecords: boolean
  }
}

export const DEFAULT_WATER_GOAL_OZ = 64
export const WATER_LOG_INCREMENT_OZ = 8

export const DEFAULT_MACRO_GOAL_CALORIES = 2200
export const DEFAULT_MACRO_GOAL_PROTEIN_G = 150
export const DEFAULT_MACRO_GOAL_CARBS_G = 200
export const DEFAULT_MACRO_GOAL_FAT_G = 65

export const DEFAULT_SETTINGS: Settings = {
  displayName: '',
  fitnessGoals: '',
  unit: 'lbs',
  restTimerSeconds: 90,
  restTimerEnabled: true,
  celebrationsEnabled: true,
  postWorkoutProteinNotificationEnabled: true,
  trainerMode: false,
  trainerNotes: '',
  profileAvatarId: null,
  waterGoalOz: DEFAULT_WATER_GOAL_OZ,
  macroGoalCalories: DEFAULT_MACRO_GOAL_CALORIES,
  macroGoalProteinG: DEFAULT_MACRO_GOAL_PROTEIN_G,
  macroGoalCarbsG: DEFAULT_MACRO_GOAL_CARBS_G,
  macroGoalFatG: DEFAULT_MACRO_GOAL_FAT_G,
  cycleTrackingEnabled: false,
  gymSessionSpotifyPromptEnabled: true,
  gymLocationDetectionEnabled: false,
  gymLocationLat: null,
  gymLocationLng: null,
  gymLocationLabel: '',
  appleHealthSyncEnabled: false,
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
  { id: 'iron-will', title: 'Iron Will', description: 'Log 7 days in a row.' },
  { id: 'volume-king', title: 'Volume King', description: 'Log over 50,000 lbs in a single week.' },
  { id: 'consistency', title: 'Consistency', description: 'Log workouts for 4 weeks straight.' },
  { id: 'pr-machine', title: 'PR Machine', description: 'Hit 10 personal records total.' },
  { id: 'variety-pack', title: 'Variety Pack', description: 'Train 5 different muscle groups in one week.' },
  { id: 'marathon-session', title: 'Marathon Session', description: 'Log a workout lasting over 2 hours.' },
  { id: 'century-club', title: 'Century Club', description: 'Log 100 total sessions.' },
  { id: 'beast-mode', title: 'Beast Mode', description: 'Log 20 or more sets in a single session.' },
  { id: 'comeback-kid', title: 'Comeback Kid', description: 'Return after a 7+ day gap and log a full session.' },
  { id: 'perfect-week', title: 'Perfect Week', description: 'Train every single day Mon–Sun.' },
] as const
