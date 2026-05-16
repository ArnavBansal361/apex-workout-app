/** Wilderness mountain mark — sky glow, aurora, ridges, trees, summit, and APEX text use `accent`. */
export function ApexLogo({ accent, className }: { accent: string; className?: string }) {
  const a = accent
  return (
    <svg
      className={className}
      width={120}
      height={72}
      viewBox="0 0 120 72"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Apex"
    >
      <defs>
        <radialGradient id="apex-sky-glow" cx="50%" cy="28%" r="55%">
          <stop offset="0%" stopColor={a} stopOpacity="0.45" />
          <stop offset="55%" stopColor={a} stopOpacity="0.08" />
          <stop offset="100%" stopColor="#050508" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="apex-aurora" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={a} stopOpacity="0" />
          <stop offset="35%" stopColor={a} stopOpacity="0.55" />
          <stop offset="65%" stopColor={a} stopOpacity="0.35" />
          <stop offset="100%" stopColor={a} stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="120" height="72" fill="#050508" rx="2" />
      <ellipse cx="58" cy="22" rx="48" ry="26" fill="url(#apex-sky-glow)" />
      <path
        d="M4 14 Q28 10 52 12 T100 11 T118 16"
        stroke={a}
        strokeWidth="1.2"
        strokeLinecap="round"
        opacity="0.5"
      />
      <path
        d="M8 18 Q40 14 72 17 T112 20"
        stroke={a}
        strokeWidth="0.9"
        strokeLinecap="round"
        opacity="0.35"
      />
      <path
        d="M2 22 Q35 19 68 22 T116 24"
        stroke="url(#apex-aurora)"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.6"
      />
      <circle cx="18" cy="11" r="0.55" fill={a} opacity="0.85" />
      <circle cx="34" cy="8" r="0.45" fill={a} opacity="0.7" />
      <circle cx="52" cy="10" r="0.5" fill={a} opacity="0.9" />
      <circle cx="78" cy="9" r="0.4" fill={a} opacity="0.65" />
      <circle cx="96" cy="12" r="0.55" fill={a} opacity="0.8" />
      <circle cx="108" cy="7" r="0.35" fill={a} opacity="0.55" />
      <path
        d="M12 52 L28 32 L42 38 L58 24 L74 36 L88 30 L108 48 L108 52 Z"
        fill={a}
        fillOpacity="0.14"
        stroke={a}
        strokeOpacity="0.35"
        strokeWidth="0.6"
      />
      <path d="M22 50 L38 36 L52 42 L62 34 L78 44 L92 40 L108 50 V52 H12 Z" fill={a} fillOpacity="0.22" />
      <path d="M0 52 L24 44 L40 48 L58 40 L76 48 L92 46 L120 52 V72 H0 Z" fill="#0a0a0a" />
      <path d="M58 24 L62 34 L58 38 Z" fill={a} fillOpacity="0.18" />
      <path d="M88 30 L92 40 L86 42 Z" fill={a} fillOpacity="0.14" />
      <path
        d="M6 52 L10 42 L14 52 L12 46 Z M104 52 L108 40 L112 52 L110 45 Z"
        fill="#050508"
        opacity="0.92"
      />
      <circle cx="58" cy="26" r="2.2" fill={a} fillOpacity="0.35" />
      <circle cx="58" cy="26" r="1.1" fill={a} />
      <text
        x="60"
        y="66"
        textAnchor="middle"
        fill={a}
        style={{
          fontSize: '11px',
          fontWeight: 600,
          letterSpacing: '4px',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        APEX
      </text>
    </svg>
  )
}
