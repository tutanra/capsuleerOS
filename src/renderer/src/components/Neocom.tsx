import { ModuleIcon } from './Icons'
import { MODULES, NEOCOM, UTILITIES, type ModuleId } from '../types'

type Props = {
  active: ModuleId
  onSelect: (module: ModuleId) => void
}

export function Neocom({ active, onSelect }: Props) {
  return (
    <nav className="neocom" aria-label="Módulos">
      {NEOCOM.map((id) => {
        const meta = MODULES[id]
        return (
          <button
            key={id}
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
      })}
      <span className="neo-spacer" />
      <span className="neo-util">Utilidades</span>
      {UTILITIES.map((id) => {
        const meta = MODULES[id]
        return (
          <button
            key={id}
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
      })}
      <span className="neo-ver">0.1</span>
    </nav>
  )
}
