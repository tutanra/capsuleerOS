import { app, BrowserWindow, Menu, ipcMain, screen, type Rectangle } from 'electron'
import { join } from 'node:path'
import { addCharacter, cachedCharacters, cancelLogin, characterMarketRegion, hasStoredCharacters, itemHistory, itemMarket, listCharacters, removeCharacter, reorderCharacters, searchMarketTypes, skillDescription } from './eve'
import { MIN_WINDOW_HEIGHT, MIN_WINDOW_WIDTH, readStore, writeStore, type WindowState } from './store'
import { checkForUpdates, currentUpdate, installUpdate, startUpdates } from './update'

Menu.setApplicationMenu(null)

function defaultWindow(): WindowState {
  return { width: 1440, height: 900, maximized: false }
}

function windowOnScreen(state: WindowState): WindowState {
  if (state.x == null || state.y == null) return state
  const bounds = { x: state.x, y: state.y, width: state.width, height: state.height }
  const visible = screen.getAllDisplays().some((display) => intersects(display.workArea, bounds))
  if (!visible) return { width: state.width, height: state.height, maximized: state.maximized }
  return state
}

function intersects(area: Rectangle, bounds: Rectangle): boolean {
  return bounds.x < area.x + area.width - 80 && bounds.x + bounds.width > area.x + 80 && bounds.y < area.y + area.height - 80 && bounds.y + 40 > area.y
}

function rememberWindow(win: BrowserWindow): void {
  const bounds = win.getNormalBounds()
  const store = readStore()
  store.window = {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    maximized: win.isMaximized()
  }
  writeStore(store)
}

function appIconPath(): string {
  return join(__dirname, '../../resources/icon.png')
}

function createWindow(): void {
  const state = windowOnScreen(readStore().window ?? defaultWindow())
  const win = new BrowserWindow({
    ...(state.x != null && state.y != null ? { x: state.x, y: state.y } : {}),
    width: state.width,
    height: state.height,
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    show: false,
    frame: false,
    backgroundColor: '#07090d',
    title: 'capsuleerOS',
    icon: appIconPath(),
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // La UniWiki incrustada usa este invitado para poder volver atrás.
      webviewTag: true
    }
  })

  win.on('close', () => rememberWindow(win))

  win.on('ready-to-show', () => {
    if (state.maximized) win.maximize()
    win.show()
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function bindWindow(channel: string, action: (win: BrowserWindow) => void): void {
  ipcMain.on(channel, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) action(win)
  })
}

bindWindow('window:minimize', (win) => win.minimize())
bindWindow('window:toggle-maximize', (win) => {
  if (win.isMaximized()) win.unmaximize()
  else win.maximize()
})
bindWindow('window:close', (win) => win.close())

ipcMain.handle('sso:has', () => hasStoredCharacters())
ipcMain.handle('sso:cached', () => cachedCharacters())
ipcMain.handle('sso:list', () => listCharacters())
ipcMain.handle('sso:add', () => addCharacter())
ipcMain.handle('sso:cancel', () => {
  cancelLogin()
})
ipcMain.handle('sso:remove', (_event, id: string) => {
  removeCharacter(id)
})
ipcMain.handle('sso:reorder', (_event, ids: string[]) => {
  reorderCharacters(ids)
})
ipcMain.handle('market:search', (_event, query: string) => searchMarketTypes(query))
ipcMain.handle('market:region', (_event, characterId: number) => characterMarketRegion(characterId))
ipcMain.handle('market:orders', (_event, characterId: number, regionId: number, typeId: number) =>
  itemMarket(characterId, regionId, typeId)
)
ipcMain.handle('market:history', (_event, regionId: number, typeId: number) => itemHistory(regionId, typeId))
ipcMain.handle('skills:description', (_event, typeId: number) => skillDescription(typeId))
ipcMain.handle('update:state', () => currentUpdate())
ipcMain.handle('update:version', () => app.getVersion())
ipcMain.handle('update:check', () => {
  checkForUpdates()
})
ipcMain.handle('update:install', () => {
  installUpdate()
})

const primary = !app.isPackaged || app.requestSingleInstanceLock()
if (!primary) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.focus()
  })

  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-attach-webview', (event, webPreferences, params) => {
      delete webPreferences.preload
      webPreferences.nodeIntegration = false
      webPreferences.nodeIntegrationInSubFrames = false
      webPreferences.contextIsolation = true
      webPreferences.sandbox = true
      if (params.src && !params.src.startsWith('https://wiki.eveuniversity.org/')) event.preventDefault()
    })
  })

  app.whenReady().then(() => {
    if (process.platform === 'win32') app.setAppUserModelId('app.capsuleeros.desktop')
    createWindow()
    startUpdates()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
