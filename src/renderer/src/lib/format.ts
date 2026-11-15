export function formatNum(value: number, digits = 0): string {
  return new Intl.NumberFormat('es-ES', {
    useGrouping: true,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(value)
}

/** Solo la cifra; en UI usar el componente <Isk /> con icono de monedero. */
export function formatIsk(value: number): string {
  return formatNum(value, 2)
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

export type ClockMode = 'eve' | 'local'

let clockMode: ClockMode = 'eve'

export function getClockMode(): ClockMode {
  return clockMode
}

export function setClockMode(mode: ClockMode): void {
  clockMode = mode === 'local' ? 'local' : 'eve'
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

function dateParts(date: Date): { day: number; month: number; year: number; hour: number; minute: number } {
  if (clockMode === 'local') {
    return {
      day: date.getDate(),
      month: date.getMonth() + 1,
      year: date.getFullYear() % 100,
      hour: date.getHours(),
      minute: date.getMinutes()
    }
  }
  return {
    day: date.getUTCDate(),
    month: date.getUTCMonth() + 1,
    year: date.getUTCFullYear() % 100,
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes()
  }
}

const MONTH_INDEX: Record<string, number> = {
  ene: 0,
  jan: 0,
  feb: 1,
  mar: 2,
  abr: 3,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  ago: 7,
  aug: 7,
  sep: 8,
  sept: 8,
  oct: 9,
  nov: 10,
  dic: 11,
  dec: 11
}

function parseDateValue(value: string | number | Date): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (typeof value === 'number') {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
  }
  if (/^\d{2}\.\d{2}\.\d{2}/.test(value)) {
    const [datePart, timePart] = value.split(/\s+/)
    const [day, month, year] = datePart!.split('.').map(Number)
    const [hour = 0, minute = 0] = (timePart ?? '0:0').split(':').map(Number)
    const fullYear = 2000 + (year ?? 0)
    const date = new Date(Date.UTC(fullYear, (month ?? 1) - 1, day ?? 1, hour, minute))
    return Number.isNaN(date.getTime()) ? null : date
  }
  const legacy = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .match(/(\d{1,2})\s*([a-z]{3,5})\.?(?:\s+(\d{2,4}))?(?:\s+(\d{1,2}):(\d{2}))?/i)
  if (legacy) {
    const day = Number(legacy[1])
    const month = MONTH_INDEX[legacy[2]!.slice(0, 3).toLowerCase()]
    const rawYear = legacy[3] ? Number(legacy[3]) : new Date().getUTCFullYear()
    const year = rawYear < 100 ? 2000 + rawYear : rawYear
    const hour = legacy[4] ? Number(legacy[4]) : 0
    const minute = legacy[5] ? Number(legacy[5]) : 0
    if (month != null) {
      const date = new Date(Date.UTC(year, month, day, hour, minute))
      if (!Number.isNaN(date.getTime())) return date
    }
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/** Fecha compacta: 13.02.27 (EVE/UTC o local según ajustes) */
export function formatDotDate(value: string | number | Date): string {
  const date = parseDateValue(value)
  if (!date) return '—'
  const parts = dateParts(date)
  return `${pad2(parts.day)}.${pad2(parts.month)}.${pad2(parts.year)}`
}

/** Fecha y hora: 13.02.27 14:30 */
export function formatDotDateTime(value: string | number | Date): string {
  const date = parseDateValue(value)
  if (!date) return '—'
  const parts = dateParts(date)
  return `${pad2(parts.day)}.${pad2(parts.month)}.${pad2(parts.year)} ${pad2(parts.hour)}:${pad2(parts.minute)}`
}

export function formatEveDate(value: string | number | null): string {
  if (value == null) return 'En pausa'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'En pausa'
  const text = formatDotDateTime(date)
  return clockMode === 'eve' ? `${text} EVE` : text
}

/** Reloj de la barra de título: siempre hora EVE (UTC). */
export function formatEveClock(date: Date): string {
  return new Intl.DateTimeFormat('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    timeZone: 'UTC'
  }).format(date)
}
