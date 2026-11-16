import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { CharacterProfile, MarketBook, MarketDay, MarketTypeHit } from '../renderer/src/types'
import type { DiscordState } from '../shared/discord'
import type { UpdateState } from '../shared/update'

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
    }>,
  discordList: () => ipcRenderer.invoke('discord:list') as Promise<DiscordState>,
  discordAdd: (input: { url: string; name?: string }) => ipcRenderer.invoke('discord:add', input) as Promise<DiscordState>,
  discordRemove: (id: string) => ipcRenderer.invoke('discord:remove', id) as Promise<DiscordState>,
  discordSelect: (id: string) => ipcRenderer.invoke('discord:select', id) as Promise<DiscordState>,
  discordShow: (bounds: { x: number; y: number; width: number; height: number }) =>
    ipcRenderer.invoke('discord:show', bounds) as Promise<void>,
  discordHide: () => ipcRenderer.invoke('discord:hide') as Promise<void>,
  discordOpen: (id: string) => ipcRenderer.invoke('discord:open', id) as Promise<void>,
  discordLogout: () => ipcRenderer.invoke('discord:logout') as Promise<void>,
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
