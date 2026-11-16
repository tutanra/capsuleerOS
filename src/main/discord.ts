import { BrowserWindow, WebContentsView, session, shell, type Rectangle, type WebContents } from 'electron'
import { randomUUID } from 'node:crypto'
import { discordDesktopUrl, parseDiscordChannelUrl, type DiscordChannel, type DiscordState } from '../shared/discord'
import { readStore, writeStore } from './store'

const PARTITION = 'persist:discord'
const MIN_SIZE = 2

const ALLOWED_PERMISSIONS = new Set(['clipboard-sanitized-write', 'persistent-storage'])

let view: WebContentsView | null = null
let host: BrowserWindow | null = null
let loadedUrl = ''
let permissionsReady = false

export type DiscordBounds = {
  x: number
  y: number
  width: number
  height: number
}

function chromeUserAgent(): string {
  const chrome = process.versions.chrome ?? '140.0.0.0'
  if (process.platform === 'darwin') {
    return `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chrome} Safari/537.36`
  }
  if (process.platform === 'linux') {
    return `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chrome} Safari/537.36`
  }
  return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chrome} Safari/537.36`
}

function discordHost(hostname: string): boolean {
  return hostname === 'discord.com' || hostname === 'discordapp.com' || hostname.endsWith('.discord.com') || hostname.endsWith('.discordapp.com')
}

function readUrl(value: string): URL | null {
  try {
    return new URL(value)
  } catch {
    return null
  }
}

function allowedMainNavigation(url: string): boolean {
  const parsed = readUrl(url)
  if (!parsed || parsed.protocol !== 'https:' || !discordHost(parsed.hostname)) return false
  const path = parsed.pathname
  return path === '/' || path.startsWith('/login') || path.startsWith('/app') || path.startsWith('/channels/')
}

function allowedSubframe(url: string): boolean {
  if (url === 'about:blank') return true
  const parsed = readUrl(url)
  if (!parsed || (parsed.protocol !== 'https:' && parsed.protocol !== 'http:')) return false
  const host = parsed.hostname
  if (discordHost(host)) return true
  if (host === 'hcaptcha.com' || host.endsWith('.hcaptcha.com')) return true
  if (host === 'recaptcha.net' || host.endsWith('.recaptcha.net')) return true
  if (host === 'www.google.com' && parsed.pathname.startsWith('/recaptcha')) return true
  if (host === 'www.gstatic.com' && parsed.pathname.includes('recaptcha')) return true
  return false
}

function isWebUrl(url: string): boolean {
  const parsed = readUrl(url)
  return parsed?.protocol === 'https:' || parsed?.protocol === 'http:'
}

function cleanName(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.trim().replace(/\s+/g, ' ').slice(0, 60)
}

function stateFromStore(): DiscordState {
  const store = readStore()
  const activeId = store.discordChannels.some((channel) => channel.id === store.discordActiveId) ? store.discordActiveId : ''
  return { channels: store.discordChannels, activeId }
}

function saveChannels(channels: DiscordChannel[], activeId: string): DiscordState {
  const store = readStore()
  store.discordChannels = channels
  store.discordActiveId = channels.some((channel) => channel.id === activeId) ? activeId : ''
  writeStore(store)
  return { channels, activeId: store.discordActiveId }
}

function activeChannel(): DiscordChannel | undefined {
  const { channels, activeId } = stateFromStore()
  return channels.find((channel) => channel.id === activeId)
}

const CHANNEL_ONLY_SCRIPT = `(() => {
  const styleId = 'capsuleer-channel-only'
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style')
    style.id = styleId
    style.textContent = '.capsuleer-hide-chrome{display:none !important}'
    document.documentElement.appendChild(style)
  }
  const labelOf = (el) => (el.getAttribute('aria-label') || '').trim().toLowerCase()
  const onChannel = () => {
    const parts = location.pathname.split('/')
    return parts[1] === 'channels' && /^\\d+$/.test(parts[2] || '') && /^\\d+$/.test(parts[3] || '')
  }
  const columnOf = (el) => {
    let node = el
    for (let i = 0; i < 12 && node.parentElement; i += 1) {
      const parent = node.parentElement
      const style = getComputedStyle(parent)
      const row = (style.display === 'flex' || style.display === 'inline-flex') && style.flexDirection.startsWith('row')
      const grid = style.display === 'grid' || style.display === 'inline-grid'
      if (row || grid) return node
      node = parent
    }
    return el
  }
  const apply = () => {
    const next = new Set()
    const mark = (el) => {
      const column = columnOf(el)
      if (!column || column === document.body || column === document.documentElement) return
      if (column.querySelector('[data-list-id="chat-messages"]')) return
      next.add(column)
    }
    if (onChannel()) {
      document.querySelectorAll('[data-list-id="guildsnav"], [class*="membersWrap"]').forEach(mark)
      document.querySelectorAll('nav[aria-label], ul[aria-label], aside[aria-label]').forEach((el) => {
        const name = labelOf(el)
        const channelList = name === 'channels' || name === 'canales' || name === 'channel list' || name === 'lista de canales'
        const guildList = name === 'servers' || name === 'servidores'
        const serverNav = el.tagName === 'NAV' && (name.includes('(server)') || name.includes('(servidor)'))
        const members = name === 'members' || name === 'miembros' || name.includes('member list') || name.includes('lista de miembros')
        if (channelList || guildList || serverNav || members) mark(el)
      })
    }
    document.querySelectorAll('.capsuleer-hide-chrome').forEach((el) => {
      if (!next.has(el)) el.classList.remove('capsuleer-hide-chrome')
    })
    next.forEach((el) => el.classList.add('capsuleer-hide-chrome'))
  }
  window.__capsuleerFocusChannel = apply
  apply()
  if (!window.__capsuleerChannelObserver) {
    let timer = 0
    const observer = new MutationObserver(() => {
      if (timer) return
      timer = window.setTimeout(() => {
        timer = 0
        apply()
      }, 250)
    })
    observer.observe(document.documentElement, { childList: true, subtree: true })
    window.__capsuleerChannelObserver = observer
  }
})()`

function revealChannel(contents: WebContents): void {
  if (contents.isDestroyed() || !/\/channels\/\d+\/\d+/.test(contents.getURL())) return
  void contents.executeJavaScript(CHANNEL_ONLY_SCRIPT).catch(() => {})
}

function navigate(url: string): void {
  if (!view || view.webContents.isDestroyed() || !url || url === loadedUrl) return
  loadedUrl = url
  void view.webContents.loadURL(url).catch(() => {
    if (loadedUrl === url) loadedUrl = ''
  })
}

function guardNavigation(contents: WebContents): void {
  const block = (url: string, isMainFrame: boolean, prevent: () => void): void => {
    const allowed = isMainFrame ? allowedMainNavigation(url) : allowedSubframe(url)
    if (!allowed) prevent()
  }

  contents.on('will-frame-navigate', (event) => {
    block(event.url, event.isMainFrame, () => event.preventDefault())
  })
  contents.on('will-redirect', (event) => {
    const allowed = event.isMainFrame ? allowedMainNavigation(event.url) : allowedSubframe(event.url)
    if (!allowed) event.preventDefault()
  })
  contents.setWindowOpenHandler(({ url }) => {
    if (allowedMainNavigation(url)) {
      navigate(url)
      return { action: 'deny' }
    }
    if (isWebUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
}

export function persistDiscordSession(): Promise<void> {
  const discordSession = session.fromPartition(PARTITION)
  discordSession.flushStorageData()
  return discordSession.cookies.flushStore()
}

export function watchDiscordSession(win: BrowserWindow): void {
  let allowClose = false
  win.on('close', (event) => {
    if (allowClose) return
    event.preventDefault()
    const flush = persistDiscordSession().catch(() => undefined)
    const limit = new Promise<void>((resolve) => setTimeout(resolve, 1500))
    void Promise.race([flush, limit]).finally(() => {
      allowClose = true
      if (!win.isDestroyed()) win.close()
    })
  })
}

function ensurePermissions(): void {
  if (permissionsReady) return
  const discordSession = session.fromPartition(PARTITION)
  discordSession.setUserAgent(chromeUserAgent())
  discordSession.setPermissionRequestHandler((_contents, permission, callback) => {
    callback(ALLOWED_PERMISSIONS.has(permission))
  })
  discordSession.setPermissionCheckHandler((_contents, permission) => ALLOWED_PERMISSIONS.has(permission))
  permissionsReady = true
}

function ensureView(win: BrowserWindow): WebContentsView {
  if (view && !view.webContents.isDestroyed()) return view
  ensurePermissions()
  view = new WebContentsView({
    webPreferences: {
      partition: PARTITION,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  })
  view.setBackgroundColor('#07090d')
  view.webContents.setUserAgent(chromeUserAgent())
  guardNavigation(view.webContents)
  view.webContents.on('did-finish-load', () => {
    if (!view) return
    revealChannel(view.webContents)
    if (/\/channels\/\d+\/\d+/.test(view.webContents.getURL())) void persistDiscordSession()
  })
  view.webContents.on('did-navigate-in-page', () => {
    if (view) revealChannel(view.webContents)
  })
  loadedUrl = ''
  win.once('closed', () => {
    if (host === win) host = null
    view = null
    loadedUrl = ''
  })
  return view
}

function readBounds(value: unknown): Rectangle | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Partial<Rectangle>
  const x = Number(raw.x)
  const y = Number(raw.y)
  const width = Number(raw.width)
  const height = Number(raw.height)
  if (![x, y, width, height].every(Number.isFinite)) return null
  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) }
}

function clampBounds(win: BrowserWindow, bounds: Rectangle): Rectangle {
  const [width, height] = win.getContentSize()
  const x = Math.max(0, Math.min(bounds.x, Math.max(0, width - 1)))
  const y = Math.max(0, Math.min(bounds.y, Math.max(0, height - 1)))
  return {
    x,
    y,
    width: Math.max(0, Math.min(bounds.width, width - x)),
    height: Math.max(0, Math.min(bounds.height, height - y))
  }
}

function attach(win: BrowserWindow, next: WebContentsView): void {
  if (host === win) return
  if (host && !host.isDestroyed()) host.contentView.removeChildView(next)
  win.contentView.addChildView(next)
  host = win
}

export function listDiscordChannels(): DiscordState {
  return stateFromStore()
}

export function addDiscordChannel(input: unknown): DiscordState {
  const raw = input && typeof input === 'object' ? (input as { url?: unknown; name?: unknown }) : {}
  const parsed = typeof raw.url === 'string' ? parseDiscordChannelUrl(raw.url) : null
  if (!parsed) throw new Error('El enlace tiene que ser un canal de Discord.')
  const { channels } = stateFromStore()
  const name = cleanName(raw.name) || `Canal ${parsed.channelId.slice(-4)}`
  const existing = channels.find((channel) => channel.url === parsed.url)
  if (existing) {
    const next = channels.map((channel) => (channel.id === existing.id && cleanName(raw.name) ? { ...channel, name } : channel))
    const saved = saveChannels(next, existing.id)
    navigate(parsed.url)
    return saved
  }
  const channel: DiscordChannel = { id: randomUUID(), name, url: parsed.url }
  const saved = saveChannels([...channels, channel], channel.id)
  navigate(parsed.url)
  return saved
}

export function removeDiscordChannel(id: unknown): DiscordState {
  if (typeof id !== 'string') throw new Error('Ese canal no está en la lista.')
  const { channels, activeId } = stateFromStore()
  const next = channels.filter((channel) => channel.id !== id)
  if (next.length === channels.length) throw new Error('Ese canal no está en la lista.')
  const fallback = next.find((channel) => channel.id === activeId)?.id ?? next[0]?.id ?? ''
  const saved = saveChannels(next, fallback)
  const url = next.find((channel) => channel.id === saved.activeId)?.url ?? ''
  if (url) navigate(url)
  else loadedUrl = ''
  return saved
}

export function selectDiscordChannel(id: unknown): DiscordState {
  if (typeof id !== 'string') throw new Error('Ese canal no está en la lista.')
  const { channels } = stateFromStore()
  const channel = channels.find((item) => item.id === id)
  if (!channel) throw new Error('Ese canal no está en la lista.')
  const saved = saveChannels(channels, channel.id)
  navigate(channel.url)
  return saved
}

export function showDiscord(win: BrowserWindow, input: unknown): void {
  const bounds = readBounds(input)
  if (!bounds) return
  const safe = clampBounds(win, bounds)
  if (safe.width < MIN_SIZE || safe.height < MIN_SIZE) {
    hideDiscord(win)
    return
  }
  const url = activeChannel()?.url
  if (!url) {
    hideDiscord(win)
    return
  }
  const next = ensureView(win)
  attach(win, next)
  next.setBounds(safe)
  next.setVisible(true)
  navigate(url)
}

export function hideDiscord(win: BrowserWindow): void {
  if (!view || view.webContents.isDestroyed() || host !== win) return
  view.setVisible(false)
}

export async function openDiscordChannel(id: unknown): Promise<void> {
  const { channels, activeId } = stateFromStore()
  const key = typeof id === 'string' && id ? id : activeId
  const channel = channels.find((item) => item.id === key)
  if (!channel) throw new Error('Elige un canal para abrirlo en Discord.')
  const link = parseDiscordChannelUrl(channel.url)
  if (!link) throw new Error('El enlace de ese canal ya no es válido.')
  try {
    await shell.openExternal(discordDesktopUrl(link))
  } catch {
    await shell.openExternal(link.url)
  }
}

export async function logoutDiscord(): Promise<void> {
  const discordSession = session.fromPartition(PARTITION)
  await discordSession.clearStorageData()
  await discordSession.clearCache()
  if (!view || view.webContents.isDestroyed() || !loadedUrl) return
  const url = loadedUrl
  loadedUrl = ''
  navigate(url)
}
