import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode
} from 'react'
import { createPortal } from 'react-dom'
import { useCharacter } from '../state/character'

const cache = new Map<number, SkillTipInfo>()
const GAP = 6
const EDGE = 8
const MAX_WIDTH = 420
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'] as const

type SkillTipInfo = {
  description: string
  requirements: Array<{ typeId: number; name: string; level: number }>
}

type Props = {
  typeId?: number
  name: string
  children?: ReactNode
}

type Place = { top?: number; bottom?: number; left: number; maxHeight: number; width: number }

/** CSS zoom en <html> desincroniza getBoundingClientRect (visual) y top/left de fixed. */
function uiZoom(): number {
  const parsed = Number.parseFloat(getComputedStyle(document.documentElement).zoom || '1')
  if (Number.isFinite(parsed) && parsed > 0) return parsed
  const el = document.documentElement
  if (el.offsetWidth > 0) {
    const ratio = el.getBoundingClientRect().width / el.offsetWidth
    if (Number.isFinite(ratio) && ratio > 0) return ratio
  }
  return 1
}

function levelLabel(level: number): string {
  return ROMAN[level] ?? String(level)
}

function ReqPips({ current, required }: { current: number; required: number }) {
  return (
    <span className="pips" aria-label={`Nivel ${current} de ${required} requerido`}>
      {Array.from({ length: 5 }, (_, index) => {
        const rank = index + 1
        const filled = rank <= current
        const needed = !filled && rank <= required
        const className = filled
          ? current >= 5
            ? 'pip max'
            : 'pip on'
          : needed
            ? 'pip need'
            : 'pip'
        return <i key={index} className={className} />
      })}
    </span>
  )
}

export function SkillTip({ typeId, name, children }: Props) {
  const tipId = useId()
  const { profile } = useCharacter()
  const anchor = useRef<HTMLButtonElement>(null)
  const bubble = useRef<HTMLSpanElement>(null)
  const [open, setOpen] = useState(false)
  const [info, setInfo] = useState<SkillTipInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [place, setPlace] = useState<Place | null>(null)

  const levelById = useMemo(() => {
    const map = new Map<number, number>()
    for (const group of profile?.skillGroups ?? []) {
      for (const skill of group.skills) {
        if (skill.typeId != null) map.set(skill.typeId, skill.level)
      }
    }
    return map
  }, [profile])

  useEffect(() => {
    if (!open) return
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node
      if (!anchor.current?.contains(target) && !bubble.current?.contains(target)) {
        setOpen(false)
      }
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  useLayoutEffect(() => {
    if (!open || !anchor.current) {
      setPlace(null)
      return
    }
    const update = () => {
      const rect = anchor.current!.getBoundingClientRect()
      const z = uiZoom()
      const viewW = window.visualViewport?.width ?? window.innerWidth
      const viewH = window.visualViewport?.height ?? window.innerHeight
      const widthVisual = Math.min(MAX_WIDTH, viewW - EDGE * 2)
      // Mitad inferior → tip arriba; mitad superior → tip abajo.
      const anchorMid = (rect.top + rect.bottom) / 2
      const placeBelow = anchorMid < viewH / 2
      const spaceBelow = Math.max(0, viewH - rect.bottom - GAP - EDGE)
      const spaceAbove = Math.max(0, rect.top - GAP - EDGE)
      // Usa casi todo el hueco disponible para evitar scrollbar.
      const maxHeightVisual = Math.max(120, placeBelow ? spaceBelow : spaceAbove)
      let leftVisual = rect.left
      leftVisual = Math.min(leftVisual, viewW - widthVisual - EDGE)
      leftVisual = Math.max(EDGE, leftVisual)
      const placeNext: Place = placeBelow
        ? {
            top: (rect.bottom + GAP) / z,
            left: leftVisual / z,
            maxHeight: maxHeightVisual / z,
            width: widthVisual / z
          }
        : {
            bottom: (viewH - rect.top + GAP) / z,
            left: leftVisual / z,
            maxHeight: maxHeightVisual / z,
            width: widthVisual / z
          }
      setPlace(placeNext)
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    window.visualViewport?.addEventListener('resize', update)
    window.visualViewport?.addEventListener('scroll', update)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
      window.visualViewport?.removeEventListener('resize', update)
      window.visualViewport?.removeEventListener('scroll', update)
    }
  }, [open, info, loading])

  const toggle = (event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    if (!typeId || !window.os?.skillDescription) return
    if (open) {
      setOpen(false)
      return
    }
    const cached = cache.get(typeId)
    if (cached != null) {
      setInfo(cached)
      setLoading(false)
      setOpen(true)
      return
    }
    setLoading(true)
    setOpen(true)
    setInfo(null)
    void window.os
      .skillDescription(typeId)
      .then((next) => {
        const payload: SkillTipInfo = {
          description: next.description,
          requirements: next.requirements ?? []
        }
        cache.set(typeId, payload)
        setInfo(payload)
      })
      .catch(() => {
        const empty: SkillTipInfo = { description: '', requirements: [] }
        cache.set(typeId, empty)
        setInfo(empty)
      })
      .finally(() => setLoading(false))
  }

  const bubbleStyle: CSSProperties | undefined = place
    ? {
        top: place.top,
        bottom: place.bottom,
        left: place.left,
        maxHeight: place.maxHeight,
        width: place.width
      }
    : undefined

  const requirements = info?.requirements ?? []
  const description = info?.description ?? ''

  return (
    <span className={open ? 'skill-tip open' : 'skill-tip'} aria-describedby={open ? tipId : undefined}>
      <button ref={anchor} type="button" className="skill-tip-name" onClick={toggle}>
        {name}
      </button>
      {children}
      {open &&
        place &&
        createPortal(
          <span
            ref={bubble}
            className="skill-tip-bubble"
            id={tipId}
            role="dialog"
            aria-label={`Descripción de ${name}`}
            style={bubbleStyle}
          >
            <strong>{name}</strong>
            {loading ? (
              <span className="dim">Cargando descripción…</span>
            ) : (
              <>
                {description ? (
                  <span className="skill-tip-body">{description}</span>
                ) : (
                  <span className="dim">Sin descripción disponible.</span>
                )}
                {requirements.length > 0 && (
                  <span className="skill-tip-reqs">
                    <span className="skill-tip-reqs-title">Requisitos</span>
                    {requirements.map((req) => {
                      const current = levelById.get(req.typeId) ?? 0
                      const met = current >= req.level
                      return (
                        <span
                          key={req.typeId}
                          className={met ? 'skill-tip-req met' : 'skill-tip-req missing'}
                        >
                          <span className="skill-tip-req-mark" aria-hidden>
                            {met ? '✓' : '✗'}
                          </span>
                          <span className="skill-tip-req-name">
                            {req.name} {levelLabel(req.level)}
                          </span>
                          <ReqPips current={current} required={req.level} />
                        </span>
                      )
                    })}
                  </span>
                )}
              </>
            )}
          </span>,
          document.body
        )}
    </span>
  )
}
