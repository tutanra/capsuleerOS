import { useEffect, useState } from 'react'
import { EVE_SCOPES } from '../../../shared/eve'
import { Spinner } from './Spinner'
import { useCharacter } from '../state/character'

type Props = {
  onClose: () => void
}

export function AddCharacter({ onClose }: Props) {
  const { add } = useCharacter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    return () => {
      if (busy) void window.os?.cancelAddCharacter()
    }
  }, [busy])

  async function connect() {
    setError('')
    if (!window.os) {
      setError('Abre capsuleerOS con npm run dev. El navegador suelto no puede recibir el acceso de EVE.')
      return
    }
    setBusy(true)
    try {
      await add()
      onClose()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo añadir el personaje.')
      setBusy(false)
    }
  }

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="add-character-title">
      <form
        className="modal-card"
        onSubmit={(event) => {
          event.preventDefault()
          void connect()
        }}
      >
        <header>
          <h2 id="add-character-title">Añadir personaje</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" disabled={busy}>
            ×
          </button>
        </header>
        <p>
          capsuleerOS usa su propia aplicación de EVE. El acceso es solo de lectura: no cambia habilidades, objetos, órdenes ni el monedero.
        </p>
        <p className="dim scopes">{EVE_SCOPES.join('  ·  ')}</p>
        {error && <p className="form-error">{error}</p>}
        {busy && <p className="dim">Elige el personaje en el navegador. Esta ventana esperará a que vuelvas.</p>}
        <div className="modal-actions">
          <button type="button" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button type="submit" className="primary" disabled={busy}>
            {busy ? <span className="loading-note"><Spinner /> Esperando a EVE…</span> : 'Conectar personaje'}
          </button>
        </div>
      </form>
    </div>
  )
}
