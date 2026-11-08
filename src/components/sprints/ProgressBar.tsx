interface ProgressBarProps {
  value: number;
  max: number;
  /** Accessible name, e.g. "Sprint progress". */
  label: string;
  className?: string;
  barClassName?: string;
}

/** Thin horizontal progress bar. Works in server and client components. */
export function ProgressBar({
  value,
  max,
  label,
  className = "",
  barClassName = "bg-green-500",
}: ProgressBarProps) {
  const percent = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={`${value} of ${max}`}
      className={`h-1.5 overflow-hidden rounded-full bg-muted ring-1 ring-inset ring-border/60 ${className}`}
    >
      <div
        className={`h-full rounded-full transition-[width] duration-300 ${barClassName}`}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
