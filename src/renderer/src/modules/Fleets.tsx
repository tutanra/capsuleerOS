import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { DiscordState } from '../../../shared/discord'
import { usePaneWidth } from '../lib/paneWidth'
import { useSettings } from '../state/settings'

type Bounds = {
  x: number
  y: number
  width: number
  height: number
}

function failure(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : ''
  const cleaned = message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '')
  return cleaned || fallback
}

function measureHost(el: HTMLElement): Bounds {
  const rect = el.getBoundingClientRect()
  const zoom = Number.parseFloat(getComputedStyle(document.documentElement).zoom) || 1
  const layoutWidth = el.offsetWidth
  const zoomed = layoutWidth > 0 && Math.abs(rect.width - layoutWidth * zoom) + 1 < Math.abs(rect.width - layoutWidth)
  const factor = zoomed || zoom === 1 ? 1 : zoom
  return {
    x: Math.round(rect.x * factor),
    y: Math.round(rect.y * factor),
    width: Math.max(0, Math.round(rect.width * factor)),
    height: Math.max(0, Math.round(rect.height * factor))
  }
}

export function Fleets({ active }: { active: boolean }) {
  const { uiScale } = useSettings()
  const channelsNav = usePaneWidth('capsuleeros.fleetsNav', 248, 180, 560)
  const hostRef = useRef<HTMLDivElement>(null)
  const [channels, setChannels] = useState<DiscordState['channels']>([])
  const [activeId, setActiveId] = useState('')
  const [url, setUrl] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  const apply = (state: DiscordState) => {
    setChannels(state.channels)
    setActiveId(state.activeId)
  }

  useEffect(() => {
    void window.os?.discordList().then(apply).catch(() => {
      setError('No se pudo leer la lista de canales.')
    })
    return () => {
      void window.os?.discordHide()
    }
  }, [])

  useEffect(() => {
    const el = hostRef.current
    if (!active || !activeId || !el || !window.os) {
      void window.os?.discordHide()
      return
    }
    const push = () => {
      const bounds = measureHost(el)
      if (bounds.width < 2 || bounds.height < 2) {
        void window.os?.discordHide()
        return
      }
      void window.os?.discordShow(bounds)
    }
    push()
    const frame = requestAnimationFrame(push)
    const observer = new ResizeObserver(push)
    observer.observe(el)
    window.addEventListener('resize', push)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('resize', push)
    }
  }, [active, activeId, uiScale, channelsNav.width])

  const current = channels.find((channel) => channel.id === activeId)

  const onAdd = async (event: FormEvent) => {
    event.preventDefault()
    if (!window.os || busy) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      apply(await window.os.discordAdd({ url, name }))
      setUrl('')
      setName('')
    } catch (caught) {
      setError(failure(caught, 'No se pudo añadir el canal.'))
    } finally {
      setBusy(false)
    }
  }

  const onSelect = async (id: string) => {
    if (!window.os || id === activeId) return
    setError('')
    setNotice('')
    try {
      apply(await window.os.discordSelect(id))
    } catch (caught) {
      setError(failure(caught, 'No se pudo abrir el canal.'))
    }
  }

  const onRemove = async (id: string) => {
    if (!window.os || busy) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      apply(await window.os.discordRemove(id))
    } catch (caught) {
      setError(failure(caught, 'No se pudo quitar el canal.'))
    } finally {
      setBusy(false)
    }
  }

  const onOpen = async () => {
    if (!window.os || !current) return
    setError('')
    try {
      await window.os.discordOpen(current.id)
    } catch (caught) {
      setError(failure(caught, 'No se pudo abrir Discord.'))
    }
  }

  const onLogout = async () => {
    if (!window.os || busy) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await window.os.discordLogout()
      setNotice('Sesión cerrada. Vuelve a entrar en el canal.')
    } catch (caught) {
      setError(failure(caught, 'No se pudo cerrar la sesión de Discord.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack">
      <div ref={channelsNav.ref} className="stack-main split fleets-split" style={channelsNav.style}>
      <aside className="fleets-side">
        <form className="fleets-add" onSubmit={(event) => void onAdd(event)}>
          <input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://discord.com/channels/…"
            aria-label="Enlace del canal"
            autoComplete="off"
            spellCheck={false}
          />
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Nombre (opcional)"
            aria-label="Nombre del canal"
            autoComplete="off"
            maxLength={60}
          />
          <button type="submit" disabled={busy || !url.trim()}>
            Añadir
          </button>
        </form>
        <div className="fleets-scroll nav-list">
          {channels.length === 0 && <p className="note fleets-hint">Pega el enlace de un canal para verlo aquí.</p>}
          {channels.map((channel) => (
            <div key={channel.id} className={channel.id === activeId ? 'nav-item selected fleets-row' : 'nav-item fleets-row'}>
              <button type="button" className="fleets-pick" aria-current={channel.id === activeId ? 'true' : undefined} onClick={() => void onSelect(channel.id)}>
                {channel.name}
              </button>
              <button type="button" className="fleets-remove" aria-label={`Quitar ${channel.name}`} disabled={busy} onClick={() => void onRemove(channel.id)}>
                ×
              </button>
            </div>
          ))}
        </div>
        {error && <p className="form-error fleets-hint">{error}</p>}
        {notice && <p className="note fleets-hint">{notice}</p>}
      </aside>
      <div
        className="pane-resize"
        role="separator"
        aria-orientation="vertical"
        aria-label="Ancho de los canales"
        aria-valuemin={channelsNav.min}
        aria-valuemax={channelsNav.max}
        aria-valuenow={channelsNav.width}
        tabIndex={0}
        onPointerDown={channelsNav.onPointerDown}
        onPointerMove={channelsNav.onPointerMove}
        onKeyDown={channelsNav.onKeyDown}
      />
      <section className="fleets-preview">
        <header className="toolbar fleets-toolbar">
          <span>{current?.name ?? 'Previsualización'}</span>
          <span className="fleets-toolbar-actions">
            <button type="button" disabled={!current} onClick={() => void onOpen()}>
              Abrir en Discord
            </button>
            <button type="button" disabled={busy} onClick={() => void onLogout()}>
              Cerrar sesión
            </button>
          </span>
        </header>
        <div ref={hostRef} className="fleets-host">
          {!current && <p className="note fleets-empty">Elige un canal del lateral para verlo aquí.</p>}
        </div>
      </section>
    </div>
  </div>
  )
}
