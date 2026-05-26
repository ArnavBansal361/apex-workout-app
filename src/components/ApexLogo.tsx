import { APEX_LOGO_URL } from '../lib/apexBrand'

/** App icon mark — geometric white mountain from /public/apex-logo.svg */
export function ApexLogo({
  className,
  size = 80,
}: {
  className?: string
  /** Icon edge length in px (default 80 for auth / headers). */
  size?: number
}) {
  return (
    <img
      src={APEX_LOGO_URL}
      alt=""
      aria-hidden
      width={size}
      height={size}
      className={className}
      style={{ flexShrink: 0, display: 'block' }}
    />
  )
}
