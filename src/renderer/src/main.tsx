import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/rajdhani/500.css'
import '@fontsource/rajdhani/600.css'
import '@fontsource/rajdhani/700.css'
import '@fontsource/ibm-plex-mono/400.css'
import { App } from './App'
import { CharacterProvider } from './state/character'
import { SettingsProvider } from './state/settings'
import { UpdateProvider } from './state/update'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SettingsProvider>
      <UpdateProvider>
        <CharacterProvider>
          <App />
        </CharacterProvider>
      </UpdateProvider>
    </SettingsProvider>
  </StrictMode>
)
