import type { ModuleId } from '../types'

type IconProps = { id: ModuleId }

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const
}

export function IskIcon({ size = 12, className }: { size?: number; className?: string }) {
  return (
    <svg
      className={className ?? 'isk-icon'}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      {...stroke}
    >
      <path d="M12 3v18" />
      <path d="M8 7.5h6.2a2.8 2.8 0 0 1 0 5.6H9.2a2.8 2.8 0 0 0 0 5.6H16" />
    </svg>
  )
}

export function ModuleIcon({ id }: IconProps) {
  const common = {
    width: 22,
    height: 22,
    viewBox: '0 0 24 24',
    ...stroke
  }

  if (id === 'overview') {
    return (
      <svg {...common}>
        <circle cx="12" cy="8" r="3" />
        <path d="M5.5 19.5c1.2-3.2 3.4-4.8 6.5-4.8s5.3 1.6 6.5 4.8" />
      </svg>
    )
  }

  if (id === 'skills') {
    return (
      <svg {...common}>
        <path d="M5 17v3M12 11v9M19 6v14" />
      </svg>
    )
  }

  if (id === 'inventory') {
    return (
      <svg {...common}>
        <path d="M3 8l9-4 9 4v11H3V8z" />
        <path d="M3 8l9 4 9-4M12 12v7" />
      </svg>
    )
  }

  if (id === 'prices') {
    return (
      <svg {...common}>
        <path d="M6.5 3.5v3M6.5 14.5V20" />
        <rect x="4.2" y="6.5" width="4.6" height="8" rx="0.6" />
        <path d="M12 5.5v2.2M12 16.2V21" />
        <rect x="9.7" y="7.7" width="4.6" height="8.5" rx="0.6" />
        <path d="M17.5 3v2.4M17.5 12.4V17" />
        <rect x="15.2" y="5.4" width="4.6" height="7" rx="0.6" />
      </svg>
    )
  }

  if (id === 'market') {
    return (
      <svg {...common}>
        <path d="M4 16l4-5 4 3 4-7 4 2" />
        <path d="M4 20h16" />
      </svg>
    )
  }

  if (id === 'settings') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 3.5v2.2M12 18.3V20.5M3.5 12h2.2M18.3 12H20.5M5.9 5.9l1.6 1.6M16.5 16.5l1.6 1.6M5.9 18.1l1.6-1.6M16.5 7.5l1.6-1.6" />
      </svg>
    )
  }

  return (
    <svg {...common}>
      <path d="M12 3v18" />
      <path d="M8 7.5h6.2a2.8 2.8 0 0 1 0 5.6H9.2a2.8 2.8 0 0 0 0 5.6H16" />
    </svg>
  )
}
