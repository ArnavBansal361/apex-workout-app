import { getExerciseIllustrationScene, type Scene } from './ExerciseIllustration'

function motionKind(scene: Scene): 'press' | 'squat' | 'pull' | 'pulse' {
  if (
    scene === 'squat' ||
    scene === 'leg-press' ||
    scene === 'leg-ext' ||
    scene === 'leg-curl' ||
    scene === 'calf' ||
    scene === 'hip-thrust' ||
    scene === 'hinge'
  ) {
    return 'squat'
  }
  if (scene === 'pulldown' || scene === 'row') {
    return 'pull'
  }
  if (
    scene === 'bench' ||
    scene === 'incline' ||
    scene === 'fly' ||
    scene === 'ohp' ||
    scene === 'curl' ||
    scene === 'pushdown' ||
    scene === 'dip' ||
    scene === 'core-crunch'
  ) {
    return 'press'
  }
  return 'pulse'
}

/** Help page: subtle looped motion (CSS) matched to exercise pattern. */
export function HelpExerciseAnimation({ exerciseId }: { exerciseId: string }) {
  const scene = getExerciseIllustrationScene(exerciseId)
  const kind = motionKind(scene)

  return (
    <div
      className={`apex-help-motion apex-help-motion--${kind} w-full rounded-[12px] bg-[#1e1e1e] overflow-hidden`}
      style={{ minHeight: 160 }}
    >
      <svg viewBox="0 0 240 150" className="w-full h-auto block" aria-hidden>
        <defs>
          <style>{`
            .apex-hm-press-bar { animation: apex-hm-press 2.4s ease-in-out infinite; transform-box: fill-box; transform-origin: 120px 76px; }
            .apex-hm-squat-body { animation: apex-hm-squat 2.6s ease-in-out infinite; transform-box: fill-box; transform-origin: 120px 90px; }
            .apex-hm-pull-arms { animation: apex-hm-pull 2.5s ease-in-out infinite; transform-box: fill-box; transform-origin: 120px 72px; }
            .apex-hm-pulse-all { animation: apex-hm-pulse 2.8s ease-in-out infinite; transform-origin: center; }
          `}</style>
        </defs>
        {kind === 'press' ? (
          <g fill="none" stroke="#c8c8c8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="20" y1="118" x2="220" y2="118" stroke="#3a3a3a" strokeWidth="4" />
            <line x1="36" y1="118" x2="36" y2="138" stroke="#3a3a3a" strokeWidth="3" />
            <line x1="204" y1="118" x2="204" y2="138" stroke="#3a3a3a" strokeWidth="3" />
            <circle cx="120" cy="52" r="9" />
            <line x1="120" y1="61" x2="120" y2="90" />
            <line x1="120" y1="90" x2="108" y2="112" />
            <line x1="120" y1="90" x2="132" y2="112" />
            <g className="apex-hm-press-bar">
              <line x1="120" y1="72" x2="88" y2="66" />
              <line x1="120" y1="72" x2="152" y2="66" />
              <line x1="88" y1="66" x2="152" y2="66" stroke="#9ca3af" strokeWidth="3" />
            </g>
          </g>
        ) : null}
        {kind === 'squat' ? (
          <g fill="none" stroke="#c8c8c8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="30" y1="128" x2="210" y2="128" stroke="#3a3a3a" strokeWidth="2" opacity="0.5" />
            <g className="apex-hm-squat-body">
              <circle cx="120" cy="38" r="9" />
              <line x1="120" y1="47" x2="120" y2="78" />
              <line x1="120" y1="58" x2="92" y2="68" />
              <line x1="120" y1="58" x2="148" y2="68" />
              <line x1="120" y1="78" x2="98" y2="118" />
              <line x1="120" y1="78" x2="142" y2="118" />
              <line x1="98" y1="118" x2="90" y2="128" />
              <line x1="142" y1="118" x2="150" y2="128" />
            </g>
          </g>
        ) : null}
        {kind === 'pull' ? (
          <g fill="none" stroke="#c8c8c8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="120" y1="16" x2="120" y2="34" stroke="#9ca3af" strokeWidth="3" />
            <line x1="88" y1="34" x2="152" y2="34" stroke="#9ca3af" strokeWidth="2.5" />
            <line x1="70" y1="108" x2="170" y2="108" stroke="#3a3a3a" strokeWidth="5" />
            <line x1="82" y1="108" x2="82" y2="132" stroke="#3a3a3a" strokeWidth="3" />
            <line x1="158" y1="108" x2="158" y2="132" stroke="#3a3a3a" strokeWidth="3" />
            <circle cx="120" cy="56" r="9" />
            <line x1="120" y1="65" x2="120" y2="88" />
            <g className="apex-hm-pull-arms">
              <line x1="120" y1="74" x2="102" y2="82" />
              <line x1="120" y1="74" x2="138" y2="82" />
              <line x1="102" y1="82" x2="100" y2="44" />
              <line x1="138" y1="82" x2="140" y2="44" />
              <line x1="100" y1="44" x2="140" y2="44" stroke="#9ca3af" strokeWidth="2.5" />
            </g>
            <line x1="120" y1="88" x2="112" y2="108" />
            <line x1="120" y1="88" x2="128" y2="108" />
          </g>
        ) : null}
        {kind === 'pulse' ? (
          <g className="apex-hm-pulse-all" fill="none" stroke="#c8c8c8" strokeWidth="2" strokeLinecap="round">
            <circle cx="120" cy="60" r="22" stroke="#3a3a3a" />
            <circle cx="120" cy="60" r="9" />
            <line x1="120" y1="69" x2="120" y2="100" />
            <line x1="120" y1="100" x2="105" y2="122" />
            <line x1="120" y1="100" x2="135" y2="122" />
          </g>
        ) : null}
      </svg>
    </div>
  )
}
