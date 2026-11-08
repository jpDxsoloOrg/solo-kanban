interface AppIconProps {
  className?: string;
}

/** The Solo Kanban mark (same motif as the PWA icon in public/icons). */
export function AppIcon({ className = "h-6 w-6" }: AppIconProps) {
  return (
    <svg viewBox="0 0 512 512" className={`shrink-0 ${className}`} aria-hidden="true" focusable="false">
      <rect width="512" height="512" rx="112" fill="#0666ee" />
      <g fill="#fff">
        <rect x="80" y="96" width="96" height="320" rx="24" fillOpacity="0.2" />
        <rect x="208" y="96" width="96" height="320" rx="24" fillOpacity="0.2" />
        <rect x="336" y="96" width="96" height="320" rx="24" fillOpacity="0.2" />
        <rect x="92" y="108" width="72" height="56" rx="12" />
        <rect x="92" y="176" width="72" height="56" rx="12" />
        <rect x="92" y="244" width="72" height="56" rx="12" />
        <rect x="220" y="108" width="72" height="56" rx="12" />
        <rect x="220" y="176" width="72" height="56" rx="12" />
        <rect x="348" y="108" width="72" height="56" rx="12" />
      </g>
    </svg>
  );
}
