import { memo, useMemo, useState } from 'react'
import { TypeIcon } from '../components/TypeIcon'
import { formatEveDate, formatIsk, formatNum } from '../lib/format'
import { useCharacter } from '../state/character'
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
            <td className="num">{formatIsk(order.price)}</td>
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
            <td className="num">{formatIsk(orderValue(order))}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export const Market = memo(function Market() {
  const { profile, setAdding } = useCharacter()
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
  if (!profile) return null
  const denied = profile.notice?.includes('mercado') ?? false

  return (
    <div className="stack">
      <div className="toolbar">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filtrar órdenes"
          aria-label="Filtrar órdenes"
        />
        {denied && (
          <button type="button" onClick={() => setAdding(true)}>
            Conectar de nuevo
          </button>
        )}
      </div>
      <div className="pane grow">
        <p className="section-label sell">Ventas · {formatNum(sells.length)}</p>
        <OrderTable orders={sells} empty={denied ? 'El personaje aún no autorizó la lectura de órdenes.' : 'Sin órdenes de venta.'} />
        <p className="section-label buy">Compras · {formatNum(buys.length)}</p>
        <OrderTable orders={buys} empty={denied ? 'El personaje aún no autorizó la lectura de órdenes.' : 'Sin órdenes de compra.'} />
      </div>
      <footer className="module-foot">
        <span>
          {formatNum(sells.length)} ventas · {formatNum(buys.length)} compras
        </span>
        <span className="mono">
          {formatIsk(sellValue)} · {formatIsk(buyValue)}
        </span>
      </footer>
    </div>
  )
})
