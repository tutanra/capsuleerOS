import { memo, useEffect, useMemo, useState } from 'react'
import { PriceChart } from '../components/PriceChart'
import { Spinner } from '../components/Spinner'
import { TypeIcon } from '../components/TypeIcon'
import { formatIsk, formatNum } from '../lib/format'
import { useCharacter } from '../state/character'
import { MARKET_REGIONS, type MarketBook, type MarketDay, type MarketTypeHit } from '../types'

function regionChoices(regionId?: number, regionName?: string): { id: number; name: string }[] {
  const hubs = MARKET_REGIONS.filter((region) => region.id !== regionId)
  if (!regionId) return [{ id: 0, name: 'Todas' }, ...hubs]
  return [{ id: 0, name: 'Todas' }, { id: regionId, name: `${regionName || 'Región'} (actual)` }, ...hubs]
}

function characterIdOf(profileId: string): number | null {
  const id = profileId.startsWith('eve-') ? Number(profileId.slice(4)) : Number.NaN
  return Number.isInteger(id) && id > 0 ? id : null
}

function expiresIn(iso: string): string {
  const minutes = Math.round((new Date(iso).getTime() - Date.now()) / 60_000)
  if (!Number.isFinite(minutes)) return '—'
  if (minutes <= 0) return 'caducada'
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  if (days > 0) return `${days} d ${hours} h`
  if (hours > 0) return `${hours} h`
  return `${minutes} min`
}

function BookTable({
  orders,
  buy,
  markCheapest,
  loading
}: {
  orders: MarketBook['sells']
  buy: boolean
  markCheapest: boolean
  loading: boolean
}) {
  const columns = buy ? 5 : 4
  return (
    <table className="order-table dense">
      <thead>
        <tr>
          <th className="num">Cantidad</th>
          <th className="num">Precio</th>
          {buy && <th>Rango</th>}
          <th>Ubicación</th>
          <th>Expira en</th>
        </tr>
      </thead>
      <tbody>
        {orders.length === 0 && (
          <tr>
            <td colSpan={columns}>{loading ? <span className="loading-note"><Spinner /> Cargando…</span> : 'Sin órdenes.'}</td>
          </tr>
        )}
        {orders.map((order, index) => (
          <tr key={`${order.price}-${order.volume}-${order.location}-${index}`} className={markCheapest && index === 0 ? 'cheapest' : undefined}>
            <td className="num">{formatNum(order.volume)}</td>
            <td className="num">{formatIsk(order.price)}</td>
            {buy && <td>{order.range}</td>}
            <td className="place" title={order.location}>
              {order.location}
            </td>
            <td>{expiresIn(order.expires)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export const ItemMarket = memo(function ItemMarket() {
  const profile = useCharacter().profile
  const characterId = profile ? characterIdOf(profile.id) : null
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<MarketTypeHit[]>([])
  const [searching, setSearching] = useState(false)
  const [item, setItem] = useState<MarketTypeHit | null>(null)
  const [regionId, setRegionId] = useState(0)
  const [regions, setRegions] = useState(() => regionChoices(profile?.character.regionId, profile?.character.region))
  const [book, setBook] = useState<MarketBook | null>(null)
  const [history, setHistory] = useState<MarketDay[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [view, setView] = useState<'chart' | 'orders'>('orders')

  useEffect(() => {
    const current = profile?.character
    if (current?.regionId) setRegions(regionChoices(current.regionId, current.region))
  }, [profile?.character.regionId, profile?.character.region])

  useEffect(() => {
    if (!characterId || !window.os?.characterMarketRegion) return
    let active = true
    void window.os.characterMarketRegion(characterId).then((region) => {
      if (!active || !region) return
      setRegions(regionChoices(region.id, region.name))
    })
    return () => {
      active = false
    }
  }, [characterId])

  useEffect(() => {
    if (query.trim().length < 3 || query === item?.name || !window.os?.searchMarketTypes) {
      setHits([])
      setSearching(false)
      return
    }
    let active = true
    setSearching(true)
    const timer = window.setTimeout(() => {
      void window.os
        ?.searchMarketTypes(query)
        .then((rows) => {
          if (active) setHits(rows)
        })
        .catch((reason: unknown) => {
          if (active) setError(reason instanceof Error ? reason.message : 'No se pudo buscar el objeto.')
        })
        .finally(() => {
          if (active) setSearching(false)
        })
    }, 250)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [item, query])

  useEffect(() => {
    if (!characterId || !item || !window.os?.itemMarket) return
    let active = true
    setLoading(true)
    setError('')
    setBook(null)
    setHistory([])
    void window.os.itemHistory?.(regionId, item.id).then((rows) => {
      if (active) setHistory(rows)
    }).catch(() => {
      if (active) setHistory([])
    })
    void window.os
      .itemMarket(characterId, regionId, item.id)
      .then((next) => {
        if (active) setBook(next)
      })
      .catch((reason: unknown) => {
        if (!active) return
        setBook(null)
        setError(reason instanceof Error ? reason.message : 'No se pudieron leer las órdenes.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [characterId, item, regionId])

  const cheapest = book?.sells[0]
  const plex = item?.id === 44992
  const regionName = useMemo(
    () => (plex ? 'Mercado global de PLEX' : (regions.find((region) => region.id === regionId)?.name ?? 'Región')),
    [plex, regions, regionId]
  )
  if (!profile || !characterId) return null

  return (
    <div className="stack">
      <div className="toolbar">
        <div className="market-tools">
        <div className="market-search">
          <label className="market-field">
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setError('')
            }}
            placeholder="Buscar objeto"
            aria-label="Buscar objeto"
          />
          <button
            type="button"
            className="skill-clear"
            aria-label="Borrar búsqueda"
            onClick={() => {
              setQuery('')
              setHits([])
              setItem(null)
              setError('')
            }}
          >
            ×
          </button>
          </label>
          {hits.length > 0 && query.trim().length >= 3 && (
            <div className="market-hits" role="listbox">
              {hits.map((hit) => (
                <button
                  key={hit.id}
                  type="button"
                  role="option"
                  onClick={() => {
                    setItem(hit)
                    setQuery(hit.name)
                    setHits([])
                  }}
                >
                  <TypeIcon typeId={hit.id} name={hit.name} size={24} />
                  {hit.name}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="view-toggle" role="group" aria-label="Vista">
          <button
            type="button"
            className={view === 'orders' ? 'active' : ''}
            aria-pressed={view === 'orders'}
            aria-label="Órdenes"
            onClick={() => setView('orders')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
              <path d="M8 7h12M8 12h12M8 17h12" />
              <path d="M4 7h.01M4 12h.01M4 17h.01" />
            </svg>
          </button>
          <button
            type="button"
            className={view === 'chart' ? 'active' : ''}
            aria-pressed={view === 'chart'}
            aria-label="Gráfica"
            onClick={() => setView('chart')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19V5" />
              <path d="M4 19h16" />
              <path d="M7 15l4-5 3 3 6-7" />
            </svg>
          </button>
        </div>
        </div>
        {plex ? (
          <span>Mercado global de PLEX</span>
        ) : (
        <select aria-label="Región" value={regionId} onChange={(event) => setRegionId(Number(event.target.value))}>
          {regions.map((region) => (
            <option key={region.id} value={region.id}>
              {region.name}
            </option>
          ))}
        </select>
        )}
        <span className="dim">
          {searching || loading ? <span className="loading-note"><Spinner /> Consultando ESI…</span> : item ? item.name : 'Elige un objeto'}
        </span>
      </div>
      {!item ? (
        <p className="empty">Busca un objeto para ver sus compras y ventas, y dónde está el más barato.</p>
      ) : (
        view === 'chart' ? (
        <PriceChart days={history} />
        ) : (
        <div className="book-split">
          <section className="order-block">
            <p className="section-label sell">Ventas · {formatNum(book?.sellCount ?? 0)}</p>
            <div className="pane">
              <BookTable orders={book?.sells ?? []} buy={false} markCheapest loading={loading} />
            </div>
          </section>
          <section className="order-block">
            <p className="section-label buy">Compras · {formatNum(book?.buyCount ?? 0)}</p>
            <div className="pane">
              <BookTable orders={book?.buys ?? []} buy markCheapest={false} loading={loading} />
            </div>
          </section>
        </div>
        )
      )}
      <footer className="module-foot">
        <span>
          {error
            ? error
            : cheapest
              ? `Más barato en ${regionName}: ${formatIsk(cheapest.price)} · ${cheapest.location}`
              : loading && item
                ? <span className="loading-note"><Spinner /> Actualizando {item.name} en {regionName}…</span>
              : item
                ? `Sin ventas de ${item.name} en ${regionName}.`
                : regionName}
        </span>
        <span className="dim">
          {[book?.structureNotice, book?.truncated ? 'Hay más órdenes de las que se han leído.' : ''].filter(Boolean).join(' ')}
        </span>
      </footer>
    </div>
  )
})
