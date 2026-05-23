import type { MuscleGroup } from '../types'
import { EXERCISE_BY_ID } from '../data/exercises'

/* eslint-disable react-refresh/only-export-components -- scene helpers live with SVG art */

export type Scene =
  | 'bench'
  | 'incline'
  | 'squat'
  | 'hinge'
  | 'pulldown'
  | 'row'
  | 'ohp'
  | 'curl'
  | 'pushdown'
  | 'fly'
  | 'dip'
  | 'leg-press'
  | 'leg-ext'
  | 'leg-curl'
  | 'calf'
  | 'hip-thrust'
  | 'plank'
  | 'mountain'
  | 'stretch-hip'
  | 'stretch-ham'
  | 'stretch-quad'
  | 'cardio'
  | 'core-crunch'

const BY_ID: Partial<Record<string, Scene>> = {
  'bench-press': 'bench',
  'incline-bench-press': 'incline',
  'dumbbell-bench-press': 'bench',
  'seated-bench-press': 'bench',
  'pec-fly': 'fly',
  'cable-fly': 'fly',
  'chest-press-machine': 'bench',
  'push-up': 'dip',
  squat: 'squat',
  'leg-press': 'leg-press',
  'leg-extension': 'leg-ext',
  'leg-curl': 'leg-curl',
  'hamstring-curl': 'leg-curl',
  'calf-raises': 'calf',
  'bulgarian-split-squat': 'squat',
  'romanian-deadlift': 'hinge',
  'hip-thrust': 'hip-thrust',
  deadlift: 'hinge',
  'lat-pulldown': 'pulldown',
  'seated-cable-row': 'row',
  rows: 'row',
  'pull-ups': 'pulldown',
  'cable-row': 'row',
  't-bar-row': 'row',
  'overhead-press': 'ohp',
  'shoulder-press': 'ohp',
  'lateral-raises': 'ohp',
  'face-pull': 'row',
  'arnold-press': 'ohp',
  'reverse-fly': 'fly',
  'dumbbell-curl': 'curl',
  'barbell-curl': 'curl',
  'seated-dumbbell-curl': 'curl',
  'hammer-curl': 'curl',
  'tricep-rope-pushdown': 'pushdown',
  dips: 'dip',
  'skull-crushers': 'pushdown',
  'diamond-push-ups': 'dip',
  plank: 'plank',
  'crunch-machine': 'core-crunch',
  'sit-up': 'core-crunch',
  'russian-twist': 'core-crunch',
  'leg-raise': 'core-crunch',
  'mountain-climbers': 'mountain',
  elliptical: 'cardio',
  treadmill: 'cardio',
  'rowing-machine': 'cardio',
  'battle-ropes': 'cardio',
  'jump-rope': 'cardio',
  cycling: 'cardio',
  'stair-climber': 'cardio',
  swimming: 'cardio',
  'hip-flexor-stretch': 'stretch-hip',
  'hamstring-stretch': 'stretch-ham',
  'quad-stretch': 'stretch-quad',
  'pigeon-pose': 'stretch-hip',
  'chest-opener': 'stretch-ham',
  'shoulder-cross-stretch': 'stretch-ham',
  'tricep-stretch': 'stretch-ham',
  'seated-spinal-twist': 'stretch-ham',
  'cat-cow': 'stretch-ham',
  'childs-pose': 'stretch-ham',
  'downward-dog': 'stretch-ham',
  'figure-four-stretch': 'stretch-hip',
  'calf-stretch': 'calf',
  'neck-rolls': 'stretch-ham',
  'wrist-flexor-stretch': 'stretch-ham',
  'inner-thigh-machine': 'squat',
  'outer-thigh-machine': 'squat',
}

const BY_GROUP: Record<MuscleGroup, Scene> = {
  Chest: 'bench',
  Back: 'row',
  Legs: 'squat',
  Shoulders: 'ohp',
  Arms: 'curl',
  Core: 'plank',
  Cardio: 'cardio',
  Stretches: 'stretch-ham',
}

export function getExerciseIllustrationScene(exerciseId: string): Scene {
  const o = BY_ID[exerciseId]
  if (o) return o
  const ex = EXERCISE_BY_ID[exerciseId]
  return ex ? BY_GROUP[ex.muscleGroup] : 'bench'
}

const stroke = '#d4d4d4'
const bench = '#3a3a3a'
const bar = '#9ca3af'

function SceneSvg({ scene }: { scene: Scene }) {
  switch (scene) {
    case 'bench':
      return (
        <g fill="none" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="20" y1="95" x2="200" y2="95" stroke={bench} strokeWidth="4" />
          <line x1="35" y1="95" x2="35" y2="115" stroke={bench} strokeWidth="3" />
          <line x1="185" y1="95" x2="185" y2="115" stroke={bench} strokeWidth="3" />
          <circle cx="120" cy="58" r="9" />
          <line x1="120" y1="67" x2="120" y2="88" />
          <line x1="120" y1="78" x2="95" y2="72" />
          <line x1="120" y1="78" x2="145" y2="72" />
          <line x1="120" y1="88" x2="105" y2="100" />
          <line x1="120" y1="88" x2="135" y2="100" />
          <line x1="95" y1="72" x2="145" y2="72" stroke={bar} strokeWidth="3" />
        </g>
      )
    case 'incline':
      return (
        <g fill="none" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="30" y1="110" x2="190" y2="75" stroke={bench} strokeWidth="4" />
          <line x1="45" y1="118" x2="45" y2="128" stroke={bench} strokeWidth="3" />
          <line x1="175" y1="82" x2="175" y2="118" stroke={bench} strokeWidth="3" />
          <circle cx="115" cy="55" r="9" />
          <line x1="115" y1="64" x2="108" y2="82" />
          <line x1="108" y1="73" x2="88" y2="65" />
          <line x1="108" y1="73" x2="138" y2="62" />
          <line x1="108" y1="82" x2="98" y2="95" />
          <line x1="108" y1="82" x2="120" y2="92" />
          <line x1="88" y1="65" x2="138" y2="62" stroke={bar} strokeWidth="3" />
        </g>
      )
    case 'squat':
      return (
        <g fill="none" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="40" y1="118" x2="200" y2="118" stroke={bench} strokeWidth="2" opacity="0.5" />
          <circle cx="120" cy="38" r="9" />
          <line x1="120" y1="47" x2="120" y2="78" />
          <line x1="120" y1="58" x2="95" y2="68" />
          <line x1="120" y1="58" x2="145" y2="68" />
          <line x1="120" y1="78" x2="100" y2="108" />
          <line x1="120" y1="78" x2="140" y2="108" />
          <line x1="100" y1="108" x2="92" y2="118" />
          <line x1="140" y1="108" x2="148" y2="118" />
        </g>
      )
    case 'hinge':
      return (
        <g fill="none" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="50" y1="118" x2="190" y2="118" stroke={bench} strokeWidth="2" opacity="0.4" />
          <circle cx="135" cy="48" r="9" />
          <line x1="135" y1="57" x2="115" y2="85" />
          <line x1="115" y1="70" x2="95" y2="62" />
          <line x1="115" y1="70" x2="125" y2="58" />
          <line x1="115" y1="85" x2="105" y2="108" />
          <line x1="115" y1="85" x2="128" y2="105" />
          <line x1="95" y1="62" x2="155" y2="68" stroke={bar} strokeWidth="3" />
        </g>
      )
    case 'pulldown':
      return (
        <g fill="none" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="120" y1="18" x2="120" y2="35" stroke={bar} strokeWidth="3" />
          <line x1="95" y1="35" x2="145" y2="35" stroke={bar} strokeWidth="2.5" />
          <line x1="75" y1="100" x2="165" y2="100" stroke={bench} strokeWidth="5" />
          <line x1="85" y1="100" x2="85" y2="118" stroke={bench} strokeWidth="3" />
          <line x1="155" y1="100" x2="155" y2="118" stroke={bench} strokeWidth="3" />
          <circle cx="120" cy="58" r="9" />
          <line x1="120" y1="67" x2="120" y2="88" />
          <line x1="120" y1="75" x2="100" y2="82" />
          <line x1="120" y1="75" x2="140" y2="82" />
          <line x1="100" y1="82" x2="98" y2="48" />
          <line x1="140" y1="82" x2="142" y2="48" />
          <line x1="98" y1="48" x2="142" y2="48" stroke={bar} strokeWidth="2.5" />
        </g>
      )
    case 'row':
      return (
        <g fill="none" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="105" cy="52" r="9" />
          <line x1="105" y1="61" x2="115" y2="85" />
          <line x1="115" y1="72" x2="95" y2="68" />
          <line x1="115" y1="72" x2="135" y2="78" />
          <line x1="115" y1="85" x2="108" y2="108" />
          <line x1="115" y1="85" x2="125" y2="108" />
          <line x1="135" y1="78" x2="165" y2="75" stroke={bar} strokeWidth="3" />
          <line x1="168" y1="55" x2="168" y2="95" stroke={bench} strokeWidth="3" />
        </g>
      )
    case 'ohp':
      return (
        <g fill="none" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="40" y1="118" x2="200" y2="118" opacity="0.4" stroke={bench} />
          <circle cx="120" cy="48" r="9" />
          <line x1="120" y1="57" x2="120" y2="92" />
          <line x1="120" y1="68" x2="95" y2="58" />
          <line x1="120" y1="68" x2="145" y2="58" />
          <line x1="120" y1="92" x2="110" y2="112" />
          <line x1="120" y1="92" x2="130" y2="112" />
          <line x1="95" y1="58" x2="145" y2="58" stroke={bar} strokeWidth="3" />
        </g>
      )
    case 'curl':
      return (
        <g fill="none" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="120" cy="42" r="9" />
          <line x1="120" y1="51" x2="120" y2="88" />
          <line x1="120" y1="62" x2="100" y2="55" />
          <line x1="120" y1="62" x2="132" y2="72" />
          <line x1="120" y1="88" x2="115" y2="110" />
          <line x1="120" y1="88" x2="125" y2="110" />
          <path d="M 132 72 Q 145 85 138 98" stroke={bar} strokeWidth="3" fill="none" />
        </g>
      )
    case 'pushdown':
      return (
        <g fill="none" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="120" y1="22" x2="120" y2="45" stroke={bench} strokeWidth="2" />
          <line x1="110" y1="45" x2="130" y2="45" stroke={bar} strokeWidth="2.5" />
          <circle cx="120" cy="58" r="9" />
          <line x1="120" y1="67" x2="120" y2="95" />
          <line x1="120" y1="76" x2="105" y2="88" />
          <line x1="120" y1="76" x2="135" y2="88" />
          <line x1="105" y1="88" x2="108" y2="105" />
          <line x1="135" y1="88" x2="132" y2="105" />
          <line x1="108" y1="105" x2="132" y2="105" stroke={bar} strokeWidth="2" />
        </g>
      )
    case 'fly':
      return (
        <g fill="none" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="25" y1="95" x2="215" y2="95" stroke={bench} strokeWidth="3" />
          <circle cx="120" cy="52" r="9" />
          <line x1="120" y1="61" x2="120" y2="88" />
          <line x1="120" y1="72" x2="95" y2="82" />
          <line x1="120" y1="72" x2="145" y2="82" />
          <line x1="120" y1="88" x2="112" y2="102" />
          <line x1="120" y1="88" x2="128" y2="102" />
          <line x1="95" y1="82" x2="75" y2="70" stroke={bar} strokeWidth="2" />
          <line x1="145" y1="82" x2="165" y2="70" stroke={bar} strokeWidth="2" />
        </g>
      )
    case 'dip':
      return (
        <g fill="none" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="85" y1="35" x2="85" y2="118" stroke={bench} strokeWidth="3" />
          <line x1="155" y1="35" x2="155" y2="118" stroke={bench} strokeWidth="3" />
          <line x1="85" y1="40" x2="155" y2="40" stroke={bench} strokeWidth="2" />
          <circle cx="120" cy="55" r="9" />
          <line x1="120" y1="64" x2="120" y2="88" />
          <line x1="120" y1="72" x2="102" y2="82" />
          <line x1="120" y1="72" x2="138" y2="82" />
          <line x1="120" y1="88" x2="110" y2="108" />
          <line x1="120" y1="88" x2="130" y2="108" />
        </g>
      )
    case 'leg-press':
      return (
        <g fill="none" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="55" y="35" width="130" height="50" rx="4" stroke={bench} strokeWidth="3" fill="none" />
          <line x1="70" y1="118" x2="170" y2="118" stroke={bench} strokeWidth="4" />
          <circle cx="120" cy="72" r="9" />
          <line x1="120" y1="81" x2="118" y2="98" />
          <line x1="118" y1="90" x2="95" y2="88" />
          <line x1="118" y1="90" x2="145" y2="88" />
          <line x1="95" y1="88" x2="88" y2="72" />
          <line x1="145" y1="88" x2="152" y2="72" />
        </g>
      )
    case 'leg-ext':
      return (
        <g fill="none" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="165" y1="55" x2="165" y2="118" stroke={bench} strokeWidth="4" />
          <circle cx="115" cy="52" r="9" />
          <line x1="115" y1="61" x2="125" y2="88" />
          <line x1="125" y1="72" x2="105" y2="68" />
          <line x1="125" y1="88" x2="155" y2="95" />
          <line x1="125" y1="88" x2="118" y2="108" />
        </g>
      )
    case 'leg-curl':
      return (
        <g fill="none" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="55" y1="100" x2="55" y2="118" stroke={bench} strokeWidth="3" />
          <circle cx="115" cy="48" r="9" />
          <line x1="115" y1="57" x2="120" y2="82" />
          <line x1="120" y1="68" x2="100" y2="62" />
          <line x1="120" y1="82" x2="135" y2="95" />
          <line x1="135" y1="95" x2="128" y2="108" />
          <line x1="120" y1="82" x2="112" y2="108" />
        </g>
      )
    case 'calf':
      return (
        <g fill="none" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="40" y1="118" x2="200" y2="118" stroke={bench} />
          <circle cx="120" cy="38" r="9" />
          <line x1="120" y1="47" x2="120" y2="85" />
          <line x1="120" y1="55" x2="102" y2="60" />
          <line x1="120" y1="55" x2="138" y2="60" />
          <line x1="120" y1="85" x2="115" y2="108" />
          <line x1="120" y1="85" x2="125" y2="108" />
          <line x1="115" y1="108" x2="112" y2="118" />
          <line x1="125" y1="108" x2="128" y2="118" />
        </g>
      )
    case 'hip-thrust':
      return (
        <g fill="none" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="30" y1="78" x2="190" y2="78" stroke={bench} strokeWidth="4" />
          <circle cx="95" cy="62" r="9" />
          <line x1="95" y1="71" x2="115" y2="78" />
          <line x1="115" y1="78" x2="145" y2="72" />
          <line x1="115" y1="78" x2="108" y2="95" />
          <line x1="115" y1="78" x2="125" y2="95" />
          <line x1="145" y1="68" x2="145" y2="82" stroke={bar} strokeWidth="3" />
        </g>
      )
    case 'plank':
      return (
        <g fill="none" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="175" cy="58" r="9" />
          <line x1="175" y1="67" x2="135" y2="78" />
          <line x1="155" y1="72" x2="165" y2="88" />
          <line x1="155" y1="72" x2="145" y2="60" />
          <line x1="135" y1="78" x2="85" y2="78" />
          <line x1="85" y1="78" x2="75" y2="88" />
          <line x1="135" y1="78" x2="125" y2="88" />
        </g>
      )
    case 'mountain':
      return (
        <g fill="none" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="40" y1="118" x2="200" y2="118" opacity="0.4" />
          <circle cx="125" cy="48" r="9" />
          <line x1="125" y1="57" x2="118" y2="78" />
          <line x1="118" y1="68" x2="105" y2="62" />
          <line x1="118" y1="68" x2="132" y2="65" />
          <line x1="118" y1="78" x2="108" y2="98" />
          <line x1="118" y1="78" x2="128" y2="92" />
          <line x1="108" y1="98" x2="100" y2="108" />
          <line x1="128" y1="92" x2="138" y2="102" />
        </g>
      )
    case 'stretch-hip':
      return (
        <g fill="none" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="120" cy="40" r="9" />
          <line x1="120" y1="49" x2="120" y2="78" />
          <line x1="120" y1="58" x2="100" y2="52" />
          <line x1="120" y1="58" x2="145" y2="85" />
          <line x1="120" y1="78" x2="110" y2="108" />
          <line x1="120" y1="78" x2="135" y2="105" />
        </g>
      )
    case 'stretch-ham':
      return (
        <g fill="none" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="120" cy="38" r="9" />
          <line x1="120" y1="47" x2="125" y2="85" />
          <line x1="125" y1="58" x2="105" y2="50" />
          <line x1="125" y1="85" x2="105" y2="108" />
          <line x1="125" y1="85" x2="140" y2="108" />
        </g>
      )
    case 'stretch-quad':
      return (
        <g fill="none" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="115" cy="42" r="9" />
          <line x1="115" y1="51" x2="115" y2="88" />
          <line x1="115" y1="62" x2="95" y2="55" />
          <line x1="115" y1="88" x2="105" y2="108" />
          <line x1="115" y1="88" x2="128" y2="108" />
          <path d="M 95 55 Q 75 45 85 65" stroke={bar} strokeWidth="2" fill="none" />
        </g>
      )
    case 'cardio':
      return (
        <g fill="none" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="125" cy="48" r="9" />
          <line x1="125" y1="57" x2="118" y2="82" />
          <line x1="118" y1="68" x2="102" y2="62" />
          <line x1="118" y1="68" x2="132" y2="65" />
          <line x1="118" y1="82" x2="108" y2="102" />
          <line x1="118" y1="82" x2="128" y2="98" />
          <path d="M 108 102 Q 95 108 88 118" fill="none" />
          <path d="M 128 98 Q 142 105 150 115" fill="none" />
        </g>
      )
    case 'core-crunch':
      return (
        <g fill="none" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="50" y1="95" x2="190" y2="95" stroke={bench} strokeWidth="3" />
          <circle cx="125" cy="58" r="9" />
          <line x1="125" y1="67" x2="118" y2="88" />
          <line x1="118" y1="78" x2="105" y2="72" />
          <line x1="118" y1="88" x2="112" y2="95" />
        </g>
      )
    default:
      return null
  }
}

type Props = {
  exerciseId: string
  className?: string
}

export function ExerciseIllustration({ exerciseId, className }: Props) {
  const scene = getExerciseIllustrationScene(exerciseId)
  return (
    <svg
      viewBox="0 0 240 140"
      className={className ?? 'w-full h-auto'}
      role="img"
      aria-hidden
    >
      <rect width="240" height="140" rx="12" fill="#1e1e1e" />
      <SceneSvg scene={scene} />
    </svg>
  )
}
