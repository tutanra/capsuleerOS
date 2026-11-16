import { useUpdate } from '../state/update'
import type { UpdateState } from '../../../shared/update'

function banner(state: UpdateState): string | null {
  if (state.phase === 'available') return `Hay una versión nueva (${state.version}). Descargando…`
  if (state.phase === 'downloading') return `Descargando ${state.version}… ${state.percent}%`
  if (state.phase === 'ready') return `La versión ${state.version} está lista.`
  return null
}

export function UpdateBar() {
  const { state, install } = useUpdate()
  const text = banner(state)
  if (!text) return null
  return (
    <div className="update-bar" role="status">
      <span>{text}</span>
      {state.phase === 'ready' && (
        <button type="button" onClick={install}>
          Reiniciar y actualizar
        </button>
      )}
    </div>
  )
}
