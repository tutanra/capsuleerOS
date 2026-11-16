import {
  UI_SCALE_DEFAULT,
  UI_SCALE_MAX,
  UI_SCALE_MIN,
  UI_SCALE_STEP,
  useSettings
} from '../state/settings'
import { useUpdate } from '../state/update'
import type { UpdateState } from '../../../shared/update'

function updateCopy(state: UpdateState, version: string): string {
  switch (state.phase) {
    case 'checking':
      return 'Buscando una versión nueva…'
    case 'current':
      return version ? `La versión ${version} es la última publicada.` : 'Esta es la última versión publicada.'
    case 'available':
      return `Hay una versión nueva: ${state.version}. Empieza la descarga.`
    case 'downloading':
      return `Descargando ${state.version}… ${state.percent}%`
    case 'ready':
      return `La versión ${state.version} está descargada. Reinicia para instalarla.`
    case 'unsupported':
      return 'La búsqueda en GitHub solo ocurre en la aplicación instalada.'
    case 'error':
      return state.message
    default:
      return version ? `Versión instalada ${version}.` : 'Versión de desarrollo.'
  }
}
export function Settings() {
  const { uiScale, setUiScale, clockMode, setClockModePref } = useSettings()
  const update = useUpdate()
  const percent = Math.round(uiScale * 100)
  const busy = update.state.phase === 'checking' || update.state.phase === 'downloading' || update.state.phase === 'available'
  const canCheck = update.state.phase !== 'unsupported' && update.state.phase !== 'ready' && !busy

  return (
    <div className="stack settings-pane">
      <div className="settings-list">
        <div className="settings-row">
          <span className="settings-copy">
            <strong>Actualización</strong>
            <small>{updateCopy(update.state, update.version)}</small>
          </span>
          <span className="settings-control">
            {update.state.phase === 'ready' ? (
              <button type="button" className="settings-reset" onClick={update.install}>
                Reiniciar y actualizar
              </button>
            ) : (
              <button type="button" className="settings-reset" disabled={!canCheck} onClick={update.check}>
                Buscar
              </button>
            )}
          </span>
        </div>

        <label className="settings-row">
          <span className="settings-copy">
            <strong>Escala de la interfaz</strong>
            <small>Ajusta el tamaño del entorno. El control permanece fijo para que no se mueva al arrastrar.</small>
          </span>
          <span className="settings-control settings-scale-lock" aria-label="Control de escala (tamaño fijo)">
            <button
              type="button"
              className="settings-step"
              aria-label="Reducir escala"
              disabled={uiScale <= UI_SCALE_MIN}
              onClick={() => setUiScale(uiScale - UI_SCALE_STEP)}
            >
              −
            </button>
            <input
              type="range"
              min={UI_SCALE_MIN}
              max={UI_SCALE_MAX}
              step={UI_SCALE_STEP}
              value={uiScale}
              aria-valuetext={`${percent}%`}
              onChange={(event) => setUiScale(Number(event.target.value))}
            />
            <button
              type="button"
              className="settings-step"
              aria-label="Aumentar escala"
              disabled={uiScale >= UI_SCALE_MAX}
              onClick={() => setUiScale(uiScale + UI_SCALE_STEP)}
            >
              +
            </button>
            <span className="num settings-value">{percent}%</span>
            <button
              type="button"
              className="settings-reset"
              disabled={uiScale === UI_SCALE_DEFAULT}
              onClick={() => setUiScale(UI_SCALE_DEFAULT)}
            >
              Restablecer
            </button>
          </span>
        </label>

        <div className="settings-row">
          <span className="settings-copy">
            <strong>Zona horaria</strong>
            <small>Fechas de cola, mercado y monedero. El reloj de la barra sigue en EVE.</small>
          </span>
          <span className="settings-control" role="group" aria-label="Zona horaria">
            <span className="view-toggle settings-toggle">
              <button
                type="button"
                className={clockMode === 'eve' ? 'active' : ''}
                aria-pressed={clockMode === 'eve'}
                onClick={() => setClockModePref('eve')}
              >
                EVE
              </button>
              <button
                type="button"
                className={clockMode === 'local' ? 'active' : ''}
                aria-pressed={clockMode === 'local'}
                onClick={() => setClockModePref('local')}
              >
                Local
              </button>
            </span>
          </span>
        </div>
      </div>
    </div>
  )
}
