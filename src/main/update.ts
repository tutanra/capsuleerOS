import { app, BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdateState } from '../shared/update'

const CHECK_EVERY_MS = 4 * 60 * 60 * 1000

let current: UpdateState = { phase: 'idle' }
let pendingVersion = ''
let started = false

function emit(state: UpdateState): void {
  current = state
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('update:state', state)
  }
}

function updateError(error: unknown): string {
  const text = error instanceof Error ? error.message : ''
  if (/ENOTFOUND|ETIMEDOUT|ECONN|EAI_AGAIN|net::|network|getaddrinfo/i.test(text)) {
    return 'No hay conexión con GitHub para buscar la actualización.'
  }
  return 'No se pudo comprobar la actualización.'
}

export function currentUpdate(): UpdateState {
  if (!app.isPackaged) return { phase: 'unsupported' }
  return current
}

export function startUpdates(): void {
  if (!app.isPackaged || started) return
  started = true
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.on('checking-for-update', () => emit({ phase: 'checking' }))
  autoUpdater.on('update-available', (info) => {
    pendingVersion = info.version
    emit({ phase: 'available', version: info.version })
  })
  autoUpdater.on('update-not-available', () => emit({ phase: 'current' }))
  autoUpdater.on('download-progress', (progress) => {
    emit({
      phase: 'downloading',
      version: pendingVersion,
      percent: Math.max(0, Math.min(100, Math.round(progress.percent)))
    })
  })
  autoUpdater.on('update-downloaded', (info) => {
    pendingVersion = info.version
    emit({ phase: 'ready', version: info.version })
  })
  autoUpdater.on('error', (error) => {
    console.error(error)
    emit({ phase: 'error', message: updateError(error) })
  })
  checkForUpdates()
  setInterval(checkForUpdates, CHECK_EVERY_MS)
}

export function checkForUpdates(): void {
  if (!app.isPackaged) {
    emit({ phase: 'unsupported' })
    return
  }
  if (current.phase === 'available' || current.phase === 'downloading' || current.phase === 'ready') return
  void autoUpdater.checkForUpdates().catch((error: unknown) => {
    console.error(error)
    emit({ phase: 'error', message: updateError(error) })
  })
}

export function installUpdate(): void {
  if (!app.isPackaged || current.phase !== 'ready') return
  autoUpdater.quitAndInstall(true, true)
}
