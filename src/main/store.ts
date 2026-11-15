import { app } from 'electron'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CharacterProfile } from '../renderer/src/types'

export type StoredAccount = {
  characterId: number
  refreshToken: string
  profile: CharacterProfile
}

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
    width: Math.max(1100, Math.round(width)),
    height: Math.max(700, Math.round(height)),
    maximized: raw.maximized === true
  }
}

function emptyStore(): StoreFile {
  return { clientId: '', clientSecret: '', accounts: [] }
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
      window: readWindow(parsed.window)
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
