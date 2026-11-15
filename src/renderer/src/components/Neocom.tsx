import { ModuleIcon } from './Icons'
import { MODULES, NEOCOM, SYSTEM, UTILITIES, type ModuleId } from '../types'

type Props = {
  active: ModuleId
  onSelect: (module: ModuleId) => void
}

function NeoButton({ id, active, onSelect }: { id: ModuleId; active: ModuleId; onSelect: (module: ModuleId) => void }) {
  const meta = MODULES[id]
  return (
    <button
      type="button"
      className={active === id ? 'neo-btn active' : 'neo-btn'}
      data-label={meta.title}
      aria-label={meta.title}
      aria-current={active === id ? 'page' : undefined}
      onClick={() => onSelect(id)}
    >
      <ModuleIcon id={id} />
    </button>
  )
}

export function Neocom({ active, onSelect }: Props) {
  return (
    <nav className="neocom" aria-label="Módulos">
      {NEOCOM.map((id) => (
        <NeoButton key={id} id={id} active={active} onSelect={onSelect} />
      ))}
      <span className="neo-spacer" />
      <span className="neo-util">Utilidades</span>
      {UTILITIES.map((id) => (
        <NeoButton key={id} id={id} active={active} onSelect={onSelect} />
      ))}
      <span className="neo-util">Sistema</span>
      {SYSTEM.map((id) => (
        <NeoButton key={id} id={id} active={active} onSelect={onSelect} />
      ))}
      <span className="neo-ver">0.1</span>
    </nav>
  )
}
