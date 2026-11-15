import { contextBridge, ipcRenderer } from 'electron'
import type { CharacterProfile, MarketBook, MarketDay, MarketTypeHit } from '../renderer/src/types'

export type SsoSettings = {
  clientId: string
  hasSecret: boolean
  redirectUri: string
  scopes: string[]
}

const api = {
  minimize: () => ipcRenderer.send('window:minimize'),
  toggleMaximize: () => ipcRenderer.send('window:toggle-maximize'),
  close: () => ipcRenderer.send('window:close'),
  ssoSettings: () => ipcRenderer.invoke('sso:settings') as Promise<SsoSettings>,
  saveSsoSettings: (input: { clientId: string; clientSecret?: string }) =>
    ipcRenderer.invoke('sso:save-settings', input) as Promise<SsoSettings>,
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
    }>
}

contextBridge.exposeInMainWorld('os', api)

export type CapsuleerOsApi = typeof api
