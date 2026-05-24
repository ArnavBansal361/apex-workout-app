import type { ExerciseHelp } from '../types'
import type { MuscleGroup } from '../types'

export type StretchTarget =
  | 'Hamstrings'
  | 'Quads'
  | 'Hip flexors'
  | 'Glutes'
  | 'Piriformis'
  | 'IT band'
  | 'Calves'
  | 'Chest'
  | 'Shoulders'
  | 'Triceps'
  | 'Lats'
  | 'Thoracic spine'
  | 'Neck'
  | 'Wrist flexors'
  | 'Wrist extensors'
  | 'Spine'
  | 'Hips'
  | 'Adductors'

export type StretchSection =
  | 'Lower body'
  | 'Hips & glutes'
  | 'Upper body'
  | 'Spine & core'
  | 'Neck & wrists'

export type StretchDefinition = {
  id: string
  name: string
  section: StretchSection
  targets: StretchTarget[]
  /** e.g. "30–45 sec per side" */
  hold: string
  instructions: string
  /** Training muscle groups this stretch supports after a session. */
  forMuscleGroups: MuscleGroup[]
  /** Include in generic cooldown when no clear match. */
  universal?: boolean
}

function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function def(
  name: string,
  section: StretchSection,
  targets: StretchTarget[],
  hold: string,
  instructions: string,
  forMuscleGroups: MuscleGroup[],
  opts?: { universal?: boolean },
): StretchDefinition {
  return {
    id: slug(name),
    name,
    section,
    targets,
    hold,
    instructions,
    forMuscleGroups,
    universal: opts?.universal,
  }
}

export const STRETCH_DEFINITIONS: StretchDefinition[] = [
  def(
    'Hamstring Stretch',
    'Lower body',
    ['Hamstrings'],
    '30–45 sec per side',
    'Hinge at the hips with a soft knee until you feel tension in the back of the thigh. Keep the spine neutral — chest toward thighs, not nose forced to knees.',
    ['Legs', 'Back'],
  ),
  def(
    'Quad Stretch',
    'Lower body',
    ['Quads'],
    '30–45 sec per side',
    'Standing or side-lying: pull heel toward glute, knee pointing down, thighs parallel. Stay tall and avoid arching the low back.',
    ['Legs'],
  ),
  def(
    'Standing Hamstring Hinge',
    'Lower body',
    ['Hamstrings'],
    '30–45 sec per side',
    'Stand tall, soft front knee. Hinge at the hips with a flat back until you feel tension in the rear thigh. Rest hands on the front thigh or shins — do not round hard to touch the floor.',
    ['Legs', 'Back'],
  ),
  def(
    'Seated Hamstring Reach',
    'Lower body',
    ['Hamstrings'],
    '30–45 sec',
    'Sit on the floor, legs extended. Hinge forward from the hips with a long spine until you feel a pull behind the knees. Keep toes relaxed.',
    ['Legs'],
  ),
  def(
    'Standing Toe Touch',
    'Lower body',
    ['Hamstrings'],
    '20–30 sec',
    'Feet hip-width, knees slightly bent. Fold forward and let the head hang heavy. Focus on hip hinge, not forcing palms to the floor.',
    ['Legs'],
  ),
  def(
    'Seated Forward Fold',
    'Lower body',
    ['Hamstrings', 'Spine'],
    '45–60 sec',
    'Sit with legs long, flex feet lightly. Walk hands along shins or reach toward toes while keeping length through the spine. Breathe into the back body.',
    ['Legs', 'Back'],
    { universal: true },
  ),
  def(
    'Lying Hamstring Towel Stretch',
    'Lower body',
    ['Hamstrings'],
    '30–45 sec per side',
    'On your back, loop a towel around the foot. Keep the lifted leg straight and hip on the floor as you draw the leg toward you.',
    ['Legs'],
  ),
  def(
    'Standing Quad Stretch',
    'Lower body',
    ['Quads'],
    '30–45 sec per side',
    'Stand on one leg (use a wall for balance). Catch the top of the foot, knee pointing down, and gently pull heel toward the glute without arching the low back.',
    ['Legs'],
  ),
  def(
    'Standing Quad Pull',
    'Lower body',
    ['Quads'],
    '30–45 sec per side',
    'Same as standing quad stretch: keep thighs parallel, knees close, and torso tall while opening the front of the thigh.',
    ['Legs'],
  ),
  def(
    'Side-Lying Quad Stretch',
    'Lower body',
    ['Quads'],
    '30–45 sec per side',
    'Lie on your side, grab the top foot, and draw heel toward glute. Keep hips stacked and avoid twisting the lower back.',
    ['Legs'],
  ),
  def(
    'Hip Flexor Stretch',
    'Hips & glutes',
    ['Hip flexors'],
    '30–45 sec per side',
    'Half-kneel with front foot flat. Tuck the pelvis slightly and shift hips forward until you feel a mild pull in the rear hip. Torso stays vertical.',
    ['Legs', 'Core'],
  ),
  def(
    'Kneeling Hip Flexor Stretch',
    'Hips & glutes',
    ['Hip flexors'],
    '30–45 sec per side',
    'Low lunge on the knee with both hips square. Squeeze the glute on the kneeling side and press hips forward gently.',
    ['Legs'],
  ),
  def(
    'Hip Flexor Lunge Stretch',
    'Hips & glutes',
    ['Hip flexors'],
    '30–45 sec per side',
    'Deep lunge with rear knee down. Keep ribs stacked over pelvis and front knee over ankle while lengthening the front of the rear hip.',
    ['Legs'],
  ),
  def(
    'Couch Stretch',
    'Hips & glutes',
    ['Hip flexors', 'Quads'],
    '45–60 sec per side',
    'Rear foot elevated on a bench or couch, front foot far enough forward to feel quad and hip flexor length. Stay tall and breathe.',
    ['Legs'],
  ),
  def(
    'Standing Figure Four',
    'Hips & glutes',
    ['Glutes', 'Hips'],
    '30–45 sec per side',
    'Stand and cross ankle over opposite knee. Sit hips back like a chair until the outer hip opens. Use a wall if needed.',
    ['Legs'],
  ),
  def(
    'Figure Four Stretch',
    'Hips & glutes',
    ['Glutes', 'Piriformis'],
    '30–45 sec per side',
    'On your back, cross ankle over opposite knee and thread hands behind the support thigh. Draw the leg toward you until the outer hip releases.',
    ['Legs'],
  ),
  def(
    'Pigeon Pose',
    'Hips & glutes',
    ['Glutes', 'Hips'],
    '45–60 sec per side',
    'Front shin as square as comfortable, back leg long. Level the hips (use a block under the front hip) and fold forward only if the knee is happy.',
    ['Legs'],
  ),
  def(
    'Piriformis Stretch',
    'Hips & glutes',
    ['Piriformis', 'Glutes'],
    '30–45 sec per side',
    'Supine figure-four with the support foot on a wall or table for more control. Keep the crossed ankle flexed and hips level.',
    ['Legs'],
  ),
  def(
    'Seated Glute Stretch',
    'Hips & glutes',
    ['Glutes'],
    '30–45 sec per side',
    'Sit tall, cross one ankle over the opposite knee, and hug the shin toward the chest while keeping the spine long.',
    ['Legs'],
  ),
  def(
    'IT Band Stretch',
    'Hips & glutes',
    ['IT band'],
    '30–45 sec per side',
    'Stand and cross the rear leg behind you. Lean to the side of the rear leg until you feel the outer thigh. Keep both feet flat.',
    ['Legs'],
  ),
  def(
    '90/90 Hip Stretch',
    'Hips & glutes',
    ['Hips'],
    '45–60 sec per side',
    'Sit with front and back legs both bent at 90°. Stay tall over the front shin, then switch sides. Focus on internal and external rotation.',
    ['Legs'],
  ),
  def(
    'Butterfly Stretch',
    'Hips & glutes',
    ['Adductors', 'Hips'],
    '30–45 sec',
    'Soles of the feet together, knees wide. Hold ankles and lengthen the spine; only press knees down gently — never bounce.',
    ['Legs'],
  ),
  def(
    'Lizard Pose',
    'Hips & glutes',
    ['Hip flexors', 'Hips'],
    '30–45 sec per side',
    'Low lunge with both hands inside the front foot. Sink hips forward and down while keeping the front knee tracking over the ankle.',
    ['Legs'],
  ),
  def(
    'Frog Stretch',
    'Hips & glutes',
    ['Adductors', 'Hips'],
    '30–45 sec',
    'On all fours, widen knees with feet in line with knees. Shift hips back toward heels until inner thighs open — stop before knee pinch.',
    ['Legs'],
  ),
  def(
    'Calf Stretch',
    'Lower body',
    ['Calves'],
    '30–45 sec per side',
    'Hands on a wall, rear leg straight, heel down. Lean forward until the gastrocnemius loads. Switch to a bent back knee for soleus.',
    ['Legs'],
  ),
  def(
    'Wall Calf Stretch',
    'Lower body',
    ['Calves'],
    '30–45 sec per side',
    'Same as wall calf lean: rear heel glued down, hips square, gentle forward shift. Keep arch from collapsing.',
    ['Legs'],
  ),
  def(
    'Soleus Stretch',
    'Lower body',
    ['Calves'],
    '30–45 sec per side',
    'Wall stretch with the back knee bent and heel still down. You should feel the lower calf / soleus rather than the upper calf.',
    ['Legs'],
  ),
  def(
    'Chest Opener',
    'Upper body',
    ['Chest', 'Shoulders'],
    '30–45 sec',
    'Clasp hands behind the back or hold a band. Lift the sternum and draw shoulder blades together without flaring ribs forward.',
    ['Chest', 'Shoulders'],
  ),
  def(
    'Doorway Chest Stretch',
    'Upper body',
    ['Chest'],
    '30–45 sec per side',
    'Forearm on the doorframe at 90°, elbow at shoulder height. Step through until the chest opens. Try two heights if one pinches.',
    ['Chest', 'Shoulders'],
  ),
  def(
    'Chest Doorway Stretch',
    'Upper body',
    ['Chest'],
    '30–45 sec per side',
    'Both forearms on the frame in a goalpost position. Lean through until you feel stretch across pecs and front shoulders.',
    ['Chest'],
  ),
  def(
    'Pec Minor Stretch',
    'Upper body',
    ['Chest'],
    '30 sec per side',
    'Place the forearm high on a doorway with elbow above shoulder. Rotate torso gently away until you feel stretch under the collarbone.',
    ['Chest', 'Shoulders'],
  ),
  def(
    'Shoulder Cross Stretch',
    'Upper body',
    ['Shoulders'],
    '30 sec per side',
    'Bring one arm across the chest and use the other forearm to hug it in. Keep the shoulder down — do not shrug toward the ear.',
    ['Shoulders', 'Back'],
  ),
  def(
    'Shoulder Cross-Body Stretch',
    'Upper body',
    ['Shoulders'],
    '30 sec per side',
    'Bring one arm across the chest and use the other forearm to hug it in. Keep the shoulder down — do not shrug toward the ear.',
    ['Shoulders', 'Back'],
  ),
  def(
    'Cross Body Shoulder Stretch',
    'Upper body',
    ['Shoulders'],
    '30 sec per side',
    'Same horizontal adduction: arm parallel to the floor, gentle pressure at the upper arm, torso facing forward.',
    ['Shoulders'],
  ),
  def(
    'Sleeper Stretch',
    'Upper body',
    ['Shoulders'],
    '30 sec per side',
    'Lie on your side with bottom arm 90° at the elbow. Use the top hand to press the forearm toward the floor for posterior shoulder rotation.',
    ['Shoulders'],
  ),
  def(
    'Shoulder Sleeper Stretch',
    'Upper body',
    ['Shoulders'],
    '30 sec per side',
    'Side-lying sleeper: keep shoulder blade set and only rotate the forearm down within a pain-free range.',
    ['Shoulders'],
  ),
  def(
    'Overhead Tricep Stretch',
    'Upper body',
    ['Triceps'],
    '30 sec per side',
    'Reach one arm overhead, bend the elbow, and use the other hand to guide the elbow. Keep ribs down and avoid flaring the elbow wide.',
    ['Arms', 'Shoulders'],
  ),
  def(
    'Tricep Stretch',
    'Upper body',
    ['Triceps'],
    '30 sec per side',
    'Hand behind the head, elbow pointing up. Gently press the elbow with the opposite hand until the back of the arm opens.',
    ['Arms'],
  ),
  def(
    'Lat Stretch with Pole',
    'Upper body',
    ['Lats'],
    '30–45 sec per side',
    'Hold a band or pole overhead, grip wide, and sit hips to one side while keeping arms long. Feel length along the side body.',
    ['Back', 'Shoulders'],
  ),
  def(
    'Lat Doorway Stretch',
    'Upper body',
    ['Lats'],
    '30 sec per side',
    'Grip a doorframe at hip height, step back, and sit hips away while keeping the arm straight. Torso can rotate slightly away.',
    ['Back'],
  ),
  def(
    'Thoracic Rotation',
    'Spine & core',
    ['Thoracic spine'],
    '8–10 reps per side',
    'Quadruped or half-kneel: place one hand behind the head, exhale and rotate the rib cage toward the ceiling. Hips stay still.',
    ['Back', 'Core', 'Chest'],
  ),
  def(
    'Thoracic Extension over Foam Roller',
    'Spine & core',
    ['Thoracic spine'],
    '30–45 sec',
    'Roller across the mid-back, hands behind head. Extend over the roller one segment at a time without dumping into the low back.',
    ['Back', 'Chest'],
  ),
  def(
    'Seated Spinal Twist',
    'Spine & core',
    ['Spine', 'Thoracic spine'],
    '30–45 sec per side',
    'Sit tall, rotate from the ribs using the chair back or opposite knee as light leverage. Both sit bones stay grounded.',
    ['Back', 'Core'],
    { universal: true },
  ),
  def(
    'Supine Twist',
    'Spine & core',
    ['Spine'],
    '45 sec per side',
    'Lie on your back, draw knees to chest, then drop both knees to one side while shoulders stay heavy on the floor.',
    ['Back', 'Core'],
    { universal: true },
  ),
  def(
    'Lumbar Rotation Stretch',
    'Spine & core',
    ['Spine'],
    '30 sec per side',
    'Supine twist with knees bent at 90°. Rotate knees to the side within a comfortable range — no forcing.',
    ['Back', 'Core'],
  ),
  def(
    "Child's Pose",
    'Spine & core',
    ['Spine', 'Lats'],
    '45–60 sec',
    'Knees wide or together, hips toward heels, arms reaching forward. Forehead rests down; breathe into the back ribs.',
    ['Back', 'Legs', 'Core'],
    { universal: true },
  ),
  def(
    'Cat-Cow',
    'Spine & core',
    ['Spine', 'Thoracic spine'],
    '8–10 slow cycles',
    'On all fours, alternate rounding the spine (cat) and extending gently (cow) with the breath. Move segment by segment.',
    ['Back', 'Core'],
    { universal: true },
  ),
  def(
    'Downward Dog',
    'Spine & core',
    ['Hamstrings', 'Calves', 'Lats'],
    '30–45 sec',
    'Hands shoulder-width, feet hip-width, hips high in an inverted V. Bend knees as needed to keep the spine long.',
    ['Back', 'Legs', 'Shoulders'],
    { universal: true },
  ),
  def(
    'Neck Side Stretch',
    'Neck & wrists',
    ['Neck'],
    '20–30 sec per side',
    'Sit tall, drop one ear toward the shoulder without hiking the opposite shoulder. Keep chin slightly tucked.',
    ['Back', 'Shoulders'],
  ),
  def(
    'Neck Rolls',
    'Neck & wrists',
    ['Neck'],
    '5 slow reps per direction',
    'Small half-circles: ear toward shoulder with a tucked chin. Avoid full backward rolls that compress the neck.',
    ['Shoulders'],
  ),
  def(
    'Upper Trap Stretch',
    'Neck & wrists',
    ['Neck'],
    '30 sec per side',
    'Sit on one hand to anchor the shoulder. Tilt head away and slightly down until you feel the side of the neck.',
    ['Shoulders', 'Back'],
  ),
  def(
    'Wrist Flexor Stretch',
    'Neck & wrists',
    ['Wrist flexors'],
    '20–30 sec per side',
    'Arm extended, palm up. Use the other hand to extend the wrist gently until the forearm flexors open.',
    ['Arms'],
  ),
  def(
    'Wrist Extensor Stretch',
    'Neck & wrists',
    ['Wrist extensors'],
    '20–30 sec per side',
    'Arm extended, palm down. Flex the wrist so fingers point down and lightly press with the other hand.',
    ['Arms'],
  ),
  def(
    "World's Greatest Stretch",
    'Spine & core',
    ['Hip flexors', 'Hamstrings', 'Thoracic spine'],
    '5 reps per side',
    'Lunge, place same-side hand inside the foot, rotate and reach the arm to the sky, then straighten the front leg for a hamstring moment.',
    ['Legs', 'Back', 'Core'],
    { universal: true },
  ),
  def(
    'Lunge with Rotation',
    'Spine & core',
    ['Hip flexors', 'Thoracic spine'],
    '6 reps per side',
    'Forward lunge, both hands inside the front foot, rotate the torso toward the front leg and reach up.',
    ['Legs', 'Core'],
  ),
  def(
    'Inchworm',
    'Spine & core',
    ['Hamstrings', 'Calves'],
    '5–6 reps',
    'From standing, fold forward, walk hands out to plank, then walk feet toward hands with soft knees.',
    ['Legs', 'Core'],
  ),
  def(
    'Standing Hip Circle',
    'Hips & glutes',
    ['Hips'],
    '8 reps each direction per leg',
    'Hold a wall, lift one knee, and draw slow circles with the thigh to lubricate the hip capsule.',
    ['Legs'],
  ),
  def(
    'Ankle Circles',
    'Lower body',
    ['Calves'],
    '10 reps each direction',
    'Lift one foot and circle the ankle slowly through full comfortable range.',
    ['Legs'],
  ),
  def(
    'Good Morning Stretch',
    'Lower body',
    ['Hamstrings', 'Spine'],
    '30 sec',
    'Hands behind head, soft knees, hinge at hips with a flat back until hamstrings engage — not a heavy good morning load.',
    ['Legs', 'Back'],
  ),
  def(
    'Jefferson Curl',
    'Spine & core',
    ['Hamstrings', 'Spine'],
    '5–8 slow reps',
    'Very light or bodyweight only: round segmentally from head to tail on the way down, then stack back up. Advanced — skip if back is sensitive.',
    ['Back', 'Legs'],
  ),
  def(
    'Toe Touch',
    'Lower body',
    ['Hamstrings'],
    '20–30 sec',
    'Standing forward fold with soft knees. Let gravity do the work; rise slowly when finished.',
    ['Legs'],
  ),
]

export const STRETCH_BY_ID: Record<string, StretchDefinition> = Object.fromEntries(
  STRETCH_DEFINITIONS.map((s) => [s.id, s]),
)

/** Catalog entries merged into the main exercise library. */
export const STRETCH_EXERCISE_ENTRIES: [string, 'Stretches'][] = STRETCH_DEFINITIONS.map((s) => [
  s.name,
  'Stretches' as const,
])

export function getStretchDefinition(id: string): StretchDefinition | undefined {
  return STRETCH_BY_ID[id]
}

export function isStretchExerciseId(id: string): boolean {
  return id in STRETCH_BY_ID
}

const STRETCH_MISTAKES =
  'Bouncing at end range, holding your breath, or pushing into sharp joint pain instead of mild muscle tension.'

export function getStretchExerciseHelp(id: string): ExerciseHelp | null {
  const s = STRETCH_BY_ID[id]
  if (!s) return null
  return {
    formTips: `${s.instructions}\n\nRecommended hold: ${s.hold}.`,
    commonMistakes: STRETCH_MISTAKES,
    beginnerAdvice: `Targets: ${s.targets.join(', ')}. Ease in slowly and match time on both sides when the stretch is unilateral.`,
    diagramDescription: `${s.name} — ${s.targets.join(', ')}`,
  }
}

export const STRETCH_SECTION_ORDER: StretchSection[] = [
  'Lower body',
  'Hips & glutes',
  'Upper body',
  'Spine & core',
  'Neck & wrists',
]
