import { useEffect, useState } from 'react'
import { EVE_SCOPES, REDIRECT_URI } from '../../../shared/eve'
import { Spinner } from './Spinner'
import { useCharacter } from '../state/character'

type Props = {
  onClose: () => void
}

export function AddCharacter({ onClose }: Props) {
  const { add } = useCharacter()
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [hasSecret, setHasSecret] = useState(false)
  const [editing, setEditing] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    void window.os?.ssoSettings().then((settings) => {
      setClientId(settings.clientId)
      setHasSecret(settings.hasSecret)
      setEditing(settings.clientId.length === 0)
    })
  }, [])

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
    if (!clientId.trim()) {
      setError('Pega el Client ID de la aplicación que ya tienes creada.')
      return
    }
    setBusy(true)
    try {
      await window.os.saveSsoSettings({ clientId, clientSecret })
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
        <ol className="steps">
          <li>Entra en developers.eveonline.com y abre la aplicación que ya tienes. No crees otra.</li>
          <li>
            Añade esta callback, tal cual: <code>{REDIRECT_URI}</code>
          </li>
          <li>En esa misma aplicación, marca los scopes de habilidades, cola, monedero, inventario, localización, nave, clon, estructuras, órdenes de mercado y mercados de estructuras.</li>
          <li>Copia el Client ID. El secreto solo hace falta si esa aplicación lo muestra.</li>
        </ol>
        {editing ? (
          <label>
            Client ID
            <input value={clientId} onChange={(event) => setClientId(event.target.value)} autoComplete="off" spellCheck={false} />
          </label>
        ) : (
          <p className="saved-app">
            Aplicación guardada: <code>{clientId}</code>
            <button type="button" onClick={() => setEditing(true)}>
              Cambiar
            </button>
          </p>
        )}
        {editing && (
          <label>
            Client Secret {hasSecret ? '(ya hay uno guardado)' : '(opcional)'}
            <input
              value={clientSecret}
              onChange={(event) => setClientSecret(event.target.value)}
              type="password"
              autoComplete="off"
              placeholder={hasSecret ? 'Déjalo vacío para conservar el anterior' : ''}
            />
          </label>
        )}
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
