import { memo, useMemo, useState } from 'react'
import { ClearableInput } from '../components/ClearableInput'
import { Isk } from '../components/Isk'
import { TypeIcon } from '../components/TypeIcon'
import { formatEveDate, formatNum } from '../lib/format'
import { useSplitFraction } from '../lib/paneWidth'
import { useCharacter } from '../state/character'
import { useSettings } from '../state/settings'
import type { CharacterOrder } from '../types'

function orderValue(order: CharacterOrder): number {
  return order.price * order.remain
}

function OrderTable({ orders, empty }: { orders: CharacterOrder[]; empty: string }) {
  return (
    <table className="order-table dense">
      <thead>
        <tr>
          <th>Objeto</th>
          <th className="num">Precio</th>
          <th className="num">Restante</th>
          <th>Ubicación</th>
          <th>Alcance</th>
          <th>Caduca</th>
          <th className="num">Valor</th>
        </tr>
      </thead>
      <tbody>
        {orders.length === 0 && (
          <tr>
            <td colSpan={7}>{empty}</td>
          </tr>
        )}
        {orders.map((order) => (
          <tr key={order.id}>
            <td>
              <div className="item-name">
                <TypeIcon typeId={order.typeId} name={order.name} size={28} />
                <span title={order.name}>{order.name}</span>
                {order.corporation && <em>Corp</em>}
              </div>
            </td>
            <td className="num">
              <Isk value={order.price} />
            </td>
            <td className="num" title={`De ${formatNum(order.total)}`}>
              {formatNum(order.remain)}
              {order.remain !== order.total && <span className="dim"> / {formatNum(order.total)}</span>}
            </td>
            <td className="place" title={order.location}>
              {order.location}
            </td>
            <td>{order.range}</td>
            <td className="mono" title={`Emitida ${formatEveDate(order.issued)}`}>
              {formatEveDate(order.expires)}
            </td>
            <td className="num">
              <Isk value={orderValue(order)} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export const Market = memo(function Market() {
  const { profile, setAdding } = useCharacter()
  useSettings().clockMode
  const [query, setQuery] = useState('')
  const orders = profile?.orders ?? []
  const needle = query.trim().toLowerCase()
  const visible = useMemo(
    () => (needle ? orders.filter((order) => order.name.toLowerCase().includes(needle)) : orders),
    [orders, needle]
  )
  const sells = visible
    .filter((order) => !order.buy)
    .sort((a, b) => a.name.localeCompare(b.name, 'es') || a.price - b.price)
  const buys = visible
    .filter((order) => order.buy)
    .sort((a, b) => a.name.localeCompare(b.name, 'es') || b.price - a.price)
  const sellValue = sells.reduce((sum, order) => sum + orderValue(order), 0)
  const buyValue = buys.reduce((sum, order) => sum + orderValue(order), 0)
  const split = useSplitFraction('capsuleeros.marketOrders', 0.5, 0.18, 0.82)
  if (!profile) return null
  const denied = profile.notice?.includes('mercado') ?? false
  const emptySell = denied ? 'El personaje aún no autorizó la lectura de órdenes.' : 'Sin órdenes de venta.'
  const emptyBuy = denied ? 'El personaje aún no autorizó la lectura de órdenes.' : 'Sin órdenes de compra.'

  return (
    <div className="stack">
      <div className="toolbar">
        <ClearableInput
          value={query}
          onChange={setQuery}
          placeholder="Filtrar órdenes"
          aria-label="Filtrar órdenes"
        />
        {denied && (
          <button type="button" onClick={() => setAdding(true)}>
            Conectar de nuevo
          </button>
        )}
      </div>
      <div ref={split.ref} className="orders-split" style={split.style}>
        <section className="order-block">
          <p className="section-label sell">Ventas · {formatNum(sells.length)}</p>
          <div className="pane">
            <OrderTable orders={sells} empty={emptySell} />
          </div>
        </section>
        <div
          className="pane-resize row"
          role="separator"
          aria-orientation="horizontal"
          aria-label="Altura de ventas y compras"
          aria-valuemin={Math.round(split.min * 100)}
          aria-valuemax={Math.round(split.max * 100)}
          aria-valuenow={split.percent}
          tabIndex={0}
          onPointerDown={split.onPointerDown}
          onPointerMove={split.onPointerMove}
          onKeyDown={split.onKeyDown}
        />
        <section className="order-block">
          <p className="section-label buy">Compras · {formatNum(buys.length)}</p>
          <div className="pane">
            <OrderTable orders={buys} empty={emptyBuy} />
          </div>
        </section>
      </div>
      <footer className="module-foot">
        <span>
          {formatNum(sells.length)} ventas · {formatNum(buys.length)} compras
        </span>
        <span className="mono isk-pair">
          <Isk value={sellValue} />
          <span aria-hidden="true"> · </span>
          <Isk value={buyValue} />
        </span>
      </footer>
    </div>
  )
})
