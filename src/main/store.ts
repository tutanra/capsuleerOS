import { app } from 'electron'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CharacterProfile } from '../renderer/src/types'
import { parseDiscordChannelUrl, type DiscordChannel } from '../shared/discord'

export type StoredAccount = {
  characterId: number
  refreshToken: string
  profile: CharacterProfile
}

export const MIN_WINDOW_WIDTH = 925
export const MIN_WINDOW_HEIGHT = 700

export type WindowState = {
  x?: number
  y?: number
  width: number
  height: number
  maximized: boolean
}

export type StoreFile = {
  clientId: string
  clientSecret: string
  accounts: StoredAccount[]
  window?: WindowState
  discordChannels: DiscordChannel[]
  discordActiveId: string
}

function readWindow(value: unknown): WindowState | undefined {
  if (!value || typeof value !== 'object') return undefined
  const raw = value as Partial<WindowState>
  const width = Number(raw.width)
  const height = Number(raw.height)
  if (!Number.isFinite(width) || !Number.isFinite(height)) return undefined
  const x = Number(raw.x)
  const y = Number(raw.y)
  return {
    x: Number.isFinite(x) ? Math.round(x) : undefined,
    y: Number.isFinite(y) ? Math.round(y) : undefined,
    width: Math.max(MIN_WINDOW_WIDTH, Math.round(width)),
    height: Math.max(MIN_WINDOW_HEIGHT, Math.round(height)),
    maximized: raw.maximized === true
  }
}

function readDiscordChannels(value: unknown): DiscordChannel[] {
  if (!Array.isArray(value)) return []
  const channels: DiscordChannel[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const raw = item as Partial<DiscordChannel>
    if (typeof raw.id !== 'string' || !raw.id || typeof raw.name !== 'string' || typeof raw.url !== 'string') continue
    const parsed = parseDiscordChannelUrl(raw.url)
    const name = raw.name.trim().replace(/\s+/g, ' ').slice(0, 60)
    if (!parsed || !name) continue
    channels.push({ id: raw.id, name, url: parsed.url })
  }
  return channels
}

function emptyStore(): StoreFile {
  return { clientId: '', clientSecret: '', accounts: [], discordChannels: [], discordActiveId: '' }
}

function filePath(): string {
  return join(app.getPath('userData'), 'capsuleeros.json')
}

export function readStore(): StoreFile {
  try {
    const parsed = JSON.parse(readFileSync(filePath(), 'utf8')) as Partial<StoreFile>
    return {
      clientId: parsed.clientId ?? '',
      clientSecret: parsed.clientSecret ?? '',
      accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [],
      window: readWindow(parsed.window),
      discordChannels: readDiscordChannels(parsed.discordChannels),
      discordActiveId: typeof parsed.discordActiveId === 'string' ? parsed.discordActiveId : ''
    }
  } catch {
    return emptyStore()
  }
}

export function writeStore(store: StoreFile): void {
  const path = filePath()
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, JSON.stringify(store, null, 2), 'utf8')
}
