/** App icon mark — geometric mountain (matches profile avatar glyph). */
export function ApexLogo({
  className,
  size = 80,
}: {
  className?: string
  /** Icon edge length in px (default 80 for auth / headers). */
  size?: number
}) {
  return (
    <div
      className={className}
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: 16,
        background: '#13181f',
        border: '0.5px solid rgba(255, 255, 255, 0.08)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <svg
        viewBox="0 0 24 24"
        width={Math.round(size * 0.5)}
        height={Math.round(size * 0.5)}
        fill="none"
        aria-hidden
      >
        <path d="M3 18l6-8 4 5 3-4 5 7H3z" fill="#ffffff" />
      </svg>
    </div>
  )
}
