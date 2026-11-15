import { memo } from 'react'
import { Portrait } from '../components/Portrait'
import { Isk } from '../components/Isk'
import { Pips } from '../components/Pips'
import { formatEveDate, formatNum, formatSecurity, securityColor } from '../lib/format'
import { useCharacter } from '../state/character'
import { MODULES, NEOCOM, type ModuleId } from '../types'

type Props = {
  onOpen: (module: ModuleId) => void
}

export const Overview = memo(function Overview({ onOpen }: Props) {
  const { profile } = useCharacter()
  if (!profile) return null
  const { character, trainingQueue, queueSummary, accelerator, multipilot } = profile
  const current = trainingQueue[0]
  const training =
    current != null && current.finishAt != null && Date.parse(current.finishAt) > Date.now()

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
            <dd className="mono">
              <Isk value={character.wallet} />
            </dd>
          </div>
          {accelerator && (
            <div>
              <dt>Implantes</dt>
              <dd>
                {accelerator.name.includes(`+${accelerator.bonus}`)
                  ? accelerator.name
                  : `${accelerator.name} +${accelerator.bonus}`}{' '}
                · <em className="status-on">Activo</em>
              </dd>
            </div>
          )}
          {multipilot && (
            <div>
              <dt>Multipilot</dt>
              <dd>
                <em className="status-on">Activo</em>
              </dd>
            </div>
          )}
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
              <div className="train-now">
                <strong>
                  {training && <i className="train-blink" title="Entrenando" />}
                  {current.name}
                </strong>
                <Pips
                  level={current.from}
                  queueTo={current.to}
                  trainingTo={training ? current.to : undefined}
                />
              </div>
              <div className="bar" aria-hidden="true">
                <span style={{ width: `${Math.round(current.progress * 100)}%` }} />
              </div>
              <div className="train-eta">
                <span className="train-eta-left dim">Restante {current.remaining}</span>
                <span className="train-eta-right mono">{formatEveDate(current.finishAt)}</span>
              </div>
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
