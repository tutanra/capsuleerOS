import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { CharacterProfile, MarketBook, MarketDay, MarketTypeHit } from '../renderer/src/types'
import type { UpdateState } from '../shared/update'

const api = {
  minimize: () => ipcRenderer.send('window:minimize'),
  toggleMaximize: () => ipcRenderer.send('window:toggle-maximize'),
  close: () => ipcRenderer.send('window:close'),
  hasStoredCharacters: () => ipcRenderer.invoke('sso:has') as Promise<boolean>,
  cachedCharacters: () => ipcRenderer.invoke('sso:cached') as Promise<CharacterProfile[]>,
  listCharacters: () => ipcRenderer.invoke('sso:list') as Promise<CharacterProfile[]>,
  addCharacter: () => ipcRenderer.invoke('sso:add') as Promise<CharacterProfile>,
  cancelAddCharacter: () => ipcRenderer.invoke('sso:cancel') as Promise<void>,
  removeCharacter: (id: string) => ipcRenderer.invoke('sso:remove', id) as Promise<void>,
  reorderCharacters: (ids: string[]) => ipcRenderer.invoke('sso:reorder', ids) as Promise<void>,
  searchMarketTypes: (query: string) => ipcRenderer.invoke('market:search', query) as Promise<MarketTypeHit[]>,
  characterMarketRegion: (characterId: number) =>
    ipcRenderer.invoke('market:region', characterId) as Promise<MarketTypeHit | null>,
  itemMarket: (characterId: number, regionId: number, typeId: number) =>
    ipcRenderer.invoke('market:orders', characterId, regionId, typeId) as Promise<MarketBook>,
  itemHistory: (regionId: number, typeId: number) =>
    ipcRenderer.invoke('market:history', regionId, typeId) as Promise<MarketDay[]>,
  skillDescription: (typeId: number) =>
    ipcRenderer.invoke('skills:description', typeId) as Promise<{
      description: string
      requirements: Array<{ typeId: number; name: string; level: number }>
    }>,
  appVersion: () => ipcRenderer.invoke('update:version') as Promise<string>,
  updateState: () => ipcRenderer.invoke('update:state') as Promise<UpdateState>,
  checkUpdate: () => ipcRenderer.invoke('update:check') as Promise<void>,
  installUpdate: () => ipcRenderer.invoke('update:install') as Promise<void>,
  onUpdate: (listener: (state: UpdateState) => void) => {
    const channel = (_event: IpcRendererEvent, state: UpdateState) => listener(state)
    ipcRenderer.on('update:state', channel)
    return () => ipcRenderer.removeListener('update:state', channel)
  }
}

contextBridge.exposeInMainWorld('os', api)

export type CapsuleerOsApi = typeof api
