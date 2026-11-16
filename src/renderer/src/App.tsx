import { useState } from 'react'
import { AddCharacter } from './components/AddCharacter'
import { Spinner } from './components/Spinner'
import { Neocom } from './components/Neocom'
import { TitleBar } from './components/TitleBar'
import { UpdateBar } from './components/UpdateBar'
import { Fleets } from './modules/Fleets'
import { Inventory } from './modules/Inventory'
import { ItemMarket } from './modules/ItemMarket'
import { Market } from './modules/Market'
import { Overview } from './modules/Overview'
import { Settings } from './modules/Settings'
import { Skills } from './modules/Skills'
import { Wallet } from './modules/Wallet'
import { useCharacter } from './state/character'
import { MODULES, type ModuleId } from './types'

export function App() {
  const [module, setModule] = useState<ModuleId>('overview')
  const { profile, adding, setAdding, loadingCharacters, charactersReady } = useCharacter()
  const needsCharacter = module !== 'settings' && module !== 'prices' && module !== 'fleets'

  return (
    <div className="shell">
      <TitleBar />
      <UpdateBar />
      <div className="body">
        <Neocom active={module} onSelect={setModule} />
        <main className="workspace">
          <section className="stage" aria-label={MODULES[module].title}>
            <header className="stage-title" hidden={module === 'inventory' && !!profile}>
              {MODULES[module].title}
            </header>
            <div className="stage-body">
              <div className="module-pane" hidden={module !== 'settings'}>
                <Settings />
              </div>
              <div className="module-pane" hidden={module !== 'prices'}>
                <ItemMarket />
              </div>
              <div className="module-pane" hidden={module !== 'fleets'}>
                <Fleets active={module === 'fleets'} />
              </div>
              {needsCharacter && loadingCharacters && (
                <div className="empty-app">
                  <p className="loading-note"><Spinner /> Cargando personajes....</p>
                </div>
              )}
              {needsCharacter && charactersReady && !loadingCharacters && !profile && (
                <div className="empty-app">
                  <p>No hay ningún personaje conectado.</p>
                  <button type="button" onClick={() => setAdding(true)}>
                    Añadir personaje
                  </button>
                </div>
              )}
              {profile && (
                <>
                  <div className="module-pane" hidden={module !== 'overview'}>
                    <Overview key={profile.id} onOpen={setModule} />
                  </div>
                  <div className="module-pane" hidden={module !== 'skills'}>
                    <Skills key={profile.id} />
                  </div>
                  <div className="module-pane" hidden={module !== 'market'}>
                    <Market key={profile.id} />
                  </div>
                  <div className="module-pane" hidden={module !== 'inventory'}>
                    <Inventory key={profile.id} />
                  </div>
                  <div className="module-pane" hidden={module !== 'wallet'}>
                    <Wallet key={profile.id} />
                  </div>
                </>
              )}
            </div>
          </section>
        </main>
      </div>
      {adding && <AddCharacter onClose={() => setAdding(false)} />}
    </div>
  )
}
