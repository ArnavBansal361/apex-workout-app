import { equipmentForExercise } from '../lib/equipment'
import type { Exercise, ExerciseHelp, MuscleGroup } from '../types'
import { MORE_EXERCISES } from './exercisesMore'
import { getStretchExerciseHelp, STRETCH_EXERCISE_ENTRIES } from './stretches'

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
  ['Cable Crossover', 'Chest'],
  ['Decline Bench Press', 'Chest'],
  ['Landmine Press', 'Chest'],
  ['Svend Press', 'Chest'],
  ['Dumbbell Pullover', 'Chest'],
  ['Low Cable Fly', 'Chest'],
  ['High Cable Fly', 'Chest'],
  ['Chest Dip', 'Chest'],
  ['Neck Press', 'Chest'],
  ['Floor Press', 'Chest'],
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
  ['Front Squat', 'Legs'],
  ['Hack Squat', 'Legs'],
  ['Goblet Squat', 'Legs'],
  ['Box Squat', 'Legs'],
  ['Sumo Deadlift', 'Legs'],
  ['Glute Bridge', 'Legs'],
  ['Barbell Hip Thrust', 'Legs'],
  ['Nordic Curl', 'Legs'],
  ['Sissy Squat', 'Legs'],
  ['Step Up', 'Legs'],
  ['Walking Lunge', 'Legs'],
  ['Reverse Lunge', 'Legs'],
  ['Lateral Lunge', 'Legs'],
  ['Single Leg Press', 'Legs'],
  ['Leg Press Calf Raise', 'Legs'],
  ['Donkey Calf Raise', 'Legs'],
  ['Seated Calf Raise', 'Legs'],
  ['Wall Sit', 'Legs'],
  ['Terminal Knee Extension', 'Legs'],
  ['Banded Clamshell', 'Legs'],
  ['Deadlift', 'Back'],
  ['Lat Pulldown', 'Back'],
  ['Seated Cable Row', 'Back'],
  ['Rows', 'Back'],
  ['Pull-ups', 'Back'],
  ['Cable Row', 'Back'],
  ['T-Bar Row', 'Back'],
  ['Barbell Row', 'Back'],
  ['Pendlay Row', 'Back'],
  ['Chest-Supported Row', 'Back'],
  ['Single Arm Dumbbell Row', 'Back'],
  ['Meadows Row', 'Back'],
  ['Straight Arm Pulldown', 'Back'],
  ['Good Morning', 'Back'],
  ['Rack Pull', 'Back'],
  ['Snatch Grip Deadlift', 'Back'],
  ['Deficit Deadlift', 'Back'],
  ['Seal Row', 'Back'],
  ['Cable Pullover', 'Back'],
  ['Overhead Press', 'Shoulders'],
  ['Shoulder Press', 'Shoulders'],
  ['Lateral Raises', 'Shoulders'],
  ['Face Pull', 'Shoulders'],
  ['Arnold Press', 'Shoulders'],
  ['Reverse Fly', 'Shoulders'],
  ['Dumbbell Lateral Raise', 'Shoulders'],
  ['Cable Lateral Raise', 'Shoulders'],
  ['Upright Row', 'Shoulders'],
  ['Front Raise', 'Shoulders'],
  ['Barbell Overhead Press', 'Shoulders'],
  ['Push Press', 'Shoulders'],
  ['Z Press', 'Shoulders'],
  ['Landmine Lateral Raise', 'Shoulders'],
  ['Dumbbell Shrugs', 'Shoulders'],
  ['Barbell Shrugs', 'Shoulders'],
  ['Behind the Neck Press', 'Shoulders'],
  ['Prone Y Raise', 'Shoulders'],
  ['Prone T Raise', 'Shoulders'],
  ['Dumbbell Curl', 'Arms'],
  ['Barbell Curl', 'Arms'],
  ['Seated Dumbbell Curl', 'Arms'],
  ['Hammer Curl', 'Arms'],
  ['Tricep Rope Pushdown', 'Arms'],
  ['Dips', 'Arms'],
  ['Skull Crushers', 'Arms'],
  ['Diamond Push Ups', 'Arms'],
  ['Incline Dumbbell Curl', 'Arms'],
  ['Cable Curl', 'Arms'],
  ['Preacher Curl', 'Arms'],
  ['Concentration Curl', 'Arms'],
  ['Zottman Curl', 'Arms'],
  ['Reverse Curl', 'Arms'],
  ['Cable Hammer Curl', 'Arms'],
  ['EZ Bar Curl', 'Arms'],
  ['Spider Curl', 'Arms'],
  ['Close Grip Bench Press', 'Arms'],
  ['Cable Tricep Pushdown', 'Arms'],
  ['Overhead Tricep Extension', 'Arms'],
  ['Single Arm Overhead Extension', 'Arms'],
  ['JM Press', 'Arms'],
  ['Tate Press', 'Arms'],
  ['Reverse Grip Pushdown', 'Arms'],
  ['Tricep Kickback', 'Arms'],
  ['Wrist Curl', 'Arms'],
  ['Reverse Wrist Curl', 'Arms'],
  ["Farmer's Carry", 'Arms'],
  ['Plank', 'Core'],
  ['Crunch Machine', 'Core'],
  ['Sit Up', 'Core'],
  ['Russian Twist', 'Core'],
  ['Leg Raise', 'Core'],
  ['Mountain Climbers', 'Core'],
  ['Dead Bug', 'Core'],
  ['Bird Dog', 'Core'],
  ['Hollow Hold', 'Core'],
  ['Ab Wheel Rollout', 'Core'],
  ['Cable Crunch', 'Core'],
  ['Hanging Leg Raise', 'Core'],
  ['Hanging Knee Raise', 'Core'],
  ['Dragon Flag', 'Core'],
  ['Pallof Press', 'Core'],
  ['Woodchop', 'Core'],
  ['Side Plank', 'Core'],
  ['Copenhagen Plank', 'Core'],
  ['Reverse Crunch', 'Core'],
  ['Toes to Bar', 'Core'],
  ['L-Sit', 'Core'],
  ['Landmine Twist', 'Core'],
  ['Stir the Pot', 'Core'],
  ['Bear Crawl', 'Core'],
  ['McGill Curl Up', 'Core'],
  ['Elliptical', 'Cardio'],
  ['Treadmill', 'Cardio'],
  ['Rowing Machine', 'Cardio'],
  ['Battle Ropes', 'Cardio'],
  ['Jump Rope', 'Cardio'],
  ['Cycling', 'Cardio'],
  ['Stair Climber', 'Cardio'],
  ['Swimming', 'Cardio'],
  ...STRETCH_EXERCISE_ENTRIES,
  ...MORE_EXERCISES,
]

function buildExerciseCatalog(entries: [string, MuscleGroup][]): Exercise[] {
  const seen = new Set<string>()
  const out: Exercise[] = []
  for (const [name, muscleGroup] of entries) {
    const id = slug(name)
    if (seen.has(id)) continue
    seen.add(id)
    out.push({ id, name, muscleGroup, equipment: equipmentForExercise(name, muscleGroup) })
  }
  return out
}

export const EXERCISES: Exercise[] = buildExerciseCatalog(RAW)

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

/** Built-in library additions — full cues per movement (ids from `slug(name)`). */
const EXTENDED_EXERCISE_HELP: Record<string, ExerciseHelp> = {
  'cable-crossover': {
    formTips:
      'Step forward slightly with a soft split stance; hands meet low-to-high or high-to-low in a smooth arc in front of the sternum. Keep shoulders down, slight elbow bend fixed, and squeeze chest at crossover without shrugging.',
    commonMistakes:
      'Turning it into a front raise, over-bending elbows into a press path, snapping the cables, or leaning the torso way forward for fake range.',
    beginnerAdvice:
      'Light weight and slow tempos teach the line of pull; pause 1s when hands touch.',
    diagramDescription:
      'Front view: arms wide like wings closing on a hinge at the elbows — cables meeting mid-chest.',
  },
  'decline-bench-press': {
    formTips:
      'Set pads so you do not slide; eyes under the bar, feet hooked or planted firm. Touch lower chest with elbows slightly tucked; press back toward the rack along the same path.',
    commonMistakes:
      'Wild elbow flare, bouncing off the chest, lifting the butt high, or losing foot purchase on the pad.',
    beginnerAdvice:
      'Treat decline like flat bench with less ego on weight until the groove feels automatic.',
    diagramDescription:
      'Side view: torso angled head-down on bench, bar traveling on a shallow diagonal to the lower chest.',
  },
  'landmine-press': {
    formTips:
      'End of the bar angled from a corner or landmine base; hold the sleeve at chest height with both hands or one. Brace core and press up and slightly forward along the bar’s arc.',
    commonMistakes:
      'Hyperextending the low back to finish, chicken-necking forward, or letting elbows fly out sideways.',
    beginnerAdvice:
      'Half-kneel to tame the arch; progress load only if the finish feels stable in the shoulder.',
    diagramDescription:
      'Angled bar path from upper chest toward the top corner — pressing on a rainbow arc.',
  },
  'svend-press': {
    formTips:
      'Pinch one small plate or use cables: palms flat squeezing together at mid-chest, then press straight out while maintaining inward pressure. Feel pecs working, not shoulders dominating.',
    commonMistakes:
      'Relaxing the squeeze, shrugging up, or pressing so high it becomes a front raise.',
    beginnerAdvice:
      'Great finisher — use light loads and chase the burn with strict inner-hand pressure.',
    diagramDescription:
      'Front view: hands stacked vertical like praying toward the wall — horizontal press from sternum.',
  },
  'dumbbell-pullover': {
    formTips:
      'Shoulder blades set on the bench or floor; soft elbow bend, dumbbell over chest. Lower in an arc behind the head until you feel a stretch across lats and chest, then pull back to stack over shoulders.',
    commonMistakes:
      'Deep low back arch, bending elbows into a skull crusher, or going too deep with heavy weight.',
    beginnerAdvice:
      'Start light; rib cage stays calm — think “long arms” not “heavy pullover contest.”',
    diagramDescription:
      'Side view: long lever from chest over face toward floor behind head — sweeping semicircle.',
  },
  'low-cable-fly': {
    formTips:
      'Same hinge as DB fly: slight bend at elbows locked in, hands travel wide in a hugging arc to meet in front of chest. Stand tall with ribs down.',
    commonMistakes:
      'Shrugging, bending elbows more at the bottom, or using torso swing to close the handles.',
    beginnerAdvice:
      'Single-arm crosses teach control before you use both stacks.',
    diagramDescription:
      'Front view: low cables, arms sweeping up-in toward midline like scooping water.',
  },
  'high-cable-fly': {
    formTips:
      'Elbows fixed soft bend; bring handles down and together under the pec line without rolling shoulders forward. Finish with pinkies slightly in.',
    commonMistakes:
      'Dropping into depression shrug, turning it into a press-down, or over-flaring ribs.',
    beginnerAdvice:
      'Step closer to the stack if you feel front-delt burn only.',
    diagramDescription:
      'Front view: cables from above, arms carving a wide V down to handshake height.',
  },
  'chest-dip': {
    formTips:
      'Torso leaned forward ~20–30°, elbows track back — descend until stretch across chest without shoulder pinch. Press up while keeping forward lean.',
    commonMistakes:
      'Upright triceps dip, collapsing shoulders forward, or bouncing deep without control.',
    beginnerAdvice:
      'Band-assisted or machine dip until you own 8 slow reps.',
    diagramDescription:
      'Side view: body angled over hands — downward path carries chest toward handles.',
  },
  'neck-press': {
    formTips:
      'Bar lowered toward the neck/clavicle line with elbows moderately flared but wrist stacked; press back to over-the-face lockout with upper back pinned.',
    commonMistakes:
      'Collapsing wrists, losing scap contact with bench, or touching too high on throat.',
    beginnerAdvice:
      'Lighter weight and thumb jog groove build confidence before loading.',
    diagramDescription:
      'Side view: bar path slightly higher toward neck than standard bench — elbow plane opened.',
  },
  'floor-press': {
    formTips:
      'Lying on floor, upper arms rest at pause each rep — drive elbows into floor flare moderately, press to lockout without losing contact.',
    commonMistakes:
      'Bouncing elbows off floor, bridging hips high, or losing wrist stacking.',
    beginnerAdvice:
      'Great for triceps + lockout; pause kills momentum — own the first inch off the floor.',
    diagramDescription:
      'Side view: shortened ROM — upper arm ends when triceps meet floor, press vertical.',
  },
  'barbell-row': {
    formTips:
      'Hinge hips back like RDL, chest up, pull bar to lower ribs with elbows skimming sides. Brace and avoid using legs to jerk the bar.',
    commonMistakes:
      'Standing too upright, rounding hard, or re-bending knees to heave weight.',
    beginnerAdvice:
      'Pause 1s at chest on lighter sets to feel lats.',
    diagramDescription:
      'Side view: hinged torso near horizontal, bar path straight to belt line.',
  },
  'pendlay-row': {
    formTips:
      'Torso parallel each rep from dead stop on floor; explode pull to sternum, return flat. Abs stay braced, no bounce between reps.',
    commonMistakes:
      'Rising hips first, short ROM, or slamming plates for momentum.',
    beginnerAdvice:
      'Treat as power skill — moderate load and perfect flat-back stops.',
    diagramDescription:
      'Side view: bar rests on floor between explosive horizontal pulls.',
  },
  'chest-supported-row': {
    formTips:
      'Chest on incline bench pad, hang arms straight, row handles to lower chest with elbows out slightly. Squeeze blades, lower under control.',
    commonMistakes:
      'Peeling chest off pad, shrugging at top, or shortening the negative.',
    beginnerAdvice:
      'Removes low-back limiter — chase strict reps.',
    diagramDescription:
      'Side view: prone on sloped bench, elbows rowing toward hip pockets.',
  },
  'single-arm-dumbbell-row': {
    formTips:
      'Hand + knee on bench, free foot out for tripod; pull DB toward hip pocket with neutral spine. Finish with lat squeeze, not twist.',
    commonMistakes:
      'Rotating open to cheat, yanking with trap, or rounding the hanging shoulder.',
    beginnerAdvice:
      'Match sides; start without body English.',
    diagramDescription:
      'Side view: horizontal torso, elbow driving back tight to ribs.',
  },
  'meadows-row': {
    formTips:
      'Landmine or angled — stagger stance, pull end of bar toward hip with slight body english from rear leg drive; lead with elbow.',
    commonMistakes:
      'Twisting spine hard, rowing too high toward armpit, or losing balance forward.',
    beginnerAdvice:
      'Moderate loads; feel lat “wrap” around the rib cage.',
    diagramDescription:
      'Angled bar, one hand — pull from floor angle up into hip pocket.',
  },
  'straight-arm-pulldown': {
    formTips:
      'Arms straight soft elbows, cable high — arc hands down to thighs by flexing shoulder extension, not bending elbows. Chest tall.',
    commonMistakes:
      'Turning into triceps pushdown, shrugging up, or leaning heavy.',
    beginnerAdvice:
      'Light cable, pause at thighs 1s.',
    diagramDescription:
      'Side view: long arms sweeping from high pulley to pockets — lat isolation arc.',
  },
  'good-morning': {
    formTips:
      'Bar on upper back like squat; unlock hips back, shins vertical, hinge until torso is horizontal-ish while keeping neutral spine.',
    commonMistakes:
      'Squatting the knees forward, rounding low back, or looking at ceiling.',
    beginnerAdvice:
      'Pipe or PVC first — depth follows hamstring control.',
    diagramDescription:
      'Side view: hip hinge with bar over rear delts — straight line head-to-tail maintained.',
  },
  'rack-pull': {
    formTips:
      'Set pins mid-shin to knee; brace core, drive floor away with hips and knees extending together, lockout tall shoulders.',
    commonMistakes:
      'Hitching, soft lats, or hyperextending low back at top.',
    beginnerAdvice:
      'Overload helper for grip and traps — keep bar close.',
    diagramDescription:
      'Side view: shortened deadlift from pins — vertical shin, torso rising with bar.',
  },
  'snatch-grip-deadlift': {
    formTips:
      'Wide grip on bar, hips lower than conventional, chest up — pull slack then drive, keeping bar close through long range.',
    commonMistakes:
      'Hips shooting up first, soft upper back, or drifting forward.',
    beginnerAdvice:
      'Widen until you can still set lats without shoulder pain.',
    diagramDescription:
      'Front view: wide hands, torso more upright start — emphasizes upper back.',
  },
  'deficit-deadlift': {
    formTips:
      'Stand on stable plates 1–3"; same hinge pattern with extra knee flex needed; own deeper start position.',
    commonMistakes:
      'Rounding to break floor, losing balance forward off platform.',
    beginnerAdvice:
      'Reduced weight vs floor pull — film lateral view.',
    diagramDescription:
      'Side view: ankles elevated — deeper hip setup before pull.',
  },
  'seal-row': {
    formTips:
      'Prone flat bench height set so arms hang full, pull DBs/bar to bench underside with horizontal torso locked.',
    commonMistakes:
      'Bench too low (no ROM) or high (shoulders shrug), bouncing.',
    beginnerAdvice:
      'Eliminates momentum — strict hypertrophy tool.',
    diagramDescription:
      'Side view: parallel to floor, rowing perpendicular to gravity.',
  },
  'cable-pullover': {
    formTips:
      'Rope or straight bar high pulley, slight hip hinge, elbows soft — arc bar down toward thighs using lat extension.',
    commonMistakes:
      'Excessive elbow bend into pressdown, arching low back.',
    beginnerAdvice:
      'Keep ribs quiet; exhale through the long stretch overhead.',
    diagramDescription:
      'Side view: arms overhead lengthening before sweeping down — lat cable sweep.',
  },
  'front-squat': {
    formTips:
      'Bar racked on front delts with elbows high; sit between hips and ankles, torso upright, knees track toes.',
    commonMistakes:
      'Elbows dropping (bar rolls), caving torso, knees caving in.',
    beginnerAdvice:
      'Pause squats with light weight teach rack comfort.',
    diagramDescription:
      'Side view: vertical torso over midfoot — bar in front rack.',
  },
  'hack-squat': {
    formTips:
      'Feet shoulder-width on platform; unlock knees and hips together, depth you control, press without locking violently.',
    commonMistakes:
      'Butt lifting off pad, knees caving, depth bouncing.',
    beginnerAdvice:
      'Machine guides path — chase smooth reps.',
    diagramDescription:
      'Angled sled — body slides along rails, thighs to chest line.',
  },
  'goblet-squat': {
    formTips:
      'Hold DB/KB at chest, elbows inside knees; squat deep with heels down, use elbow to spread knees.',
    commonMistakes:
      'Leaning back, heels lifting, kettlebell drifting away from sternum.',
    beginnerAdvice:
      'Best first deep squat teacher — counterweight helps posture.',
    diagramDescription:
      'Front view: weight vertical over midfoot — elbows between thighs at bottom.',
  },
  'box-squat': {
    formTips:
      'Sit to box controlled, pause light touch without relax, drive up same path; sit back first.',
    commonMistakes:
      'Plopping, soft core, rocking forward off box.',
    beginnerAdvice:
      'Higher box first — lower as pattern sticks.',
    diagramDescription:
      'Side view: horizontal target behind hips — teaches hinge + depth.',
  },
  'sumo-deadlift': {
    formTips:
      'Wide stance toes out, grip inside knees, chest up, push floor apart with knees tracking toes.',
    commonMistakes:
      'Hips high start, rounding upper back, knees caving.',
    beginnerAdvice:
      'Shin vertical when bar breaks floor — film.',
    diagramDescription:
      'Front view: wide feet, hands centered — tall torso start.',
  },
  'glute-bridge': {
    formTips:
      'Shoulders on bench or floor, feet under knees; drive hips up squeezing glutes, rib cage down.',
    commonMistakes:
      'Hyperarching low back, pushing through toes only, neck craning.',
    beginnerAdvice:
      'Hold top 2s; bodyweight before loading lap.',
    diagramDescription:
      'Side view: straight line knee-hip-shoulder at top.',
  },
  'barbell-hip-thrust': {
    formTips:
      'Upper back on bench, bar pad on hips; vertical shin at top, thrust without rib flare.',
    commonMistakes:
      'Pushing with quads only, chin to chest, sliding feet.',
    beginnerAdvice:
      'Pause reps build burn — load slowly.',
    diagramDescription:
      'Side view: horizontal bench contact — hip extension peak.',
  },
  'nordic-curl': {
    formTips:
      'Knees padded, ankles anchored; lower torso long from knees, pull hamstrings to return or catch with hands.',
    commonMistakes:
      'Breaking at hips, flaring ribs, uncontrolled face plant.',
    beginnerAdvice:
      'Use band or partial ROM first.',
    diagramDescription:
      'Side view: bodyLine from knee — eccentric hamstring lean.',
  },
  'sissy-squat': {
    formTips:
      'Heels elevated or fixed, knees travel forward, torso leans back slightly as you descend — quad emphasis.',
    commonMistakes:
      'Knee pain from forcing range, losing balance backward.',
    beginnerAdvice:
      'Hold rack; partial range until strong.',
    diagramDescription:
      'Side view: knees over toes extreme with upright-ish thighs line.',
  },
  'step-up': {
    formTips:
      'Full foot on box, drive through heel of top leg, stand tall without pushing off bottom leg.',
    commonMistakes:
      'Springing off floor foot, rounded back, shallow box.',
    beginnerAdvice:
      'Bodyweight or low box — control knee tracking.',
    diagramDescription:
      'Side view: single-leg vertical finish on box.',
  },
  'walking-lunge': {
    formTips:
      'Short steps, torso tall, back knee kisses floor; push through front heel to next step.',
    commonMistakes:
      'Overstriding, torso tipping, knee caving.',
    beginnerAdvice:
      'Hands on hips for balance cues.',
    diagramDescription:
      'Front view: alternating 90° knee shapes traveling forward.',
  },
  'reverse-lunge': {
    formTips:
      'Step back softly, descend vertical shin front leg, drive floor with front heel to stand.',
    commonMistakes:
      'Leaning forward, tiny step (knee over toes crash).',
    beginnerAdvice:
      'Easier on knees than forward lunge for many.',
    diagramDescription:
      'Side view: rear foot drapes back — most load in front leg quad/glute.',
  },
  'lateral-lunge': {
    formTips:
      'Step wide side, sit hip back on working leg, other leg stays straight; push back to center.',
    commonMistakes:
      'Knee diving in, rounding over, short stance.',
    beginnerAdvice:
      'Bodyweight — feel adductor stretch on straight leg.',
    diagramDescription:
      'Front view: side step squat hybrid.',
  },
  'single-leg-press': {
    formTips:
      'Foot mid-platform; lower until knee ~90° without pelvis twisting off seat; press evenly.',
    commonMistakes:
      'Locking hard, butt curling up, uneven depth sides.',
    beginnerAdvice:
      'Match reps L/R.',
    diagramDescription:
      'Side view: one foot on sled — stable torso on pad.',
  },
  'leg-press-calf-raise': {
    formTips:
      'Ball of feet on platform edge, slight unlock knees; press through big toe mound to full plantarflex, control down.',
    commonMistakes:
      'Bouncing, locking knees fully rigid, half ROM.',
    beginnerAdvice:
      'High rep pump tool — go slow.',
    diagramDescription:
      'Feet low on sled — calves in leg press.',
  },
  'donkey-calf-raise': {
    formTips:
      'Hinge forward hips, partner or belt load on low back; calves raise with straight legs.',
    commonMistakes:
      'Bending knees like squat, rounding hard.',
    beginnerAdvice:
      'Smith or machine variant if solo.',
    diagramDescription:
      'Torso angled down — ankle pump vertical.',
  },
  'seated-calf-raise': {
    formTips:
      'Knee bent 90°, pad on thighs; raise heels high, pause, stretch soleus bottom.',
    commonMistakes:
      'Bouncing, cutting stretch, too heavy.',
    beginnerAdvice:
      'Soleus loves slow eccentrics.',
    diagramDescription:
      'Seated — bent knee calf raise.',
  },
  'wall-sit': {
    formTips:
      'Back flat on wall, thighs parallel if possible, knees over ankles, breathe steady.',
    commonMistakes:
      'Hands on thighs cheating, feet too close to wall.',
    beginnerAdvice:
      'Time goal — add seconds weekly.',
    diagramDescription:
      'Side view: vertical back slide sit.',
  },
  'terminal-knee-extension': {
    formTips:
      'Band anchored behind knee; extend knee locking quad from partial flex against tension.',
    commonMistakes:
      'Hyperextending joint painfully, hip hiking.',
    beginnerAdvice:
      'Rehab/volume friendly — light band.',
    diagramDescription:
      'Side view: knee final degrees extension against pull.',
  },
  'banded-clamshell': {
    formTips:
      'Side-lying hips stacked, knees bent; lift top knee like a book opening without rolling hips back.',
    commonMistakes:
      'Rocking torso, feet separating, tiny ROM.',
    beginnerAdvice:
      'Glute med primer — higher reps.',
    diagramDescription:
      'Side view: knees open hinge — miniband above knees.',
  },
  'dumbbell-lateral-raise': {
    formTips:
      'Slight lean forward, soft elbows, raise to shoulder height leading with pinkies; control down.',
    commonMistakes:
      'Using hip pop, going too high into trap pinch, shrugging.',
    beginnerAdvice:
      'Thumbs slightly down cue can help side delt.',
    diagramDescription:
      'Front view: arms abduct in scapular plane — shallow V path.',
  },
  'cable-lateral-raise': {
    formTips:
      'Cross-body or low pulley — constant tension; same lead with outer head of delt, pause at top.',
    commonMistakes:
      'Torso twist for momentum, pulling with opposite oblique.',
    beginnerAdvice:
      'Single-arm teaches line of pull.',
    diagramDescription:
      'Side view: cable crossing body — arc away from stack.',
  },
  'upright-row': {
    formTips:
      'Pull bar/DBs up along body to sternum height with elbows high but comfortable; wrists neutral if possible.',
    commonMistakes:
      'Craning neck, elbows too flared for shoulder anatomy, heaving.',
    beginnerAdvice:
      'Wider grip or cables if impingement feel.',
    diagramDescription:
      'Front view: elbows track out on high pull — vertical row.',
  },
  'front-raise': {
    formTips:
      'Arms straight soft, raise to eye level in smooth tempo; alternate or together with ribs down.',
    commonMistakes:
      'Swinging from low back, going overhead unintentionally.',
    beginnerAdvice:
      'Light weight — tempo 3-1-3.',
    diagramDescription:
      'Front view: ascending lever from thighs to shoulder height.',
  },
  'barbell-overhead-press': {
    formTips:
      'Bar un-racked at clavicle, brace glutes and ribs; press vertical path moving head slightly back then through.',
    commonMistakes:
      'Pressing forward-star, ribs flaring, low-back arch.',
    beginnerAdvice:
      'Mirror or video for bar path.',
    diagramDescription:
      'Side view: straight vertical from shoulder to lockout.',
  },
  'push-press': {
    formTips:
      'Dip shallow with vertical torso, drive hips and extend legs to launch bar, finish strict OH press.',
    commonMistakes:
      'Forward dip, pressing with face, soft lockout.',
    beginnerAdvice:
      'Timing drill with PVC first.',
    diagramDescription:
      'Side view: leg drive then arms finish — bar floats up.',
  },
  'z-press': {
    formTips:
      'Seated floor legs wide, no leg drive, strict press overhead from shoulder; tall spine.',
    commonMistakes:
      'Low-back round, using lean back.',
    beginnerAdvice:
      'Exposes weak core — moderate loads.',
    diagramDescription:
      'Seated vertical — no back support, press strict.',
  },
  'landmine-lateral-raise': {
    formTips:
      'Hold barbell end, arc arm up and out with slight lean away; resist rotation.',
    commonMistakes:
      'Shrugging hard, cutting ROM short.',
    beginnerAdvice:
      'Great if free-weight laterals irritate wrists.',
    diagramDescription:
      'Angled bar arc — lateral with constant leverage change.',
  },
  'dumbbell-shrugs': {
    formTips:
      'Weight hangs, shrug straight up “hide neck in shoulders,” pause, lower slowly.',
    commonMistakes:
      'Rolling shoulders, using hip bounce.',
    beginnerAdvice:
      'Hold peak 1s.',
    diagramDescription:
      'Front view: vertical elevation only — no circle.',
  },
  'barbell-shrugs': {
    formTips:
      'Mixed or overhand grip at hip height, pull shoulders straight up, squeeze traps, lower with control.',
    commonMistakes:
      'Using leg bounce, rolling shoulders, excessive layback.',
    beginnerAdvice:
      'Straps optional for overload when grip limits.',
    diagramDescription:
      'Front view: bar at arms length — elevate shoulders only.',
  },
  'behind-the-neck-press': {
    formTips:
      'Bar rests on rear delts, elbows under bar; press vertical as mobility allows, head forward slightly through.',
    commonMistakes:
      'Forcing ROM with sharp pain, craning neck, flaring ribs.',
    beginnerAdvice:
      'Skip if stiff shoulders — landmine or DB neutral alternatives.',
    diagramDescription:
      'Side view: bar travels behind head line — strict vertical if healthy.',
  },
  'prone-y-raise': {
    formTips:
      'Chest on bench/incline, thumbs up, raise arms in Y shape to ear height without shrugging.',
    commonMistakes:
      'Hyperextending neck, using momentum, going too heavy.',
    beginnerAdvice:
      'Light — rear delt and lower trap primer.',
    diagramDescription:
      'Side view on bench — arms split overhead angled forward.',
  },
  'prone-t-raise': {
    formTips:
      'Same setup, arms abduct to T with thumbs up, squeeze mid-back.',
    commonMistakes:
      'Lifting chest off pad, cranking neck.',
    beginnerAdvice:
      'Pair with Y raises for posture.',
    diagramDescription:
      'Side view: horizontal arm line from torso — T shape.',
  },
  'incline-dumbbell-curl': {
    formTips:
      'Back on incline, arms hang vertical; curl with minimal shoulder movement, supinate smoothly.',
    commonMistakes:
      'Elbows drifting forward, cutting ROM, arching off bench.',
    beginnerAdvice:
      'Long head emphasis — stretch matters.',
    diagramDescription:
      'Side view on incline — curl from full hang.',
  },
  'cable-curl': {
    formTips:
      'Elbows pinned at sides, cable low stack; flex elbows keeping upper arm vertical.',
    commonMistakes:
      'Stepping back to swing, shoulder flexion cheating.',
    beginnerAdvice:
      'Constant tension — slow negatives.',
    diagramDescription:
      'Front view: line of pull from floor stack upward to shoulders.',
  },
  'preacher-curl': {
    formTips:
      'Armpit in pad, curl to nose/chin line without hips driving into pad edge.',
    commonMistakes:
      'Half ROM, losing contact at bottom stretch.',
    beginnerAdvice:
      'Pause bottom 1s for biceps stretch.',
    diagramDescription:
      'Side view: upper arm on pad slope — strict elbow flexion.',
  },
  'concentration-curl': {
    formTips:
      'Elbow inside thigh, curl DB to shoulder without torso lean.',
    commonMistakes:
      'Using free arm, curling across body.',
    beginnerAdvice:
      'Peak contraction squeeze — isolation classic.',
    diagramDescription:
      'Seated lean forward — single-arm vertical curl.',
  },
  'zottman-curl': {
    formTips:
      'Curl supinated top, rotate pronated, lower slowly emphasizing eccentric brachialis.',
    commonMistakes:
      'Dropping fast on negative, cutting rotation.',
    beginnerAdvice:
      'Moderate weight — control flip.',
    diagramDescription:
      'Wrist rotation mid rep — curl up twist down.',
  },
  'reverse-curl': {
    formTips:
      'Pronated grip bar/DB, curl keeping wrists neutral; stops before body English.',
    commonMistakes:
      'Excessive elbow drift forward, heaving.',
    beginnerAdvice:
      'Thick bar gentle on wrists if sore.',
    diagramDescription:
      'Front view: overhand narrow curl path.',
  },
  'cable-hammer-curl': {
    formTips:
      'Rope or neutral handle, elbows at ribs; flex without shoulder swing.',
    commonMistakes:
      'Splitting rope outward too early, shrugging.',
    beginnerAdvice:
      'Brachialis + long head balance.',
    diagramDescription:
      'Neutral grip cable — vertical forearm path.',
  },
  'ez-bar-curl': {
    formTips:
      'Shoulder-width on cambered bar; curl smooth keeping bar close to body.',
    commonMistakes:
      'Hip thrust, incomplete extension.',
    beginnerAdvice:
      'Wrist-friendly angle for many lifters.',
    diagramDescription:
      'Front view: angled bar — elbows stay back.',
  },
  'spider-curl': {
    formTips:
      'Chest on steep incline, arms hang straight down; curl peak squeeze without torso lift.',
    commonMistakes:
      'Short ROM, elbows drifting forward.',
    beginnerAdvice:
      'Strict short-head pump — lighter loads.',
    diagramDescription:
      'Prone on bench — vertical upper arm.',
  },
  'close-grip-bench-press': {
    formTips:
      'Hands inside shoulder width, elbows tucked; touch lower chest, press vertical path.',
    commonMistakes:
      'Flaring elbows, wrists bent back, bouncing off chest.',
    beginnerAdvice:
      'Elbows stacked under wrists — triceps lead.',
    diagramDescription:
      'Side view: narrow grip bar path to lower chest.',
  },
  'cable-tricep-pushdown': {
    formTips:
      'Elbows pinned ribs, extend fully with rope or bar without shoulders rolling forward.',
    commonMistakes:
      'Elbow flare, leaning torso over bar, partial extension.',
    beginnerAdvice:
      'Split rope ends at bottom for extra long head.',
    diagramDescription:
      'Side view: elbow hinge straight down cable.',
  },
  'overhead-tricep-extension': {
    formTips:
      'DB or cable overhead, elbows tight toward ears, extend without flaring ribs.',
    commonMistakes:
      'Elbows splitting wide, low-back arch.',
    beginnerAdvice:
      'Single-arm if bilateral is uncomfortable.',
    diagramDescription:
      'Side view: forearms pivot from vertical stack.',
  },
  'single-arm-overhead-extension': {
    formTips:
      'One DB overhead, opposing hand supports elbow lightly; isolate triceps extension.',
    commonMistakes:
      'Torso side lean, shoulder dumping forward.',
    beginnerAdvice:
      'Sit tall on bench for stability.',
    diagramDescription:
      'Side view: single long head line — elbow high.',
  },
  'jm-press': {
    formTips:
      'Skull crusher hybrid — tuck elbows, lower to chin/neck line then press close like close-grip bench segment.',
    commonMistakes:
      'Drifting elbows wide, cutting ROM.',
    beginnerAdvice:
      'Moderate loads — strong triceps builder.',
    diagramDescription:
      'Side view: forearms vertical transition to press path.',
  },
  'tate-press': {
    formTips:
      'Flat bench DBs stacked over chest, elbows flared wide, extend DBs vertically by “pulling” elbows in arc.',
    commonMistakes:
      'Losing control on bottom, colliding DBs.',
    beginnerAdvice:
      'Light — feel long head stretch to lockout.',
    diagramDescription:
      'Top view: elbows out — vertical DB path from wide tuck.',
  },
  'reverse-grip-pushdown': {
    formTips:
      'Underhand bar, elbows at sides, extend without wrist collapse.',
    commonMistakes:
      'Shrugging, curling wrists in, half reps.',
    beginnerAdvice:
      'Great medial head focus — smooth tempo.',
    diagramDescription:
      'Front view: supinated cable pushdown.',
  },
  'tricep-kickback': {
    formTips:
      'Flat back hinge, upper arm parallel floor; extend only at elbow to straight line behind.',
    commonMistakes:
      'Dropping upper arm, rotating torso.',
    beginnerAdvice:
      'Cable easier than DB for tension.',
    diagramDescription:
      'Side view: horizontal humerus — hinge at elbow only.',
  },
  'wrist-curl': {
    formTips:
      'Forearms on thighs palms up; flex wrists through full ROM without lifting forearms.',
    commonMistakes:
      'Using bounce, cutting bottom range.',
    beginnerAdvice:
      'High rep forearm pump.',
    diagramDescription:
      'Seated — wrists curling bar upward resting on knees.',
  },
  'reverse-wrist-curl': {
    formTips:
      'Pronated narrow grip on bar, extend wrists up same thigh support.',
    commonMistakes:
      'Elbows lifting off thighs, shrugging.',
    beginnerAdvice:
      'Balances flexors — easy on neck.',
    diagramDescription:
      'Palms-down wrist extension over knees.',
  },
  'farmers-carry': {
    formTips:
      'Heavy DBs/KBs at sides, tall chest, short steps, traps engaged; breathe steady for distance or time.',
    commonMistakes:
      'Leaning sideways, shrugging ears, soft core.',
    beginnerAdvice:
      'Match sides; add time before weight.',
    diagramDescription:
      'Side view: upright walk — weights hanging vertical.',
  },
  'dead-bug': {
    formTips:
      'Supine ribs down, 90° hips/knees; reach heel and opposite arm long keeping low back pinned.',
    commonMistakes:
      'Arching as limbs extend, holding breath, rushing.',
    beginnerAdvice:
      'Small ranges until back static.',
    diagramDescription:
      'Supine dead-bug — alternating limb reach.',
  },
  'bird-dog': {
    formTips:
      'All fours neutral spine; slide opposite arm and leg to horizontal, hips square.',
    commonMistakes:
      'Rotating pelvis open, dipping low back.',
    beginnerAdvice:
      'Hold 5s — build anti-rotation.',
    diagramDescription:
      'Side view: cross extension stable tabletop.',
  },
  'hollow-hold': {
    formTips:
      'Lie supine, crunch ribs to pelvis, legs lift slightly, arms overhead — low back pressed to floor.',
    commonMistakes:
      'Legs too low arching lumbar, chin to chest.',
    beginnerAdvice:
      'Bent-knee regression first.',
    diagramDescription:
      'Banana-stiff body curved — only shoulder blades off? light lift.',
  },
  'ab-wheel-rollout': {
    formTips:
      'Knees or standing; roll wheel forward with lats engaged, pull back with core not hips piking early.',
    commonMistakes:
      'Collapsing low back, staying too shallow always, rushing.',
    beginnerAdvice:
      'Wall-limited ROM first.',
    diagramDescription:
      'Side view: wheel travel lengthening body line.',
  },
  'cable-crunch': {
    formTips:
      'Kneeling high cable, hands at head sides; flex spine curling ribs toward pelvis, not hips sitting back.',
    commonMistakes:
      'Pulling with arms, hip flexing instead of spinal flexion.',
    beginnerAdvice:
      'Exhale fully each crunch.',
    diagramDescription:
      'Kneeling — rope toward floor as spine rounds.',
  },
  'hanging-leg-raise': {
    formTips:
      'Hang active shoulders, posterior pelvic tilt to lift legs; control swing.',
    commonMistakes:
      'Using momentum, leaving shoulders passive, over-arching.',
    beginnerAdvice:
      'Knee tucks before straight legs.',
    diagramDescription:
      'Front view: legs rise with slight posterior tilt.',
  },
  'hanging-knee-raise': {
    formTips:
      'Same hang, flex knees toward chest with tuck of pelvis.',
    commonMistakes:
      'Swinging like a pendulum, no tilt.',
    beginnerAdvice:
      'Pause 1s at top before lowering slowly.',
    diagramDescription:
      'Bent leg hang crunch.',
  },
  'dragon-flag': {
    formTips:
      'Bench, grip behind head, body rigid plank lowering slowly with only upper back contact.',
    commonMistakes:
      'Breaking at hips, uncontrolled drop.',
    beginnerAdvice:
      'Advanced — negatives only at first.',
    diagramDescription:
      'Side view: straight body lever on bench.',
  },
  'pallof-press': {
    formTips:
      'Cable at chest, step sideways, brace and press hands straight out resisting rotation.',
    commonMistakes:
      'Twisting torso, feet too narrow.',
    beginnerAdvice:
      'Anti-rotation staple — light band works.',
    diagramDescription:
      'Side view: horizontal press vs lateral pull.',
  },
  'woodchop': {
    formTips:
      'Cable high to low or low to high — rotate through thoracic, hips drive, arms straight-ish.',
    commonMistakes:
      'Arms-only twist, foot pivot forgotten on high-low.',
    beginnerAdvice:
      'Light load for motor learning.',
    diagramDescription:
      'Diagonal cable chop across body.',
  },
  'side-plank': {
    formTips:
      'Elbow under shoulder, body straight, hips high; breathe.',
    commonMistakes:
      'Hips sagging, neck craned.',
    beginnerAdvice:
      'Knee-down regression.',
    diagramDescription:
      'Side view: straight line elbow-hip-ankle.',
  },
  'copenhagen-plank': {
    formTips:
      'Side plank top foot on bench inner edge, bottom leg straight; keep hips lifted.',
    commonMistakes:
      'Hips dumping, pain in adductor — reduce lever.',
    beginnerAdvice:
      'Short lever knee support variant.',
    diagramDescription:
      'Side plank with top leg fixed high — adductor loaded.',
  },
  'reverse-crunch': {
    formTips:
      'Lie back, curl pelvis lifting hips slightly off floor with knees toward face.',
    commonMistakes:
      'Using leg throw momentum, neck straining.',
    beginnerAdvice:
      'Exhale as hips tuck — small range beats big kicks.',
    diagramDescription:
      'Supine posterior tilt lift — low abs.',
  },
  'toes-to-bar': {
    formTips:
      'Hang, posterior tilt, lift legs to bar with control; scale to knees-to-chest.',
    commonMistakes:
      'Huge kip first rep, inactive shoulders.',
    beginnerAdvice:
      'Strict beats kipped early.',
    diagramDescription:
      'Hanging straight leg raise to bar.',
  },
  'l-sit': {
    formTips:
      'Parallettes or floor, press hands down, legs extended horizontal; scap depressed.',
    commonMistakes:
      'Rounded upper back, piked hips.',
    beginnerAdvice:
      'Tuck holds first.',
    diagramDescription:
      'Front view: L frame between hands — compression.',
  },
  'landmine-twist': {
    formTips:
      'Landmine anchored, hands on end at chest; rotate hips and trunk pivoting bar side to side with braced core.',
    commonMistakes:
      'Arms-only twist, knees straight locking rotation.',
    beginnerAdvice:
      'Light — control arc.',
    diagramDescription:
      'Standing rotational press with angled bar.',
  },
  'stir-the-pot': {
    formTips:
      'Plank forearms on stability ball, make small circles while hips still.',
    commonMistakes:
      'Hips hiking, giant sloppy circles.',
    beginnerAdvice:
      'Tiny circles burn — anti-extension.',
    diagramDescription:
      'Plank on ball — arm stirring motion.',
  },
  'bear-crawl': {
    formTips:
      'Hands under shoulders, knees under hips hovering, opposite hand/foot step quiet.',
    commonMistakes:
      'Hips too high/low, crossing midline clumsily.',
    beginnerAdvice:
      'Slow contralateral steps.',
    diagramDescription:
      'Quadruped crawl — knees off floor.',
  },
  'mcgill-curl-up': {
    formTips:
      'One knee bent, hands under low back, brace abs lifting head/shoulders slightly without lumbar rounding off hands.',
    commonMistakes:
      'Neck yanking, big range like sit-up.',
    beginnerAdvice:
      'Spine hygiene drill — small motion.',
    diagramDescription:
      'Supine partial curl — hands monitor lordosis.',
  },
  'doorway-chest-stretch': {
    formTips:
      'Forearm vertical on door frame elbow ~90°, step through until pec opens; alternate angles.',
    commonMistakes:
      'Shrugging into stretch, cranking neck.',
    beginnerAdvice:
      '30s per side easy breathing.',
    diagramDescription:
      'Standing in door — pec elongation.',
  },
  'overhead-tricep-stretch': {
    formTips:
      'One arm bent overhead, gentle assistance on elbow; keep ribs down.',
    commonMistakes:
      'Side bending hard, low-back arch.',
    beginnerAdvice:
      'Mirror standing overhead tricep line.',
    diagramDescription:
      'Side view: arm folded behind head — long head bias.',
  },
  'cross-body-shoulder-stretch': {
    formTips:
      'Arm across chest at shoulder height, hug gently — feel posterior cuff.',
    commonMistakes:
      'Shrugging, twisting whole torso off.',
    beginnerAdvice:
      'Keep shoulder blade “quiet” — mild pressure only.',
    diagramDescription:
      'Horizontal adduction stretch standing.',
  },
  'sleeper-stretch': {
    formTips:
      'Lie on side, bottom arm 90/90, gently rotate forearm down toward floor with passive shoulder IR.',
    commonMistakes:
      'Forcing hand to floor, sharp anterior pain.',
    beginnerAdvice:
      'Light pressure — baseball/thrower maintenance.',
    diagramDescription:
      'Side lying internal rotation stretch.',
  },
  'lat-stretch-with-pole': {
    formTips:
      'Hang or hold rack leaning hips away, armpit opens along lats.',
    commonMistakes:
      'Collapsing into low back hinge uncontrolled.',
    beginnerAdvice:
      'Deep breaths widen ribs laterally.',
    diagramDescription:
      'Side bend grab vertical bar — long lat line.',
  },
  'thoracic-extension-over-foam-roller': {
    formTips:
      'Roller at mid-back, supported head hands, small extension segments over roller without low-back hyper.',
    commonMistakes:
      'Dumping entire lumbar onto roller, forcing pop.',
    beginnerAdvice:
      'Gentle segments — chin tuck slightly.',
    diagramDescription:
      'Supine over roller — segmented extension.',
  },
  'lumbar-rotation-stretch': {
    formTips:
      'Supine windshield wiper knees side to side keeping shoulders down.',
    commonMistakes:
      'Lifting both shoulders off floor chasing range.',
    beginnerAdvice:
      'Slow breathing — low back gentle twist.',
    diagramDescription:
      'Supine knees stacked rotation.',
  },
  'standing-hip-circle': {
    formTips:
      'Hand on wall, free leg circles smooth through hip socket; change direction.',
    commonMistakes:
      'Torso leaning big, tiny stiff circles.',
    beginnerAdvice:
      'Warm-up mobility — no grind.',
    diagramDescription:
      'Single-leg hip circumduction standing.',
  },
  '90-90-hip-stretch': {
    formTips:
      'Seated 90/90 both legs, lead with belly toward front shin without rotating pelvis off floor.',
    commonMistakes:
      'Rounding aggressively, knee pain on back leg.',
    beginnerAdvice:
      'Prop hands behind — tall spine.',
    diagramDescription:
      'Floor seated “both-bent” hip opener.',
  },
  'couch-stretch': {
    formTips:
      'Back foot elevated on couch/bench, knee down, hip forward gently — feel front thigh/hip flexor.',
    commonMistakes:
      'Arching low back, knee far past toe line excessive.',
    beginnerAdvice:
      'Pad knee — couch stretch daily for desk athletes.',
    diagramDescription:
      'Half kneel rear foot up — hip flexor quad line.',
  },
  'frog-stretch': {
    formTips:
      'Knees wide on mat, feet turned out, sit hips back between heels gently.',
    commonMistakes:
      'Forcing groin, ankle pain — use padding.',
    beginnerAdvice:
      'Support on hands — shift hips side to side lightly.',
    diagramDescription:
      'Wide knee groin stretch prone lean.',
  },
  'butterfly-stretch': {
    formTips:
      'Seated soles together, knees fall open; tall spine, gentle press on thighs or lean forward from hips.',
    commonMistakes:
      'Rounding aggressively, bouncing knees down.',
    beginnerAdvice:
      'Sit on folded blanket if hips are tight.',
    diagramDescription:
      'Seated diamond legs — inner thigh opener.',
  },
  'standing-figure-four': {
    formTips:
      'Stand on one leg, cross ankle on opposite knee, sit hips back like a chair to open outer hip.',
    commonMistakes:
      'Knee caving, losing balance without support.',
    beginnerAdvice:
      'Finger tips on wall — switch sides even time.',
    diagramDescription:
      'Single-leg standing figure-four — hip opener.',
  },
  'ankle-circles': {
    formTips:
      'Lift foot, slow circles in both directions through full comfortable range; switch.',
    commonMistakes:
      'Speeding, forcing clicky ranges.',
    beginnerAdvice:
      'Pre-run ankle prep — small and smooth.',
    diagramDescription:
      'Seated or standing — foot globe circles.',
  },
  'toe-touch': {
    formTips:
      'Stand or sit long legs soft knee; hinge or reach forward keeping spine long; feel hamstrings/calves.',
    commonMistakes:
      'Forcing palms to floor with rounded back, locking knees hard.',
    beginnerAdvice:
      'Bend knees slightly if back rounds.',
    diagramDescription:
      'Forward fold — posterior chain light stretch.',
  },
  'good-morning-stretch': {
    formTips:
      'Hands behind head, tiny hip hinge with flat back as if polite bow — mobility not heavy load.',
    commonMistakes:
      'Confusing with loaded good morning depth.',
    beginnerAdvice:
      'Bodyweight only — 8–10 slow reps.',
    diagramDescription:
      'Vertical torso hinge — hands bracing head lightly.',
  },
  'lunge-with-rotation': {
    formTips:
      'Long lunge position, tall torso, rotate shoulders toward front leg with arms long, eyes follow hands.',
    commonMistakes:
      'Collapsing forward knee, rotating only neck.',
    beginnerAdvice:
      'Great warm-up — bodyweight only.',
    diagramDescription:
      'Low lunge + thoracic rotation reach.',
  },
  'worlds-greatest-stretch': {
    formTips:
      'From plank step foot outside hand, drop same elbow if able, rotate open arm to sky; switch.',
    commonMistakes:
      'Rushing transitions, dumping into low back.',
    beginnerAdvice:
      'Flow slow — one breath per position.',
    diagramDescription:
      'Lunge matrix with reach and twist — mobility flow.',
  },
  'inchworm': {
    formTips:
      'Stand fold hands to floor, walk hands to plank, optional push-up, walk feet to hands with soft knees.',
    commonMistakes:
      'Walking feet with locked knees; sagging plank.',
    beginnerAdvice:
      'Skip push-up early on — just walk outs.',
    diagramDescription:
      'Hand walk out and in — full-body primer.',
  },
  'jefferson-curl': {
    formTips:
      'Stand on elevation, chin tucked, round sequentially from neck through spine lowering toward toes with light DB; reverse segmentally.',
    commonMistakes:
      'Heavier than technique allows, loading neck first.',
    beginnerAdvice:
      'Go slowly with very light weight or none.',
    diagramDescription:
      'Controlled spinal flexion from standing — careful advanced drill.',
  },
}

export function getExerciseHelp(ex: Exercise): ExerciseHelp {
  if (ex.formTips?.trim() && ex.commonMistakes?.trim() && ex.beginnerAdvice?.trim()) {
    return {
      formTips: ex.formTips.trim(),
      commonMistakes: ex.commonMistakes.trim(),
      beginnerAdvice: ex.beginnerAdvice.trim(),
      diagramDescription: `${ex.name} — custom exercise`,
    }
  }
  const extended = EXTENDED_EXERCISE_HELP[ex.id]
  if (extended) return extended
  const stretch = getStretchExerciseHelp(ex.id)
  if (stretch) return stretch
  const h = MUSCLE_HINTS[ex.muscleGroup]
  return {
    formTips: `${ex.name}: ${h.formTips}`,
    commonMistakes: h.commonMistakes,
    beginnerAdvice: h.beginnerAdvice,
    diagramDescription: `${ex.name} — ${DIAGRAM_HINTS[ex.muscleGroup]}`,
  }
}
