import { memo } from 'react'
import { Portrait } from '../components/Portrait'
import { formatIsk, formatNum, formatSecurity, securityColor } from '../lib/format'
import { useCharacter } from '../state/character'
import { MODULES, NEOCOM, type ModuleId } from '../types'

type Props = {
  onOpen: (module: ModuleId) => void
}

export const Overview = memo(function Overview({ onOpen }: Props) {
  const { profile } = useCharacter()
  if (!profile) return null
  const { character, trainingQueue, queueSummary } = profile
  const current = trainingQueue[0]

  return (
    <div className="overview">
      <div className="overview-col">
      <div className="identity">
        <Portrait profileId={profile.id} name={character.name} />
        <div>
          <h2>{character.name}</h2>
          <p>{character.corp}</p>
          <p className="dim">{character.alliance}</p>
        </div>
      </div>

      <dl className="facts">
        <div>
          <dt>Sistema</dt>
          <dd>
            <i style={{ color: securityColor(character.security) }}>{formatSecurity(character.security)}</i>{' '}
            {character.system}
          </dd>
        </div>
        <div>
          <dt>Estación</dt>
          <dd>{character.station}</dd>
        </div>
        <div>
          <dt>Nave</dt>
          <dd>{character.ship}</dd>
        </div>
        <div>
          <dt>Clon</dt>
          <dd>{character.clone}</dd>
        </div>
        <div>
          <dt>Puntos de habilidad</dt>
          <dd className="mono">{formatNum(character.skillpoints)}</dd>
        </div>
        <div>
          <dt>Monedero</dt>
          <dd className="mono">{formatIsk(character.wallet)}</dd>
        </div>
      </dl>
      </div>

      <div className="overview-col">
      <section className="card">
        <header>
          <span>Entrenando</span>
          <span className="dim">Cola {queueSummary}</span>
        </header>
        {current ? (
        <>
        <strong>
          {current.name} {current.from} → {current.to}
        </strong>
        <div className="bar" aria-hidden="true">
          <span style={{ width: `${Math.round(current.progress * 100)}%` }} />
        </div>
        <p className="dim">Restante {current.remaining}</p>
        </>
      ) : (
        <p className="dim">Sin entrenamiento activo</p>
      )}
      </section>

      <section className="card actions">
        <header>
          <span>Acciones</span>
        </header>
        {NEOCOM.filter((id) => id !== 'overview').map((id) => (
          <button key={id} type="button" onClick={() => onOpen(id)}>
            <span>{MODULES[id].title}</span>
            <small>{MODULES[id].blurb}</small>
          </button>
        ))}
        <p className="note">
          {profile.notice ?? 'Personaje conectado con tu aplicación de EVE. Los datos de este panel salen de ESI.'}
        </p>
      </section>
      </div>
    </div>
  )
})
