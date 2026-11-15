export function formatNum(value: number, digits = 0): string {
  return new Intl.NumberFormat('es-ES', {
    useGrouping: true,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(value)
}

export function formatIsk(value: number): string {
  return `${formatNum(value, 2)} ISK`
}

export function formatSignedIsk(value: number): string {
  const core = formatIsk(Math.abs(value))
  if (value > 0) return `+${core}`
  if (value < 0) return `−${core}`
  return core
}

export function securityColor(security: number): string {
  if (security >= 0.9) return '#4aa0e0'
  if (security >= 0.5) return '#6fbf4a'
  if (security > 0) return '#d4a017'
  return '#d64545'
}

export function formatSecurity(security: number): string {
  return security.toFixed(1)
}

export function formatEveDate(value: string | number | null): string {
  if (value == null) return 'En pausa'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'En pausa'
  const text = new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'UTC'
  }).format(date)
  return `${text} EVE`
}
