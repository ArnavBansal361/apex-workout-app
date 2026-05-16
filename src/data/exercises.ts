import type { Exercise, ExerciseHelp, MuscleGroup } from '../types'

function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

const RAW: [string, MuscleGroup][] = [
  ['Bench Press', 'Chest'],
  ['Incline Bench Press', 'Chest'],
  ['Dumbbell Bench Press', 'Chest'],
  ['Seated Bench Press', 'Chest'],
  ['Pec Fly', 'Chest'],
  ['Cable Fly', 'Chest'],
  ['Chest Press Machine', 'Chest'],
  ['Push Up', 'Chest'],
  ['Squat', 'Legs'],
  ['Leg Press', 'Legs'],
  ['Leg Extension', 'Legs'],
  ['Leg Curl', 'Legs'],
  ['Hamstring Curl', 'Legs'],
  ['Calf Raises', 'Legs'],
  ['Inner Thigh Machine', 'Legs'],
  ['Outer Thigh Machine', 'Legs'],
  ['Bulgarian Split Squat', 'Legs'],
  ['Romanian Deadlift', 'Legs'],
  ['Hip Thrust', 'Legs'],
  ['Deadlift', 'Back'],
  ['Lat Pulldown', 'Back'],
  ['Seated Cable Row', 'Back'],
  ['Rows', 'Back'],
  ['Pull-ups', 'Back'],
  ['Cable Row', 'Back'],
  ['T-Bar Row', 'Back'],
  ['Overhead Press', 'Shoulders'],
  ['Shoulder Press', 'Shoulders'],
  ['Lateral Raises', 'Shoulders'],
  ['Face Pull', 'Shoulders'],
  ['Arnold Press', 'Shoulders'],
  ['Reverse Fly', 'Shoulders'],
  ['Dumbbell Curl', 'Arms'],
  ['Barbell Curl', 'Arms'],
  ['Seated Dumbbell Curl', 'Arms'],
  ['Hammer Curl', 'Arms'],
  ['Tricep Rope Pushdown', 'Arms'],
  ['Dips', 'Arms'],
  ['Skull Crushers', 'Arms'],
  ['Diamond Push Ups', 'Arms'],
  ['Plank', 'Core'],
  ['Crunch Machine', 'Core'],
  ['Sit Up', 'Core'],
  ['Russian Twist', 'Core'],
  ['Leg Raise', 'Core'],
  ['Mountain Climbers', 'Core'],
  ['Elliptical', 'Cardio'],
  ['Treadmill', 'Cardio'],
  ['Rowing Machine', 'Cardio'],
  ['Battle Ropes', 'Cardio'],
  ['Jump Rope', 'Cardio'],
  ['Cycling', 'Cardio'],
  ['Stair Climber', 'Cardio'],
  ['Swimming', 'Cardio'],
  ['Hip Flexor Stretch', 'Stretches'],
  ['Hamstring Stretch', 'Stretches'],
  ['Quad Stretch', 'Stretches'],
  ['Shoulder Stretch', 'Stretches'],
  ['Chest Stretch', 'Stretches'],
  ['Pigeon Pose', 'Stretches'],
  ["Child's Pose", 'Stretches'],
  ['Cat-Cow', 'Stretches'],
  ['Downward Dog', 'Stretches'],
  ['Spinal Twist', 'Stretches'],
]

export const EXERCISES: Exercise[] = RAW.map(([name, muscleGroup]) => ({
  id: slug(name),
  name,
  muscleGroup,
}))

export const EXERCISE_BY_ID: Record<string, Exercise> = Object.fromEntries(
  EXERCISES.map((e) => [e.id, e]),
)

const DIAGRAM_HINTS: Record<MuscleGroup, string> = {
  Chest:
    'Picture yourself lying on a bench like a flat table: bar or dumbbells travel straight over your chest, not your face. Elbows stay slightly tucked, feet planted.',
  Back:
    'Imagine a letter V: you pull handles or a bar toward your lower ribs while your chest lifts slightly. Shoulders stay down away from your ears.',
  Legs:
    'Think of sitting back into a chair: hips go back first on squats and hinges, knees track over toes, whole foot stays glued to the floor.',
  Shoulders:
    'Arms make a wide arc like a snow angel to the sides, but stop before your lower back arches. Keep ribs from flaring forward.',
  Arms:
    'Upper arm stays still like a hinge bolted in place; only the forearm opens and closes. No swinging the torso for momentum.',
  Core:
    'Body forms one long line from head to heels (plank) or you curl the ribs toward hips (crunch) without yanking the neck.',
  Cardio:
    'Machine or road in front of you: tall posture, relaxed shoulders, steady rhythm — like a metronome you can breathe through.',
  Stretches:
    'Side view: gentle forward fold or hip opener; no bouncing — think slow melt, not rubber band snap.',
}

const MUSCLE_HINTS: Record<MuscleGroup, Omit<ExerciseHelp, 'diagramDescription'>> = {
  Chest: {
    formTips:
      'Keep shoulders packed, ribs down, and press in a smooth line. Feel your chest working, not just your front shoulders.',
    commonMistakes:
      'Flaring elbows too wide, arching the low back hard, bouncing the bar off the chest, or shrugging the shoulders.',
    beginnerAdvice:
      'Start light, own the range you control, and add weight only when every rep looks the same.',
  },
  Back: {
    formTips:
      'Pull with the elbows, squeeze the shoulder blades together, and keep the neck long. Control the negative.',
    commonMistakes:
      'Using momentum, cutting range short, shrugging at the top, or pulling with the biceps only.',
    beginnerAdvice:
      'Think “back first,” keep reps smooth, and pause briefly at the peak contraction.',
  },
  Legs: {
    formTips:
      'Track knees over toes, keep feet planted, and brace your core. Move hips and knees together.',
    commonMistakes:
      'Knees caving in, heels lifting, folding at the waist only, or rushing depth you cannot control.',
    beginnerAdvice:
      'Practice bodyweight first, film from the side once, and progress depth slowly.',
  },
  Shoulders: {
    formTips:
      'Keep ribs down, move in a controlled arc, and stop before the low back takes over.',
    commonMistakes:
      'Overarching, shrugging ears to shoulders, or using weights that force bad swings.',
    beginnerAdvice:
      'Use a mirror for alignment, lighter loads, and a tempo you can hear in your head.',
  },
  Arms: {
    formTips:
      'Lock the upper arm in place, move only at the elbow, and squeeze at the end range.',
    commonMistakes:
      'Swinging the torso, cutting the bottom stretch, or letting shoulders roll forward.',
    beginnerAdvice:
      'Chase clean reps over heavy cheating; feel the muscle, not the joint grind.',
  },
  Core: {
    formTips:
      'Breathe steady, keep the spine neutral for your chosen move, and move with control.',
    commonMistakes:
      'Pulling on the neck, holding breath until you turn red, or speeding up to hide fatigue.',
    beginnerAdvice:
      'Short sets with perfect form beat long sloppy sets. Add time or reps gradually.',
  },
  Cardio: {
    formTips:
      'Warm up easy, find a pace you can talk through at first, then build. Keep posture tall.',
    commonMistakes:
      'Starting too fast, leaning on handles too hard, or skipping cooldown.',
    beginnerAdvice:
      'Consistency beats intensity early. Aim for steady sessions you can repeat tomorrow.',
  },
  Stretches: {
    formTips:
      'Breathe slow, relax into the stretch, and never force sharp pain. Small daily doses help.',
    commonMistakes:
      'Bouncing hard, holding breath, or comparing your range to someone else’s.',
    beginnerAdvice:
      'Hold gentle tension, switch sides evenly, and note what feels easier week to week.',
  },
}

export function getExerciseHelp(ex: Exercise): ExerciseHelp {
  const h = MUSCLE_HINTS[ex.muscleGroup]
  return {
    formTips: `${ex.name}: ${h.formTips}`,
    commonMistakes: h.commonMistakes,
    beginnerAdvice: h.beginnerAdvice,
    diagramDescription: `${ex.name} — ${DIAGRAM_HINTS[ex.muscleGroup]}`,
  }
}
