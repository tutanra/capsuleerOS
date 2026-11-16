import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'

function readPaneWidth(key: string, fallback: number, min: number, max: number): number {
  try {
    const stored = localStorage.getItem(key)
    if (stored == null || stored.trim() === '') return fallback
    const raw = Number(stored)
    if (!Number.isFinite(raw)) return fallback
    return Math.min(max, Math.max(min, Math.round(raw)))
  } catch {
    return fallback
  }
}

function rememberPaneWidth(key: string, width: number): void {
  try {
    localStorage.setItem(key, String(width))
  } catch {
    // ignore
  }
}

function cssWidth(split: HTMLElement, clientX: number): number {
  const zoom = Number.parseFloat(getComputedStyle(document.documentElement).zoom) || 1
  const rect = split.getBoundingClientRect()
  const zoomed =
    split.offsetWidth > 0 &&
    Math.abs(rect.width - split.offsetWidth * zoom) + 1 < Math.abs(rect.width - split.offsetWidth)
  return (clientX - rect.left) / (zoomed ? zoom : 1)
}

export function usePaneWidth(key: string, fallback: number, min: number, max: number) {
  const [width, setWidth] = useState(() => readPaneWidth(key, fallback, min, max))
  const ref = useRef<HTMLDivElement>(null)

  const apply = (next: number) => {
    const clamped = Math.min(max, Math.max(min, Math.round(next)))
    setWidth(clamped)
    rememberPaneWidth(key, clamped)
  }

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    const split = ref.current
    if (!split) return
    event.currentTarget.setPointerCapture(event.pointerId)
    apply(cssWidth(split, event.clientX))
  }

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const split = ref.current
    if (!split || !event.currentTarget.hasPointerCapture(event.pointerId)) return
    apply(cssWidth(split, event.clientX))
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    apply(width + (event.key === 'ArrowRight' ? 16 : -16))
  }

  const style = { '--pane-nav': `${width}px` } as CSSProperties
  return { width, min, max, ref, style, onPointerDown, onPointerMove, onKeyDown }
}

const SPLIT_HANDLE = 8

function readFraction(key: string, fallback: number, min: number, max: number): number {
  try {
    const stored = localStorage.getItem(key)
    if (stored == null || stored.trim() === '') return fallback
    const raw = Number(stored)
    if (!Number.isFinite(raw)) return fallback
    return Math.min(max, Math.max(min, raw))
  } catch {
    return fallback
  }
}

function rememberFraction(key: string, value: number): void {
  try {
    localStorage.setItem(key, String(value))
  } catch {
    // ignore
  }
}

function fractionFromPointer(split: HTMLElement, clientY: number): number {
  const zoom = Number.parseFloat(getComputedStyle(document.documentElement).zoom) || 1
  const rect = split.getBoundingClientRect()
  const zoomed =
    split.offsetHeight > 0 &&
    Math.abs(rect.height - split.offsetHeight * zoom) + 1 < Math.abs(rect.height - split.offsetHeight)
  const scale = zoomed ? zoom : 1
  const content = scale * (split.offsetHeight - SPLIT_HANDLE)
  if (content <= 0) return 0
  return (clientY - rect.top) / content
}

export function useSplitFraction(key: string, fallback: number, min: number, max: number) {
  const [fraction, setFraction] = useState(() => readFraction(key, fallback, min, max))
  const ref = useRef<HTMLDivElement>(null)

  const apply = (next: number) => {
    const clamped = Math.min(max, Math.max(min, Math.round(next * 1000) / 1000))
    setFraction(clamped)
    rememberFraction(key, clamped)
  }

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    const split = ref.current
    if (!split) return
    event.currentTarget.setPointerCapture(event.pointerId)
    apply(fractionFromPointer(split, event.clientY))
  }

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const split = ref.current
    if (!split || !event.currentTarget.hasPointerCapture(event.pointerId)) return
    apply(fractionFromPointer(split, event.clientY))
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    event.preventDefault()
    apply(fraction + (event.key === 'ArrowDown' ? 0.04 : -0.04))
  }

  const percent = Math.round(fraction * 100)
  const style = { '--pane-split': String(fraction) } as CSSProperties
  return { fraction, percent, min, max, ref, style, onPointerDown, onPointerMove, onKeyDown }
}
