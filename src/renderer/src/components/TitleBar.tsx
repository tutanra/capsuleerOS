import { useEffect, useRef, useState } from 'react'
import { Portrait } from './Portrait'
import { useCharacter } from '../state/character'
import { formatIsk, formatNum, formatSecurity, securityColor } from '../lib/format'

function eveClock(date: Date): string {
  return new Intl.DateTimeFormat('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    timeZone: 'UTC'
  }).format(date)
}

export function TitleBar() {
  const { profiles, profile, select, remove, reorder, setAdding } = useCharacter()
  const character = profile?.character
  const [now, setNow] = useState(() => eveClock(new Date()))
  const [rosterOpen, setRosterOpen] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const rosterRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(eveClock(new Date())), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!rosterOpen) return
    const onPointer = (event: MouseEvent) => {
      if (!rosterRef.current?.contains(event.target as Node)) setRosterOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setRosterOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [rosterOpen])

  return (
    <>
    <header className="titlebar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true" />
        <span className="brand-name">capsuleerOS</span>
      </div>
      <div className="title-status">
        {character && profile && (
          <>
            <span className="sys">
              <i style={{ color: securityColor(character.security) }}>{formatSecurity(character.security)}</i>
              {character.system}
            </span>
            <span className="isk">{formatIsk(character.wallet)}</span>
          </>
        )}
        <span className="clock">EVE {now}</span>
        <div className="pilot-switch" ref={rosterRef}>
          <button
            type="button"
            className="pilot-btn"
            aria-expanded={rosterOpen}
            aria-haspopup="menu"
            onClick={() => (profile ? setRosterOpen((open) => !open) : setAdding(true))}
          >
            {profile && <Portrait profileId={profile.id} name={profile.character.name} small />}
            <span className="pilot">{profile ? profile.character.name : 'Añadir personaje'}</span>
          </button>
          {rosterOpen && profile && (
            <div className="roster" role="menu" aria-label="Personajes">
              <p className="roster-label">Personajes</p>
              {profiles.map((item) => (
                <div
                  key={item.id}
                  className={dragId === item.id ? 'roster-row dragging' : 'roster-row'}
                  onDragOver={(event) => {
                    event.preventDefault()
                    event.dataTransfer.dropEffect = 'move'
                  }}
                  onDrop={(event) => {
                    event.preventDefault()
                    if (!dragId || dragId === item.id) return
                    const ids = profiles.map((entry) => entry.id)
                    const from = ids.indexOf(dragId)
                    const to = ids.indexOf(item.id)
                    if (from < 0 || to < 0) return
                    ids.splice(from, 1)
                    ids.splice(to, 0, dragId)
                    reorder(ids)
                    setDragId(null)
                  }}
                >
                  <span
                    className="roster-grip"
                    draggable
                    aria-label={`Mover ${item.character.name}`}
                    onDragStart={(event) => {
                      setDragId(item.id)
                      event.dataTransfer.effectAllowed = 'move'
                      event.dataTransfer.setData('text/plain', item.id)
                    }}
                    onDragEnd={() => setDragId(null)}
                  >
                    ⋮⋮
                  </span>
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={item.id === profile.id}
                    className={item.id === profile.id ? 'roster-item selected' : 'roster-item'}
                    onClick={() => {
                      select(item.id)
                      setRosterOpen(false)
                    }}
                  >
                    <Portrait profileId={item.id} name={item.character.name} small />
                    <span>
                      <strong>{item.character.name}</strong>
                      <small>
                        {item.character.corp} · {formatSecurity(item.character.security)} {item.character.system}
                      </small>
                      <small className="mono">{formatNum(item.character.skillpoints)} SP</small>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="roster-remove"
                    onClick={() => {
                      void remove(item.id)
                    }}
                  >
                    Quitar
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="roster-add"
                onClick={() => {
                  setRosterOpen(false)
                  setAdding(true)
                }}
              >
                Añadir personaje
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="win-controls">
        <button type="button" aria-label="Minimizar" onClick={() => window.os?.minimize()}>
          –
        </button>
        <button type="button" aria-label="Maximizar" onClick={() => window.os?.toggleMaximize()}>
          □
        </button>
        <button type="button" className="close" aria-label="Cerrar" onClick={() => window.os?.close()}>
          ×
        </button>
      </div>
    </header>
    </>
  )
}
