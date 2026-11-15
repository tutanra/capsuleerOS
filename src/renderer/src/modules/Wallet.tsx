import { memo } from 'react'
import { Isk } from '../components/Isk'
import { formatDotDateTime } from '../lib/format'
import { useCharacter } from '../state/character'
import { useSettings } from '../state/settings'

export const Wallet = memo(function Wallet() {
  const profile = useCharacter().profile
  useSettings().clockMode
  if (!profile) return null
  const { character, journal } = profile
  return (
    <div className="stack">
      <div className="wallet-hero">
        <span className="dim">Saldo</span>
        <strong>
          <Isk value={character.wallet} />
        </strong>
      </div>
      <div className="pane grow">
        <table className="wallet-table">
          <colgroup>
            <col className="when" />
            <col className="ref" />
            <col className="party" />
            <col className="amount" />
            <col className="balance" />
          </colgroup>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Referencia</th>
              <th>Parte</th>
              <th className="num">Importe</th>
              <th className="num">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {journal.length === 0 && (
              <tr>
                <td colSpan={5}>Sin movimientos visibles.</td>
              </tr>
            )}
            {journal.map((row) => (
              <tr key={`${row.when}-${row.ref}`}>
                <td className="mono">{formatDotDateTime(row.when)}</td>
                <td title={row.ref}>{row.ref}</td>
                <td title={row.party}>{row.party}</td>
                <td className={row.amount >= 0 ? 'num pos' : 'num neg'}>
                  <Isk value={row.amount} signed />
                </td>
                <td className="num">
                  <Isk value={row.balance} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
})
