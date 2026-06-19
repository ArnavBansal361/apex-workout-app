/** App icon mark — barbell, adapts to light/dark theme */
export function ApexLogo({
  className,
  size = 80,
}: {
  className?: string
  size?: number
}) {
  return (
    <span
      className={className}
      style={{
        flexShrink: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: size * 0.2,
        background: '#3d7ab5',
        border: 'none',
        color: '#ffffff',
      }}
    >
      <svg viewBox="0 0 80 80" width={size} height={size} aria-hidden>
        <rect x="14" y="33" width="6" height="14" rx="2" fill="currentColor"/>
        <rect x="20" y="36" width="4" height="8" rx="1" fill="currentColor"/>
        <rect x="24" y="38.5" width="32" height="3" rx="1.5" fill="currentColor"/>
        <rect x="56" y="36" width="4" height="8" rx="1" fill="currentColor"/>
        <rect x="60" y="33" width="6" height="14" rx="2" fill="currentColor"/>
      </svg>
    </span>
  )
}
