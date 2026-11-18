import { useEffect, useRef, useState } from 'react'
import { Portrait } from './Portrait'
import { Spinner } from './Spinner'
import { useCharacter } from '../state/character'
import { Isk } from './Isk'
import { formatEveClock, formatNum, formatSecurity, securityColor } from '../lib/format'

function RefreshIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
      <path d="M16 16h5v5" />
    </svg>
  )
}

function DataRefresh() {
  const { profile, refreshing, loadingCharacters, refreshNow } = useCharacter()
  if (!profile || !window.os?.listCharacters) return null
  if (refreshing || loadingCharacters) {
    return (
      <span className="refresh-slot" title="Actualizando datos">
        <Spinner />
      </span>
    )
  }
  return (
    <button
      type="button"
      className="refresh-slot"
      aria-label="Actualizar datos"
      title="Actualizar datos"
      onClick={() => refreshNow()}
    >
      <RefreshIcon />
    </button>
  )
}

export function TitleBar() {
  const { profiles, profile, select, remove, reorder, setAdding } = useCharacter()
  const character = profile?.character
  const [now, setNow] = useState(() => formatEveClock(new Date()))
  const [rosterOpen, setRosterOpen] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const rosterRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(formatEveClock(new Date())), 1000)
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
        <img className="brand-mark" src={`${import.meta.env.BASE_URL}icon.png`} alt="" width={22} height={22} draggable={false} />
        <span className="brand-name">capsuleerOS</span>
      </div>
      <div className="title-status">
        {character && profile && (
          <>
            <span className="sys">
              <i style={{ color: securityColor(character.security) }}>{formatSecurity(character.security)}</i>
              {character.system}
            </span>
            <span className="isk">
              <Isk value={character.wallet} />
            </span>
          </>
        )}
        <DataRefresh />
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
