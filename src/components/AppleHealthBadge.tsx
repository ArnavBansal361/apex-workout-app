type Props = {
  className?: string
}

/** Small indicator that a metric is sourced from Apple Health. */
export function AppleHealthBadge({ className = '' }: Props) {
  return (
    <span
      className={`apex-health-badge inline-flex items-center gap-0.5 ${className}`.trim()}
      title="From Apple Health"
      aria-label="From Apple Health"
    >
      <svg
        className="apex-health-badge__icon"
        viewBox="0 0 16 16"
        width={12}
        height={12}
        aria-hidden
      >
        <path
          fill="currentColor"
          d="M12.9 2.2c-.6-.6-1.5-.9-2.4-.8-1 .1-1.9.7-2.4 1.6-.5-.9-1.4-1.5-2.4-1.6-.9-.1-1.8.2-2.4.8C2.1 3.4 1.6 5.2 2.4 7c.7 1.6 2.4 3.8 5.1 6.5.3.3.8.3 1.1 0 2.7-2.7 4.4-4.9 5.1-6.5.8-1.8.3-3.6-1.8-4.8z"
        />
      </svg>
      <span className="apex-health-badge__label">Health</span>
    </span>
  )
}
