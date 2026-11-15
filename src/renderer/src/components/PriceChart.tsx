import { useEffect, useMemo, useRef, useState } from 'react'
import { formatIsk, formatNum } from '../lib/format'
import type { MarketDay } from '../types'

function compact(value: number): string {
  if (value >= 1_000_000_000) return `${formatNum(value / 1_000_000_000, 2)} mil M`
  if (value >= 1_000_000) return `${formatNum(value / 1_000_000, 2)} M`
  if (value >= 10_000) return `${formatNum(value / 1_000, 1)} mil`
  return formatNum(value, value < 100 ? 2 : 0)
}

function movingAverage(values: number[], window: number): Array<number | null> {
  const result: Array<number | null> = []
  let sum = 0
  for (let index = 0; index < values.length; index += 1) {
    sum += values[index] ?? 0
    if (index >= window) sum -= values[index - window] ?? 0
    result.push(index >= window - 1 ? sum / window : null)
  }
  return result
}

function dayLabel(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number)
  return new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1)))
}

function monthLabel(iso: string): string {
  const [year, month] = iso.split('-').map(Number)
  return new Intl.DateTimeFormat('es-ES', { month: 'short', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, 1))
  )
}

const MIN_DAYS = 7

function indexAt(x: number, count: number, padL: number, plotW: number): number {
  if (count <= 1) return 0
  const fraction = Math.min(1, Math.max(0, (x - padL) / plotW))
  return Math.round(fraction * (count - 1))
}

export function PriceChart({ days }: { days: MarketDay[] }) {
  const plot = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(720)
  const [plotHeight, setPlotHeight] = useState(360)
  const [hover, setHover] = useState<number | null>(null)
  const [rangeStart, setRangeStart] = useState<number | null>(null)

  useEffect(() => {
    const node = plot.current
    if (!node) return
    const measure = () => {
      setWidth(Math.max(320, node.clientWidth))
      setPlotHeight(Math.max(180, node.clientHeight))
    }
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    measure()
    return () => observer.disconnect()
  }, [days.length])

  useEffect(() => {
    setRangeStart(null)
    setHover(null)
  }, [days])

  const end = Math.max(0, days.length - 1)
  const start = Math.max(0, Math.min(rangeStart ?? 0, end))

  useEffect(() => {
    const node = plot.current
    if (!node || days.length < 2) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const last = days.length - 1
      setRangeStart((current) => {
        const from = current ?? 0
        const span = last - from
        const minSpan = Math.min(MIN_DAYS - 1, last)
        const zoomIn = event.deltaY < 0
        const step = Math.max(1, Math.round(span * 0.12))
        const nextSpan = zoomIn ? Math.max(minSpan, span - step) : Math.min(last, span + step)
        if (nextSpan === span) return current
        return Math.max(0, last - nextSpan)
      })
      setHover(null)
    }
    node.addEventListener('wheel', onWheel, { passive: false })
    return () => node.removeEventListener('wheel', onWheel)
  }, [days])

  const chart = useMemo(() => {
    if (days.length === 0) return null
    const shown = days.slice(start, end + 1)
    const padL = 58
    const padR = 12
    const padT = 8
    const padB = 22
    const gap = 18
    const usable = Math.max(140, plotHeight - padT - padB - gap)
    const volumeH = Math.max(52, Math.round(usable * 0.22))
    const priceH = usable - volumeH
    const plotW = Math.max(1, width - padL - padR)
    const lows = shown.map((day) => day.lowest)
    const highs = shown.map((day) => day.highest)
    const averages = shown.map((day) => day.average)
    const fullAverages = days.map((day) => day.average)
    const min = Math.min(...lows, ...averages)
    const max = Math.max(...highs, ...averages)
    const span = max - min || Math.max(max * 0.04, 1)
    const low = min - span * 0.06
    const high = max + span * 0.08
    const maxVolume = Math.max(...shown.map((day) => day.volume), 1)
    const xAt = (index: number) => padL + (shown.length === 1 ? plotW / 2 : (index / (shown.length - 1)) * plotW)
    const yPrice = (value: number) => padT + (1 - (value - low) / (high - low)) * priceH
    const volumeTop = padT + priceH + gap
    const yVolume = (value: number) => volumeTop + volumeH - (value / maxVolume) * volumeH
    const ma5 = movingAverage(fullAverages, 5).slice(start, end + 1)
    const ma20 = movingAverage(fullAverages, 20).slice(start, end + 1)
    const line = (series: Array<number | null>) =>
      series
        .map((value, index) => (value == null ? '' : `${index === series.findIndex((item) => item != null) ? 'M' : 'L'}${xAt(index).toFixed(1)},${yPrice(value).toFixed(1)}`))
        .join(' ')
    const band = `${shown.map((day, index) => `${index === 0 ? 'M' : 'L'}${xAt(index).toFixed(1)},${yPrice(day.highest).toFixed(1)}`).join(' ')} ${[...shown]
      .reverse()
      .map((day, index) => `L${xAt(shown.length - 1 - index).toFixed(1)},${yPrice(day.lowest).toFixed(1)}`)
      .join(' ')} Z`
    const ticks = [0, 0.33, 0.66, 1].map((step) => low + (high - low) * step)
    const months: { x: number; label: string }[] = []
    if (shown.length <= 45) {
      const step = shown.length <= 16 ? 1 : shown.length <= 32 ? 2 : 4
      for (let index = 0; index < shown.length; index += step) {
        months.push({ x: xAt(index), label: shown[index]?.date.slice(8) ?? '' })
      }
    } else {
      let lastMonth = ''
      let lastX = -80
      for (let index = 0; index < shown.length; index += 1) {
        const month = shown[index]?.date.slice(0, 7) ?? ''
        const x = xAt(index)
        if (month !== lastMonth && x - lastX > 46) {
          months.push({ x, label: monthLabel(shown[index]?.date ?? '') })
          lastMonth = month
          lastX = x
        }
      }
    }
    return { padL, padT, priceH, volumeTop, volumeH, plotW, xAt, yPrice, yVolume, band, ma5: line(ma5), ma20: line(ma20), ticks, months, shown, height: volumeTop + volumeH + padB }
  }, [days, start, end, width, plotHeight])

  if (!chart) return <p className="empty">Sin historial de precios en esta región.</p>
  const shown = chart.shown
  const active = hover == null ? null : shown[hover] ?? null

  return (
    <div className="history">
      <div className="history-legend">
        <span><i className="swatch price" /> Precio medio</span>
        <span><i className="swatch range" /> Mín/máx</span>
        <span><i className="swatch ma5" /> Media 5 d</span>
        <span><i className="swatch ma20" /> Media 20 d</span>
        <span><i className="swatch volume" /> Volumen</span>
      </div>
      <div className="history-plot" ref={plot}>
      <svg
        width={width}
        height={chart.height}
        role="img"
        aria-label="Historial de precios. Rueda del ratón para cambiar el periodo."
        onMouseLeave={() => setHover(null)}
        onMouseMove={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect()
          const x = ((event.clientX - bounds.left) / bounds.width) * width
          setHover(indexAt(x, shown.length, chart.padL, chart.plotW))
        }}
      >
        {chart.ticks.map((tick) => (
          <g key={tick}>
            <line x1={chart.padL} x2={width - 12} y1={chart.yPrice(tick)} y2={chart.yPrice(tick)} stroke="rgba(255,255,255,0.06)" />
            <text x={4} y={chart.yPrice(tick) + 4} fill="#8b98a8" fontSize="11">
              {compact(tick)}
            </text>
          </g>
        ))}
        <path d={chart.band} fill="rgba(126, 138, 154, 0.38)" />
        {shown.map((day, index) => (
          <line
            key={day.date}
            x1={chart.xAt(index)}
            x2={chart.xAt(index)}
            y1={chart.yPrice(day.highest)}
            y2={chart.yPrice(day.lowest)}
            stroke="rgba(186, 196, 208, 0.55)"
            strokeWidth="1"
          />
        ))}
        {shown.map((day, index) => (
          <circle key={`${day.date}-dot`} cx={chart.xAt(index)} cy={chart.yPrice(day.average)} r={shown.length > 180 ? 1.5 : 2.2} fill="#e39a45" />
        ))}
        <path d={chart.ma5} fill="none" stroke="#6ec8d6" strokeWidth="1.7" />
        <path d={chart.ma20} fill="none" stroke="#e0c27a" strokeWidth="1.7" />
        {shown.map((day, index) => (
          <rect
            key={`${day.date}-vol`}
            x={chart.xAt(index) - Math.max(0.6, chart.plotW / shown.length / 2 - 0.3)}
            y={chart.yVolume(day.volume)}
            width={Math.max(1, chart.plotW / shown.length - 0.4)}
            height={Math.max(0, chart.volumeTop + chart.volumeH - chart.yVolume(day.volume))}
            fill="rgba(90, 150, 196, 0.72)"
          />
        ))}
        {chart.months.map((month) => (
          <text key={`${month.label}-${month.x}`} x={month.x} y={chart.height - 6} fill="#8b98a8" fontSize="11">
            {month.label}
          </text>
        ))}
        {hover != null && (
          <line x1={chart.xAt(hover)} x2={chart.xAt(hover)} y1={chart.padT} y2={chart.volumeTop + chart.volumeH} stroke="rgba(224, 194, 122, 0.45)" />
        )}
      </svg>
      </div>
      {active && hover != null && (
        <div className="history-tip" style={{ left: Math.min(width - 180, Math.max(8, chart.xAt(hover) + 8)) }}>
          <strong>{dayLabel(active.date)}</strong>
          <span>Medio {formatIsk(active.average)}</span>
          <span>Máx {formatIsk(active.highest)}</span>
          <span>Mín {formatIsk(active.lowest)}</span>
          <span>Volumen {formatNum(active.volume)}</span>
        </div>
      )}
    </div>
  )
}
