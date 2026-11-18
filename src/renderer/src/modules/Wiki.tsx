import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Spinner } from '../components/Spinner'

const WIKI = 'https://wiki.eveuniversity.org'

type Entry = {
  title: string
  hint: string
  path: string
}

type Page = {
  label: string
  url: string
}

const ANOMALIES: Entry[] = [
  { title: 'Combate', hint: 'Salen en el escáner, sin sondas', path: 'Combat_anomalies' },
  { title: 'Mineral', hint: 'Anomalías de asteroides', path: 'Category:Ore_sites' },
  { title: 'Hielo', hint: 'Cinturones de hielo', path: 'Category:Ice_belts' },
  { title: 'Guía de combate', hint: 'Qué sitio correr y con qué nave', path: 'Guide_to_combat_sites' }
]

const EXPLORATION: Entry[] = [
  { title: 'Exploración', hint: 'Guía general de la Uni', path: 'Exploration' },
  { title: 'Sondas', hint: 'Cómo localizar una firma', path: 'Probe_scanning' },
  { title: 'Reliquias y datos', hint: 'Hackeo de contenedores', path: 'Relic_and_data_sites' },
  { title: 'Gas', hint: 'Nubes de gas', path: 'Gas_cloud_harvesting' },
  { title: 'Firmas de combate', hint: 'Complejos y sitios DED', path: 'Combat_sites' },
  { title: 'Agujeros de gusano', hint: 'Conexiones y espacio de agujeros', path: 'Wormholes' }
]

function article(path: string) {
  return `${WIKI}/${path}`
}

function directSearch(query: string) {
  const params = new URLSearchParams({
    search: query,
    title: 'Special:Search',
    go: 'Go'
  })
  return `${WIKI}/index.php?${params.toString()}`
}

function labelFromUrl(url: string) {
  try {
    const parsed = new URL(url)
    if (parsed.hostname !== 'wiki.eveuniversity.org') return null
    const search = parsed.searchParams.get('search')
    if (parsed.pathname === '/index.php' && search) return search
    const slug = decodeURIComponent(parsed.pathname.replace(/^\//, ''))
    if (!slug || slug === 'index.php') return null
    return slug.replace(/_/g, ' ')
  } catch {
    return null
  }
}

type WikiView = HTMLElement & {
  src: string
  canGoBack: () => boolean
  goBack: () => void
  getURL: () => string
}

function webviewReady() {
  if (typeof document === 'undefined' || !window.os) return false
  const probe = document.createElement('webview') as WikiView
  return typeof probe.goBack === 'function' && typeof probe.canGoBack === 'function'
}

const nativeEmbed = webviewReady()

export function Wiki() {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<WikiView | null>(null)
  const frameRef = useRef<HTMLIFrameElement>(null)
  const entryUrl = useRef<string | null>(null)
  const requested = useRef<string | null>(null)
  const stack = useRef<Page[]>([])
  const known = useRef<Page[]>([])
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(false)
  const [frameUrl, setFrameUrl] = useState<string | null>(null)
  const [label, setLabel] = useState('UniWiki')
  const [canBack, setCanBack] = useState(false)
  const [booting, setBooting] = useState(false)

  useEffect(() => {
    if (!nativeEmbed || !active || !hostRef.current || !entryUrl.current) return
    const host = hostRef.current
    const view = document.createElement('webview') as WikiView
    view.setAttribute('partition', 'persist:wiki')
    view.setAttribute('webpreferences', 'contextIsolation=yes,nodeIntegration=no,sandbox=yes')
    view.className = 'wiki-frame is-booting'
    view.style.background = '#07090d'
    view.style.colorScheme = 'dark'
    const initial = requested.current ?? entryUrl.current
    view.setAttribute('src', initial)
    view.src = initial
    const conceal = () => {
      view.classList.add('is-booting')
      setBooting(true)
    }
    const reveal = () => {
      view.classList.remove('is-booting')
      setBooting(false)
    }
    view.addEventListener('did-start-loading', conceal)
    view.addEventListener('dom-ready', reveal)
    view.addEventListener('did-fail-load', reveal)
    const sync = (event: Event) => {
      const url = (event as Event & { url?: string }).url || view.getURL()
      const match = known.current.find((item) => item.url === url)
      const nextLabel = match?.label ?? labelFromUrl(url)
      if (nextLabel) setLabel(nextLabel)
      try {
        setCanBack(view.canGoBack())
      } catch {
        setCanBack(false)
      }
    }
    view.addEventListener('did-navigate', sync)
    view.addEventListener('did-navigate-in-page', sync)
    host.replaceChildren(view)
    viewRef.current = view
    return () => {
      viewRef.current = null
      view.remove()
    }
  }, [active])

  function conceal() {
    frameRef.current?.classList.add('is-booting')
    viewRef.current?.classList.add('is-booting')
    setBooting(true)
  }

  function reveal() {
    frameRef.current?.classList.remove('is-booting')
    setBooting(false)
  }

  function openPage(next: Page) {
    known.current.push(next)
    requested.current = next.url
    conceal()
    setLabel(next.label)
    if (!active) {
      entryUrl.current = next.url
      if (!nativeEmbed) {
        stack.current = [next]
        setFrameUrl(next.url)
        setCanBack(false)
      }
      setActive(true)
      return
    }
    const view = viewRef.current
    if (view) {
      view.src = next.url
      return
    }
    if (nativeEmbed) return
    stack.current.push(next)
    setCanBack(stack.current.length > 1)
    if (frameRef.current) frameRef.current.src = next.url
  }

  function close() {
    stack.current = []
    known.current = []
    entryUrl.current = null
    requested.current = null
    setActive(false)
    setFrameUrl(null)
    setLabel('UniWiki')
    setCanBack(false)
    setBooting(false)
  }

  function goBack() {
    const view = viewRef.current
    if (view) {
      try {
        if (!view.canGoBack()) return
        conceal()
        view.goBack()
      } catch {
        /* El invitado todavía no está listo. */
      }
      return
    }
    if (stack.current.length <= 1) return
    conceal()
    stack.current.pop()
    const previous = stack.current[stack.current.length - 1]
    setLabel(previous.label)
    setCanBack(stack.current.length > 1)
    if (frameRef.current) frameRef.current.src = previous.url
  }

  function openSearch(event: FormEvent) {
    event.preventDefault()
    const text = query.trim()
    if (!text) return
    openPage({ label: text, url: directSearch(text) })
  }

  return (
    <div className="stack">
      <header className="stage-title wiki-bar">
        {active && (
          <div className="wiki-nav">
            <button type="button" className="wiki-back" onClick={goBack} disabled={!canBack}>
              Atrás
            </button>
            <button type="button" className="wiki-back" onClick={close}>
              Menú
            </button>
          </div>
        )}
        <span className="wiki-label">{label}</span>
        <form className="wiki-search" onSubmit={openSearch}>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar en la UniWiki"
            aria-label="Buscar en la UniWiki"
          />
          <button type="submit">Buscar</button>
        </form>
      </header>
      {active && (
        <div className="wiki-stage">
          {nativeEmbed ? (
            <div ref={hostRef} className="wiki-frame-host" />
          ) : (
            frameUrl && (
              <iframe
                ref={frameRef}
                className={booting ? 'wiki-frame is-booting' : 'wiki-frame'}
                title={label}
                src={frameUrl}
                onLoad={reveal}
              />
            )
          )}
          {booting && (
            <div className="wiki-cover">
              <Spinner />
            </div>
          )}
        </div>
      )}
      {!active && (
        <div className="wiki-home">
          <Group title="Anomalías" note="Visibles en el escáner. No hace falta lanzar sondas." entries={ANOMALIES} onOpen={openPage} />
          <Group title="Exploración" note="Firmas ocultas. Hay que escanearlas con sondas." entries={EXPLORATION} onOpen={openPage} />
        </div>
      )}
    </div>
  )
}

function Group({
  title,
  note,
  entries,
  onOpen
}: {
  title: string
  note: string
  entries: Entry[]
  onOpen: (page: Page) => void
}) {
  return (
    <section className="wiki-group">
      <h2>{title}</h2>
      <p>{note}</p>
      <div className="wiki-cards">
        {entries.map((entry) => (
          <button
            key={entry.path}
            type="button"
            onClick={() => onOpen({ label: entry.title, url: article(entry.path) })}
          >
            <strong>{entry.title}</strong>
            <small>{entry.hint}</small>
          </button>
        ))}
      </div>
    </section>
  )
}
