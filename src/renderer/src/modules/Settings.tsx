import {
  UI_SCALE_DEFAULT,
  UI_SCALE_MAX,
  UI_SCALE_MIN,
  UI_SCALE_STEP,
  useSettings
} from '../state/settings'
export function Settings() {
  const { uiScale, setUiScale, clockMode, setClockModePref } = useSettings()
  const percent = Math.round(uiScale * 100)

  return (
    <div className="stack settings-pane">
      <div className="settings-list">
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
