import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { setClockMode, type ClockMode } from '../lib/format'

const SCALE_KEY = 'capsuleeros.uiScale'
const CLOCK_KEY = 'capsuleeros.clockMode'
export const UI_SCALE_MIN = 0.75
export const UI_SCALE_MAX = 1.5
export const UI_SCALE_STEP = 0.05
export const UI_SCALE_DEFAULT = 1
export const CLOCK_MODE_DEFAULT: ClockMode = 'eve'

type SettingsContextValue = {
  uiScale: number
  setUiScale: (scale: number) => void
  clockMode: ClockMode
  setClockModePref: (mode: ClockMode) => void
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

function clampScale(value: number): number {
  const stepped = Math.round(value / UI_SCALE_STEP) * UI_SCALE_STEP
  return Math.min(UI_SCALE_MAX, Math.max(UI_SCALE_MIN, Number(stepped.toFixed(2))))
}

function readStoredScale(): number {
  try {
    const raw = localStorage.getItem(SCALE_KEY)
    if (raw == null) return UI_SCALE_DEFAULT
    const parsed = Number(raw)
    if (!Number.isFinite(parsed)) return UI_SCALE_DEFAULT
    return clampScale(parsed)
  } catch {
    return UI_SCALE_DEFAULT
  }
}

function readStoredClockMode(): ClockMode {
  try {
    const raw = localStorage.getItem(CLOCK_KEY)
    return raw === 'local' || raw === 'eve' ? raw : CLOCK_MODE_DEFAULT
  } catch {
    return CLOCK_MODE_DEFAULT
  }
}

function applyScale(scale: number): void {
  document.documentElement.style.setProperty('--ui-scale', String(scale))
  document.documentElement.style.zoom = String(scale)
}

const initialScale = typeof document === 'undefined' ? UI_SCALE_DEFAULT : readStoredScale()
const initialClock = typeof document === 'undefined' ? CLOCK_MODE_DEFAULT : readStoredClockMode()
if (typeof document !== 'undefined') {
  applyScale(initialScale)
  setClockMode(initialClock)
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [uiScale, setUiScaleState] = useState(initialScale)
  const [clockMode, setClockModeState] = useState<ClockMode>(initialClock)

  useEffect(() => {
    applyScale(uiScale)
  }, [uiScale])

  useEffect(() => {
    setClockMode(clockMode)
  }, [clockMode])

  const setUiScale = (scale: number) => {
    const next = clampScale(scale)
    setUiScaleState(next)
    applyScale(next)
    try {
      localStorage.setItem(SCALE_KEY, String(next))
    } catch {
      // ignore
    }
  }

  const setClockModePref = (mode: ClockMode) => {
    setClockModeState(mode)
    setClockMode(mode)
    try {
      localStorage.setItem(CLOCK_KEY, mode)
    } catch {
      // ignore
    }
  }

  const value = useMemo(
    () => ({ uiScale, setUiScale, clockMode, setClockModePref }),
    [uiScale, clockMode]
  )

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider')
  return ctx
}
