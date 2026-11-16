import { shell } from 'electron'
import { createHash, createPublicKey, createVerify, randomBytes } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import type {
  ActiveAccelerator,
  CharacterOrder,
  CharacterProfile,
  JournalRow,
  MarketBook,
  MarketBookOrder,
  MarketDay,
  MarketTypeHit,
  Skill,
  SkillGroup,
  TrainingJob
} from '../renderer/src/types'
import marketTypes from '../shared/market-types.json'
import { EVE_SCOPES, REDIRECT_PORT, REDIRECT_URI } from '../shared/eve'
import { readStore, writeStore, type StoredAccount } from './store'

const BASE_ATTRIBUTE = 17
const REMAP_POOL = 14
const DOGMA_CHARISMA = 175
const DOGMA_INTELLIGENCE = 176
const DOGMA_MEMORY = 177
const DOGMA_PERCEPTION = 178
const DOGMA_WILLPOWER = 179
const DOGMA_BOOSTER_SLOT = 1087
const CEREBRAL_SLOT = 10

type AttrKey = 'charisma' | 'intelligence' | 'memory' | 'perception' | 'willpower'
const ATTR_KEYS: AttrKey[] = ['charisma', 'intelligence', 'memory', 'perception', 'willpower']

type DogmaBag = {
  name: string
  mods: Record<AttrKey, number>
  boosterSlot: number | null
  attrBonus: number | null
}

const COLORS = ['#d7b56a', '#6ec8d6', '#e17b7b', '#8ed07a', '#c9a0e0', '#e39a45']
const ISSUERS = new Set(['https://login.eveonline.com', 'login.eveonline.com'])

type TokenResponse = {
  access_token: string
  refresh_token?: string
  expires_in: number
  token_type: string
}

type EveClaims = {
  sub: string
  name: string
  scp?: string | string[]
  exp: number
  iss: string
  aud?: string | string[]
}

type EsiSkill = {
  skill_id: number
  trained_skill_level: number
  skillpoints_in_skill: number
  active_skill_level: number
}

type EsiQueue = {
  skill_id: number
  finished_level: number
  queue_position: number
  start_date?: string
  finish_date?: string
  level_start_sp?: number
  level_end_sp?: number
  training_start_sp?: number
}

type EsiAsset = {
  item_id?: number
  type_id: number
  quantity: number
  location_id: number
  location_type: string
  is_blueprint_copy?: boolean
  is_singleton?: boolean
}

type EsiJournal = {
  id: number
  date: string
  description: string
  ref_type: string
  amount: number
  balance: number
}

class EsiStatusError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

let activeLogin: { close: (error?: Error) => void } | null = null

function base64url(value: Buffer): string {
  return value.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function decodeBase64url(value: string): Buffer {
  const pad = value.length % 4 === 0 ? '' : '='.repeat(4 - (value.length % 4))
  return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64')
}

function pkce(): { verifier: string; challenge: string } {
  const verifier = base64url(randomBytes(32))
  const challenge = base64url(createHash('sha256').update(verifier).digest())
  return { verifier, challenge }
}

async function tokenRequest(body: URLSearchParams, clientId: string, clientSecret: string): Promise<TokenResponse> {
  const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' }
  if (clientSecret) {
    headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
    body.delete('client_id')
  }
  const response = await fetch('https://login.eveonline.com/v2/oauth/token', { method: 'POST', headers, body })
  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`EVE rechazó el intercambio del código (${response.status}). ${detail.slice(0, 180)}`)
  }
  return (await response.json()) as TokenResponse
}

async function verifyAccessToken(token: string, clientId: string): Promise<EveClaims> {
  const [headerPart, payloadPart, signaturePart] = token.split('.')
  if (!headerPart || !payloadPart || !signaturePart) throw new Error('El token de EVE no tiene un formato válido.')
  const header = JSON.parse(decodeBase64url(headerPart).toString('utf8')) as { alg?: string; kid?: string }
  if (header.alg !== 'RS256' || !header.kid) throw new Error('El token de EVE usa un algoritmo no admitido.')

  const metadata = (await fetch('https://login.eveonline.com/.well-known/oauth-authorization-server').then((response) =>
    response.json()
  )) as { jwks_uri: string }
  const jwks = (await fetch(metadata.jwks_uri).then((response) => response.json())) as { keys: Array<JsonWebKey & { kid?: string }> }
  const jwk = jwks.keys.find((key) => key.kid === header.kid)
  if (!jwk) throw new Error('No se encontró la clave pública de EVE para este token.')

  const verifier = createVerify('RSA-SHA256')
  verifier.update(`${headerPart}.${payloadPart}`)
  const valid = verifier.verify(createPublicKey({ key: jwk, format: 'jwk' }), decodeBase64url(signaturePart))
  if (!valid) throw new Error('La firma del token de EVE no es válida.')

  const claims = JSON.parse(decodeBase64url(payloadPart).toString('utf8')) as EveClaims
  const issuer = claims.iss.replace(/\/$/, '')
  if (!ISSUERS.has(issuer)) throw new Error('El token no fue emitido por EVE.')
  const audience = Array.isArray(claims.aud) ? claims.aud : claims.aud ? [claims.aud] : []
  if (!audience.includes(clientId) || !audience.includes('EVE Online')) {
    throw new Error('El token no corresponde a la aplicación configurada.')
  }
  if (claims.exp * 1000 <= Date.now()) throw new Error('El token de acceso ha caducado.')
  return claims
}

function beginCallback(state: string): { result: Promise<string>; listening: Promise<void> } {
  let resolveCode: (code: string) => void
  let rejectCode: (error: Error) => void
  let resolveListen: () => void
  let rejectListen: (error: Error) => void
  const result = new Promise<string>((resolve, reject) => {
    resolveCode = resolve
    rejectCode = reject
  })
  const listening = new Promise<void>((resolve, reject) => {
    resolveListen = resolve
    rejectListen = reject
  })
  let server: Server | null = null
  let settled = false
  const finish = (error?: Error, code?: string) => {
    if (settled) return
    settled = true
    activeLogin = null
    server?.close()
    if (error || !code) rejectCode(error ?? new Error('No se recibió el código de EVE.'))
    else resolveCode(code)
  }
  activeLogin = { close: (error) => finish(error ?? new Error('Inicio de sesión cancelado.')) }
  server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', REDIRECT_URI)
    if (url.pathname !== '/callback') {
      response.writeHead(404)
      response.end()
      return
    }
    const error = url.searchParams.get('error_description') ?? url.searchParams.get('error')
    const code = url.searchParams.get('code')
    const returned = url.searchParams.get('state')
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    response.end(
      '<!doctype html><html lang="es"><body style="font-family:sans-serif;background:#10161c;color:#e0c27a;padding:32px"><p>Ya puedes volver a capsuleerOS.</p></body></html>'
    )
    if (error) finish(new Error(error))
    else if (returned !== state || !code) finish(new Error('La respuesta de EVE no coincide con esta sesión.'))
    else finish(undefined, code)
  })
  server.on('error', () => {
    const error = new Error(`El puerto ${REDIRECT_PORT} está ocupado. Ciérralo y vuelve a intentarlo.`)
    rejectListen(error)
    finish(error)
  })
  server.listen(REDIRECT_PORT, '127.0.0.1', () => resolveListen())
  setTimeout(() => finish(new Error('Se agotó el tiempo de espera del navegador.')), 180_000)
  return { result, listening }
}

export function cancelLogin(): void {
  activeLogin?.close(new Error('Inicio de sesión cancelado.'))
}

async function esi<T>(path: string, token?: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`https://esi.evetech.net/latest${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      'User-Agent': 'capsuleerOS/0.1',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {})
    }
  })
  if (!response.ok) throw new EsiStatusError(response.status, `ESI ${path} respondió ${response.status}`)
  return (await response.json()) as T
}

async function optionalEsi<T>(path: string, token: string): Promise<T | null> {
  try {
    return await esi<T>(path, token)
  } catch (error) {
    if (error instanceof EsiStatusError && (error.status === 403 || error.status === 404)) return null
    return null
  }
}

async function mapPool<T, R>(items: T[], size: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      results[index] = await run(items[index]!)
    }
  })
  await Promise.all(workers)
  return results
}

type SkillCatalogEntry = { id: number; name: string; groupId: number; group: string }

let skillCatalogTask: Promise<SkillCatalogEntry[]> | null = null

function skillCatalog(): Promise<SkillCatalogEntry[]> {
  skillCatalogTask ??= loadSkillCatalog().catch((error: unknown) => {
    skillCatalogTask = null
    throw error
  })
  return skillCatalogTask
}

async function loadSkillCatalog(): Promise<SkillCatalogEntry[]> {
  const category = await esi<{ groups: number[] }>('/universe/categories/16/')
  const groups = await mapPool(category.groups, 8, (id) =>
    esi<{ name: string; published: boolean; types: number[] }>(`/universe/groups/${id}/`)
      .then((group) => ({ id, name: group.name, published: group.published, types: group.types }))
      .catch(() => null)
  )
  const typed = groups.flatMap((group) =>
    group?.published ? group.types.map((typeId) => ({ id: typeId, groupId: group.id, group: group.name })) : []
  )
  const names = await namesOf(typed.map((item) => item.id))
  return typed
    .map((item) => ({
      id: item.id,
      name: names.get(item.id) ?? `Habilidad ${item.id}`,
      groupId: item.groupId,
      group: item.group
    }))
    .sort((a, b) => a.group.localeCompare(b.group, 'en') || a.name.localeCompare(b.name, 'en'))
}

function groupOwnedSkills(
  owned: EsiSkill[],
  catalogById: Map<number, SkillCatalogEntry>,
  skillNames: Map<number, string>
): SkillGroup[] {
  const byGroup = new Map<string, Skill[]>()
  for (const skill of owned) {
    const meta = catalogById.get(skill.skill_id)
    const groupName = meta?.group ?? 'Other'
    const row: Skill = {
      typeId: skill.skill_id,
      name: meta?.name ?? skillNames.get(skill.skill_id) ?? `Habilidad ${skill.skill_id}`,
      rank: null,
      level: skill.active_skill_level,
      sp: skill.skillpoints_in_skill,
      nextSp: null
    }
    const list = byGroup.get(groupName) ?? []
    list.push(row)
    byGroup.set(groupName, list)
  }
  return [...byGroup.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'en'))
    .map(([name, skills]) => ({
      name,
      skills: skills.sort((a, b) => a.name.localeCompare(b.name, 'en'))
    }))
}

type EsiOrder = {
  order_id: number
  type_id: number
  location_id: number
  volume_total: number
  volume_remain: number
  price: number
  is_buy_order?: boolean
  is_corporation?: boolean
  duration: number
  issued: string
  range: string
}

async function characterOrders(characterId: number, token: string): Promise<EsiOrder[] | null> {
  const orders: EsiOrder[] = []
  let page = 1
  let pages = 1
  while (page <= pages && page <= 20) {
    const response = await fetch(
      `https://esi.evetech.net/latest/characters/${characterId}/orders/?page=${page}`,
      {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
          'User-Agent': 'capsuleerOS/0.1'
        }
      }
    )
    if (response.status === 403 || response.status === 404) return null
    if (!response.ok) return orders.length > 0 ? orders : null
    pages = Number(response.headers.get('x-pages') ?? '1') || 1
    orders.push(...((await response.json()) as EsiOrder[]))
    page += 1
  }
  return orders
}

function orderRange(range: string): string {
  if (range === 'station') return 'Estación'
  if (range === 'solarsystem') return 'Sistema'
  if (range === 'region') return 'Región'
  const jumps = Number(range)
  if (!Number.isFinite(jumps)) return range
  return jumps === 1 ? '1 salto' : `${jumps} saltos`
}

function orderExpiry(issued: string, duration: number): string {
  const date = new Date(issued)
  if (Number.isNaN(date.getTime())) return issued
  date.setUTCDate(date.getUTCDate() + duration)
  return date.toISOString()
}

async function describeOrders(rows: EsiOrder[], token: string): Promise<CharacterOrder[]> {
  const structureIds = [...new Set(rows.map((row) => row.location_id).filter((id) => id >= 1_000_000_000))]
  const names = await namesOf([
    ...rows.map((row) => row.type_id),
    ...rows.map((row) => row.location_id).filter((id) => id < 1_000_000_000)
  ])
  const structures = new Map<number, string>()
  await mapPool(structureIds, 6, async (id) => {
    const row = await optionalEsi<{ name: string }>(`/universe/structures/${id}/`, token)
    if (row?.name) structures.set(id, row.name)
    return null
  })
  return rows.map((row) => ({
    id: String(row.order_id),
    typeId: row.type_id,
    name: names.get(row.type_id) ?? `Tipo ${row.type_id}`,
    price: row.price,
    remain: row.volume_remain,
    total: row.volume_total,
    location:
      row.location_id >= 1_000_000_000
        ? (structures.get(row.location_id) ?? 'Estructura')
        : (names.get(row.location_id) ?? 'Estación'),
    range: orderRange(row.range),
    issued: row.issued,
    expires: orderExpiry(row.issued, row.duration),
    buy: row.is_buy_order === true,
    corporation: row.is_corporation === true
  }))
}

async function characterAssets(characterId: number, token: string): Promise<EsiAsset[] | null> {
  const loadPage = async (page: number) => {
    const response = await fetch(`https://esi.evetech.net/latest/characters/${characterId}/assets/?page=${page}`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        'User-Agent': 'capsuleerOS/0.1'
      }
    })
    if (response.status === 403 || response.status === 404) return { denied: true, rows: [] as EsiAsset[], pages: 1 }
    if (!response.ok) return { denied: false, rows: [] as EsiAsset[], pages: 1 }
    return {
      denied: false,
      rows: (await response.json()) as EsiAsset[],
      pages: Number(response.headers.get('x-pages') ?? '1') || 1
    }
  }
  const first = await loadPage(1)
  if (first.denied) return null
  const pageCount = Math.min(first.pages, 40)
  if (pageCount <= 1) return first.rows
  const rest = await mapPool(
    Array.from({ length: pageCount - 1 }, (_, index) => index + 2),
    8,
    (page) => loadPage(page).catch(() => ({ denied: false, rows: [] as EsiAsset[], pages: 1 }))
  )
  return [first.rows, ...rest.map((page) => page.rows)].flat()
}

let shipTypesTask: Promise<Set<number>> | null = null

function shipTypes(): Promise<Set<number>> {
  shipTypesTask ??= loadShipTypes().catch((error: unknown) => {
    shipTypesTask = null
    throw error
  })
  return shipTypesTask
}

async function loadShipTypes(): Promise<Set<number>> {
  const category = await esi<{ groups: number[] }>('/universe/categories/6/')
  const groups = await mapPool(category.groups, 8, (id) =>
    esi<{ published: boolean; types: number[] }>(`/universe/groups/${id}/`).catch(() => null)
  )
  return new Set(groups.flatMap((group) => (group?.published ? group.types : [])))
}

let marketPricesTask: Promise<Map<number, number>> | null = null

function marketPrices(): Promise<Map<number, number>> {
  marketPricesTask ??= loadMarketPrices().catch((error: unknown) => {
    marketPricesTask = null
    throw error
  })
  return marketPricesTask
}

async function loadMarketPrices(): Promise<Map<number, number>> {
  const rows = await esi<{ type_id: number; average_price?: number; adjusted_price?: number }[]>('/markets/prices/')
  const prices = new Map<number, number>()
  for (const row of rows) {
    const price = row.average_price ?? row.adjusted_price ?? 0
    if (price > 0) prices.set(row.type_id, price)
  }
  return prices
}

const volumeCache = new Map<number, { volume: number; packaged: number }>()

async function typeVolumes(ids: number[]): Promise<Map<number, { volume: number; packaged: number }>> {
  const missing = [...new Set(ids.filter((id) => id > 0 && !volumeCache.has(id)))]
  await mapPool(missing, 8, async (id) => {
    try {
      const row = await esi<{ volume?: number; packaged_volume?: number }>(`/universe/types/${id}/`)
      volumeCache.set(id, { volume: row.volume ?? 0, packaged: row.packaged_volume ?? row.volume ?? 0 })
    } catch {
      return null
    }
    return null
  })
  const map = new Map<number, { volume: number; packaged: number }>()
  for (const id of new Set(ids)) {
    const row = volumeCache.get(id)
    if (row) map.set(id, row)
  }
  return map
}

function occupiedVolume(
  info: { volume: number; packaged: number } | undefined,
  qty: number,
  ship: boolean,
  singleton: boolean
): number {
  if (!info) return 0
  const unit = ship && singleton ? info.volume : info.packaged
  return unit * qty
}

const CONTAINER_GROUPS = [12, 340, 448, 649]
let containerTypesTask: Promise<Set<number>> | null = null

function containerTypes(): Promise<Set<number>> {
  containerTypesTask ??= loadContainerTypes().catch((error: unknown) => {
    containerTypesTask = null
    throw error
  })
  return containerTypesTask
}

async function loadContainerTypes(): Promise<Set<number>> {
  const groups = await mapPool(CONTAINER_GROUPS, 4, (id) =>
    esi<{ types: number[] }>(`/universe/groups/${id}/`).catch(() => null)
  )
  return new Set(groups.flatMap((group) => group?.types ?? []))
}

async function assetNames(characterId: number, token: string, ids: number[]): Promise<Map<number, string>> {
  const map = new Map<number, string>()
  const unique = [...new Set(ids.filter((id) => id > 0))]
  async function load(chunk: number[]): Promise<void> {
    if (chunk.length === 0) return
    const rows = await esi<{ item_id: number; name: string }[]>(`/characters/${characterId}/assets/names/`, token, {
      method: 'POST',
      body: JSON.stringify(chunk),
      headers: { 'Content-Type': 'application/json' }
    }).catch(() => null)
    if (rows) {
      for (const row of rows) {
        if (row.name.trim()) map.set(row.item_id, row.name.trim())
      }
      return
    }
    if (chunk.length === 1) return
    const mid = Math.ceil(chunk.length / 2)
    await load(chunk.slice(0, mid))
    await load(chunk.slice(mid))
  }
  for (let index = 0; index < unique.length; index += 1000) await load(unique.slice(index, index + 1000))
  return map
}

async function namesOf(ids: number[]): Promise<Map<number, string>> {
  const unique = [...new Set(ids.filter((id) => id > 0))]
  const map = new Map<number, string>()
  async function load(chunk: number[]): Promise<void> {
    if (chunk.length === 0) return
    const rows = await esi<{ id: number; name: string }[]>('/universe/names/', undefined, {
      method: 'POST',
      body: JSON.stringify(chunk),
      headers: { 'Content-Type': 'application/json' }
    }).catch(() => null)
    if (rows) {
      for (const row of rows) map.set(row.id, row.name)
      return
    }
    if (chunk.length === 1) return
    const mid = Math.ceil(chunk.length / 2)
    await load(chunk.slice(0, mid))
    await load(chunk.slice(mid))
  }
  for (let index = 0; index < unique.length; index += 500) await load(unique.slice(index, index + 500))
  return map
}

function remaining(iso?: string): string {
  if (!iso) return 'en pausa'
  const minutes = Math.round((new Date(iso).getTime() - Date.now()) / 60_000)
  if (minutes <= 0) return 'listo'
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const mins = minutes % 60
  if (days > 0) return `${days} d ${hours} h`
  if (hours > 0) return `${hours} h ${mins} min`
  return `${mins} min`
}

const dogmaCache = new Map<number, DogmaBag>()

async function dogmaOf(typeId: number): Promise<DogmaBag> {
  const cached = dogmaCache.get(typeId)
  if (cached) return cached
  const row = await esi<{
    name?: string
    dogma_attributes?: Array<{ attribute_id: number; value: number }>
  }>(`/universe/types/${typeId}/`).catch(() => null)
  const byId = new Map((row?.dogma_attributes ?? []).map((a) => [a.attribute_id, a.value]))
  const mods = {
    charisma: Math.round(byId.get(DOGMA_CHARISMA) ?? 0),
    intelligence: Math.round(byId.get(DOGMA_INTELLIGENCE) ?? 0),
    memory: Math.round(byId.get(DOGMA_MEMORY) ?? 0),
    perception: Math.round(byId.get(DOGMA_PERCEPTION) ?? 0),
    willpower: Math.round(byId.get(DOGMA_WILLPOWER) ?? 0)
  }
  const slotRaw = byId.get(DOGMA_BOOSTER_SLOT)
  const uniform = ATTR_KEYS.every((key) => mods[key] === mods.charisma) && mods.charisma > 0
  const info: DogmaBag = {
    name: row?.name ?? `Tipo ${typeId}`,
    mods,
    boosterSlot: slotRaw != null ? Math.round(slotRaw) : null,
    attrBonus: uniform ? mods.charisma : null
  }
  dogmaCache.set(typeId, info)
  return info
}

function acceleratorBonusFromAttributes(
  attrs: Record<AttrKey, number>,
  implantMods: Record<AttrKey, number>
): number {
  const excess = ATTR_KEYS.map((key) => attrs[key] - BASE_ATTRIBUTE - (implantMods[key] ?? 0))
  if (excess.some((value) => !Number.isFinite(value))) return 0
  const total = excess.reduce((sum, value) => sum + value, 0)
  const raw = (total - REMAP_POOL) / ATTR_KEYS.length
  if (!Number.isFinite(raw) || raw < 1) return 0
  const bonus = Math.round(raw)
  if (bonus < 1) return 0
  if (Math.min(...excess) < bonus) return 0
  if (Math.abs(raw - bonus) > 0.05) return 0
  return bonus
}

async function resolveAccelerator(
  characterId: number,
  token: string
): Promise<{ accelerator: ActiveAccelerator | null; implantsMissing: boolean }> {
  const [attrs, implantIds] = await Promise.all([
    optionalEsi<Record<AttrKey, number>>(`/characters/${characterId}/attributes/`, token),
    optionalEsi<number[]>(`/characters/${characterId}/implants/`, token)
  ])
  const implantsMissing = implantIds === null
  if (!attrs) return { accelerator: null, implantsMissing }

  const implantList = implantIds ?? []
  const dogmaRows = implantList.length > 0 ? await mapPool(implantList, 6, (id) => dogmaOf(id)) : []

  // Si el acelerador sale en /implants (slot 10), usarlo directamente.
  const cerebral = dogmaRows.find(
    (row) => row.boosterSlot === CEREBRAL_SLOT && (row.attrBonus ?? 0) > 0
  )
  if (cerebral?.attrBonus) {
    return {
      accelerator: { name: cerebral.name, bonus: cerebral.attrBonus },
      implantsMissing
    }
  }

  // Si no, inferir el bonus uniforme restando solo implantes neurales (no boosters).
  const implantMods: Record<AttrKey, number> = {
    charisma: 0,
    intelligence: 0,
    memory: 0,
    perception: 0,
    willpower: 0
  }
  for (const row of dogmaRows) {
    if (row.boosterSlot === CEREBRAL_SLOT) continue
    for (const key of ATTR_KEYS) implantMods[key] += row.mods[key]
  }

  const bonus = acceleratorBonusFromAttributes(attrs, implantMods)
  if (bonus < 1) return { accelerator: null, implantsMissing }
  return {
    accelerator: { name: `Acelerador cerebral +${bonus}`, bonus },
    implantsMissing
  }
}

function resolveMultipilot(): CharacterProfile['multipilot'] {
  const store = readStore()
  const now = Date.now()
  const activeQueues = store.accounts.filter((account) => {
    const job = account.profile.trainingQueue?.[0]
    return job?.finishAt != null && Date.parse(job.finishAt) > now
  }).length
  if (activeQueues < 2) return null
  return { activeQueues }
}

async function buildProfile(accessToken: string, claims: EveClaims): Promise<CharacterProfile> {
  const characterId = Number(claims.sub.split(':')[2])
  if (!Number.isFinite(characterId)) throw new Error('EVE no indicó un personaje válido.')
  const missing: string[] = []
  const token = accessToken
  const catalogTask = skillCatalog()
  const assetsTask = characterAssets(characterId, token)
  const ordersTask = characterOrders(characterId, token)

  const [info, skillsDoc, queueDoc, location, ship, clones, wallet, journalDoc] = await Promise.all([
    esi<{ corporation_id: number; alliance_id?: number; security_status: number }>(`/characters/${characterId}/`),
    optionalEsi<{ total_sp: number; skills: EsiSkill[] }>(`/characters/${characterId}/skills/`, token),
    optionalEsi<EsiQueue[]>(`/characters/${characterId}/skillqueue/`, token),
    optionalEsi<{ solar_system_id: number; station_id?: number; structure_id?: number }>(`/characters/${characterId}/location/`, token),
    optionalEsi<{ ship_type_id: number }>(`/characters/${characterId}/ship/`, token),
    optionalEsi<{ home_location?: { location_id: number; location_type: string } }>(`/characters/${characterId}/clones/`, token),
    optionalEsi<number>(`/characters/${characterId}/wallet/`, token),
    optionalEsi<EsiJournal[]>(`/characters/${characterId}/wallet/journal/?page=1`, token)
  ])
  if (!skillsDoc) missing.push('habilidades')
  if (!queueDoc) missing.push('cola de habilidades')
  if (!location) missing.push('localización')
  if (!ship) missing.push('nave')
  if (wallet === null) missing.push('monedero')

  const accelFinal = await resolveAccelerator(characterId, token).catch(() => ({
    accelerator: null,
    implantsMissing: false
  }))
  if (accelFinal.implantsMissing) missing.push('implantes')
  const acceleratorResolved = accelFinal.accelerator

  const skillIds = [
    ...(skillsDoc?.skills.map((skill) => skill.skill_id) ?? []),
    ...(queueDoc?.map((job) => job.skill_id) ?? [])
  ]
  const placeIds = [location?.station_id, ship?.ship_type_id, clones?.home_location?.location_id].filter(
    (id): id is number => typeof id === 'number'
  )
  const [corporation, alliance, skillNames, placeNames, systemInfo, structure] = await Promise.all([
    esi<{ name: string }>(`/corporations/${info.corporation_id}/`),
    info.alliance_id ? optionalEsi<{ name: string }>(`/alliances/${info.alliance_id}/`, token) : Promise.resolve(null),
    skillIds.length > 0 ? namesOf(skillIds) : Promise.resolve(new Map<number, string>()),
    placeIds.length > 0 ? namesOf(placeIds) : Promise.resolve(new Map<number, string>()),
    location?.solar_system_id
      ? esi<{ name: string; security_status: number; constellation_id: number }>(`/universe/systems/${location.solar_system_id}/`).catch(() => null)
      : Promise.resolve(null),
    location?.structure_id ? optionalEsi<{ name: string }>(`/universe/structures/${location.structure_id}/`, token) : Promise.resolve(null)
  ])
  const owned = [...(skillsDoc?.skills ?? [])]
  const ownedIds = new Set(owned.map((skill) => skill.skill_id))
  let catalog: SkillCatalogEntry[] = []
  let unownedSkills: Skill[] = []
  try {
    const [catalogRows, assets] = await Promise.all([catalogTask, assetsTask])
    catalog = catalogRows
    const assetIds = assets ? new Set(assets.map((asset) => asset.type_id)) : null
    unownedSkills = catalog
      .filter((skill) => !ownedIds.has(skill.id) && !assetIds?.has(skill.id))
      .map((skill) => ({
        typeId: skill.id,
        name: skill.name,
        rank: null,
        level: 0,
        sp: 0,
        nextSp: null,
        group: skill.group,
        buy: true
      }))
  } catch {
    catalog = []
    unownedSkills = []
  }
  const catalogById = new Map(catalog.map((skill) => [skill.id, skill]))
  const skillGroups: SkillGroup[] =
    owned.length === 0
      ? []
      : catalogById.size > 0
        ? groupOwnedSkills(owned, catalogById, skillNames)
        : [
            {
              name: 'Habilidades',
              skills: owned
                .map((skill) => ({
                  typeId: skill.skill_id,
                  name: skillNames.get(skill.skill_id) ?? `Habilidad ${skill.skill_id}`,
                  rank: null,
                  level: skill.active_skill_level,
                  sp: skill.skillpoints_in_skill,
                  nextSp: null
                }))
                .sort((a, b) => a.name.localeCompare(b.name, 'en'))
            }
          ]

  const spById = new Map((skillsDoc?.skills ?? []).map((skill) => [skill.skill_id, skill.skillpoints_in_skill]))
  const trainingQueue: TrainingJob[] = (queueDoc ?? [])
    .filter((job) => job.finished_level > 0)
    .sort((a, b) => a.queue_position - b.queue_position)
    .map((job) => {
      const start = job.level_start_sp ?? 0
      const end = job.level_end_sp ?? start
      const trainingStartSp = job.training_start_sp ?? spById.get(job.skill_id) ?? start
      const current = spById.get(job.skill_id) ?? trainingStartSp
      const progress = end > start ? Math.min(1, Math.max(0, (current - start) / (end - start))) : 0
      const remainingSp = Math.max(0, end - Math.max(current, start))
      return {
        typeId: job.skill_id,
        name: skillNames.get(job.skill_id) ?? `Habilidad ${job.skill_id}`,
        from: Math.max(0, job.finished_level - 1),
        to: job.finished_level,
        progress,
        remaining: remaining(job.finish_date),
        remainingSp,
        finishAt: job.finish_date ?? null,
        startAt: job.start_date ?? null,
        levelStartSp: start,
        levelEndSp: end,
        trainingStartSp
      }
    })
  const lastFinish = [...(queueDoc ?? [])].sort((a, b) => b.queue_position - a.queue_position)[0]?.finish_date
  const queueSummary = trainingQueue.length === 0 ? 'vacía' : remaining(lastFinish)

  let system = 'Desconocido'
  let regionId = 0
  let regionName = ''
  let security = info.security_status
  if (systemInfo) {
    system = systemInfo.name
    security = systemInfo.security_status
    const place = await solarRegion(systemInfo.constellation_id)
    if (place) {
      regionId = place.id
      regionName = place.name
    }
  }
  let station = location?.station_id ? (placeNames.get(location.station_id) ?? 'Estación') : 'En el espacio'
  if (location?.structure_id) {
    station = structure?.name ?? 'Estructura'
    if (!structure) missing.push('estructuras')
  }
  const shipName = ship?.ship_type_id ? (placeNames.get(ship.ship_type_id) ?? 'Nave') : 'Desconocida'
  const cloneName = clones?.home_location?.location_id
    ? (placeNames.get(clones.home_location.location_id) ?? 'Clon médico')
    : 'Sin datos de clon'

  const journal: JournalRow[] = (journalDoc ?? [])
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 40)
    .map((row) => ({
      when: row.date,
      ref: row.ref_type.replaceAll('_', ' '),
      party: row.description || '—',
      amount: row.amount,
      balance: row.balance
    }))

  const assets = await assetsTask
  if (!assets) missing.push('inventario')
  const locations = await assetLocations(characterId, assets ?? [], token)
  const rawOrders = await ordersTask
  if (!rawOrders) missing.push('mercado')
  const orders = rawOrders ? await describeOrders(rawOrders, token) : []

  return {
    id: `eve-${characterId}`,
    color: COLORS[characterId % COLORS.length] ?? COLORS[0],
    source: 'esi',
    notice:
      missing.length > 0
        ? `Sin permiso de ESI para: ${[...new Set(missing)].join(', ')}. Añade esos scopes en la aplicación que ya tienes y vuelve a conectar el personaje.`
        : undefined,
    character: {
      name: claims.name,
      corp: corporation.name,
      alliance: alliance?.name ?? 'Sin alianza',
      system,
      regionId,
      region: regionName,
      security,
      station,
      ship: shipName,
      skillpoints: skillsDoc?.total_sp ?? 0,
      wallet: wallet ?? 0,
      clone: cloneName
    },
    skillGroups,
    unownedSkills,
    trainingQueue,
    queueSummary,
    accelerator: acceleratorResolved,
    multipilot: resolveMultipilot(),
    locations,
    journal,
    orders
  }
}

function itemLabel(typeId: number, itemId: number, types: Map<number, string>, named: Map<number, string>): string {
  const typeName = types.get(typeId) ?? `Tipo ${typeId}`
  const custom = named.get(itemId)
  if (!custom || custom.toLowerCase() === typeName.toLowerCase()) return typeName
  return `${custom} · ${typeName}`
}

function assetRoot(asset: EsiAsset, byItem: Map<number, EsiAsset>): { kind: string; id: number } {
  let current = asset
  const seen = new Set<number>()
  while (current.location_type === 'item') {
    if (seen.has(current.location_id)) break
    seen.add(current.location_id)
    const parent = byItem.get(current.location_id)
    if (!parent) return { kind: 'structure', id: current.location_id }
    current = parent
  }
  if (current.location_type === 'station') return { kind: 'station', id: current.location_id }
  if (current.location_type === 'solar_system') return { kind: 'system', id: current.location_id }
  return { kind: 'other', id: current.location_id }
}

async function assetLocations(characterId: number, assets: EsiAsset[], token: string): Promise<CharacterProfile['locations']> {
  if (assets.length === 0) {
    return [{ id: 'empty', name: 'Sin activos visibles', detail: 'El inventario está vacío o el permiso no está concedido', assets: [] }]
  }
  const byItem = new Map<number, EsiAsset>()
  for (const asset of assets) {
    if (typeof asset.item_id === 'number') byItem.set(asset.item_id, asset)
  }
  type ItemNode = {
    itemId: number
    typeId: number
    qty: number
    ship: boolean
    singleton: boolean
    blueprintCopy: boolean
    children: ItemNode[]
  }
  const nodes = new Map<number, ItemNode>()
  const ships = await shipTypes().catch(() => new Set<number>())
  for (const asset of assets) {
    if (typeof asset.item_id !== 'number') continue
    nodes.set(asset.item_id, {
      itemId: asset.item_id,
      typeId: asset.type_id,
      qty: asset.quantity,
      ship: ships.has(asset.type_id),
      singleton: asset.is_singleton === true,
      blueprintCopy: asset.is_blueprint_copy === true,
      children: []
    })
  }
  const nested = new Set<number>()
  for (const asset of assets) {
    if (typeof asset.item_id !== 'number' || asset.location_type !== 'item' || asset.location_id === asset.item_id) continue
    const parent = nodes.get(asset.location_id)
    const node = nodes.get(asset.item_id)
    if (!parent || !node) continue
    parent.children.push(node)
    nested.add(asset.item_id)
  }

  const placeIds = assets
    .filter((asset) => typeof asset.item_id === 'number' && !nested.has(asset.item_id))
    .map((asset) => assetRoot(asset, byItem))
  const names = await namesOf([
    ...assets.map((asset) => asset.type_id),
    ...placeIds.filter((place) => place.kind === 'station' || place.kind === 'system').map((place) => place.id)
  ])
  const prices = await marketPrices().catch(() => new Map<number, number>())
  const volumes = await typeVolumes(assets.map((asset) => asset.type_id)).catch(() => new Map<number, { volume: number; packaged: number }>())
  const containers = await containerTypes().catch(() => new Set<number>())
  const named = await assetNames(
    characterId,
    token,
    assets
      .filter((asset) => {
        if (typeof asset.item_id !== 'number') return false
        if (containers.has(asset.type_id)) return true
        return asset.is_singleton === true && ships.has(asset.type_id)
      })
      .map((asset) => asset.item_id ?? 0)
  )
  const structureIds = [...new Set(placeIds.filter((place) => place.kind === 'structure').map((place) => place.id))]
  const structureNames = new Map<number, string>()
  await mapPool(structureIds, 6, async (id) => {
    const row = await optionalEsi<{ name: string }>(`/universe/structures/${id}/`, token)
    if (row?.name) structureNames.set(id, row.name)
    return null
  })

  const toAsset = (node: ItemNode): CharacterProfile['locations'][number]['assets'][number] => ({
    id: String(node.itemId),
    name: itemLabel(node.typeId, node.itemId, names, named),
    qty: node.qty,
    volume: occupiedVolume(volumes.get(node.typeId), node.qty, node.ship, node.singleton),
    value: (node.blueprintCopy ? 0 : (prices.get(node.typeId) ?? 0)) * node.qty,
    typeId: node.typeId,
    ship: node.ship,
    copy: node.blueprintCopy,
    contents: node.children
      .map((child) => toAsset(child))
      .sort((a, b) => Number(b.contents.length > 0) - Number(a.contents.length > 0) || a.name.localeCompare(b.name, 'es'))
  })

  const grouped = new Map<string, { id: string; name: string; detail: string; assets: ItemNode[] }>()
  for (const asset of assets) {
    if (typeof asset.item_id !== 'number' || nested.has(asset.item_id)) continue
    const node = nodes.get(asset.item_id)
    if (!node) continue
    const root = assetRoot(asset, byItem)
    const key = `${root.kind}:${root.id}`
    let name = 'Otra ubicación'
    let detail = 'Hangar'
    if (root.kind === 'station') {
      name = names.get(root.id) ?? 'Estación'
      detail = 'Estación'
    } else if (root.kind === 'system') {
      name = names.get(root.id) ?? 'Sistema'
      detail = 'En el espacio'
    } else if (root.kind === 'structure') {
      name = structureNames.get(root.id) ?? 'Estructura'
      detail = 'Estructura'
    }
    const group = grouped.get(key) ?? { id: key, name, detail, assets: [] }
    group.assets.push(node)
    grouped.set(key, group)
  }

  return [...grouped.values()]
    .map((group) => ({
      id: group.id,
      name: group.name,
      detail: group.detail,
      assets: group.assets.map((node) => toAsset(node)).sort((a, b) => a.name.localeCompare(b.name, 'es'))
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'))
}

async function login(clientId: string, clientSecret: string): Promise<CharacterProfile> {
  cancelLogin()
  const { verifier, challenge } = pkce()
  const state = base64url(randomBytes(16))
  const authorize = new URL('https://login.eveonline.com/v2/oauth/authorize')
  authorize.searchParams.set('response_type', 'code')
  authorize.searchParams.set('redirect_uri', REDIRECT_URI)
  authorize.searchParams.set('client_id', clientId)
  authorize.searchParams.set('scope', EVE_SCOPES.join(' '))
  authorize.searchParams.set('code_challenge', challenge)
  authorize.searchParams.set('code_challenge_method', 'S256')
  authorize.searchParams.set('state', state)

  const pending = beginCallback(state)
  void pending.result.catch(() => undefined)
  await pending.listening
  await shell.openExternal(authorize.toString())
  const code = await pending.result
  const tokens = await tokenRequest(
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      code_verifier: verifier,
      redirect_uri: REDIRECT_URI
    }),
    clientId,
    clientSecret
  )
  const claims = await verifyAccessToken(tokens.access_token, clientId)
  const profile = await buildProfile(tokens.access_token, claims)
  const characterId = Number(claims.sub.split(':')[2])
  const store = readStore()
  const account: StoredAccount = {
    characterId,
    refreshToken: tokens.refresh_token ?? '',
    profile
  }
  store.accounts = [account, ...store.accounts.filter((item) => item.characterId !== characterId)]
  writeStore(store)
  return profile
}

async function refreshAccount(account: StoredAccount, clientId: string, clientSecret: string): Promise<CharacterProfile> {
  if (!account.refreshToken) return account.profile
  try {
    const tokens = await tokenRequest(
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: account.refreshToken,
        client_id: clientId
      }),
      clientId,
      clientSecret
    )
    const claims = await verifyAccessToken(tokens.access_token, clientId)
    const profile = await buildProfile(tokens.access_token, claims)
    account.refreshToken = tokens.refresh_token ?? account.refreshToken
    account.profile = profile
    const until = Date.now() + Math.max(15_000, (tokens.expires_in || 1200) * 1000 - 30_000)
    accessTokenCache.set(account.characterId, { token: tokens.access_token, until })
    return profile
  } catch {
    return account.profile
  }
}

const accessTokenCache = new Map<number, { token: string; until: number }>()

async function accessToken(characterId: number): Promise<string> {
  const cached = accessTokenCache.get(characterId)
  if (cached && cached.until > Date.now()) return cached.token
  const store = readStore()
  const account = store.accounts.find((item) => item.characterId === characterId)
  if (!account?.refreshToken || !store.clientId.trim()) throw new Error('No hay un personaje conectado.')
  const tokens = await tokenRequest(
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: account.refreshToken,
      client_id: store.clientId.trim()
    }),
    store.clientId.trim(),
    store.clientSecret.trim()
  )
  if (tokens.refresh_token) {
    account.refreshToken = tokens.refresh_token
    writeStore(store)
  }
  const until = Date.now() + Math.max(15_000, (tokens.expires_in || 1200) * 1000 - 30_000)
  accessTokenCache.set(characterId, { token: tokens.access_token, until })
  return tokens.access_token
}

function placeLabel(place: string, system: string): string {
  if (!system || place.toLowerCase().includes(system.toLowerCase())) return place
  return `${place} · ${system}`
}

function matchesMarketType(name: string, text: string): boolean {
  const lower = name.toLowerCase()
  if (lower === text || lower.startsWith(text)) return true
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`, 'i').test(name)
}

export function searchMarketTypes(query: string): MarketTypeHit[] {
  const text = query.trim().toLowerCase()
  if (text.length < 3) return []
  return marketTypes
    .filter((type) => matchesMarketType(type.name, text))
    .sort((a, b) => {
      const rank = (name: string) => {
        const lower = name.toLowerCase()
        if (lower === text) return 0
        if (lower.startsWith(text)) return 1
        return 2
      }
      return rank(a.name) - rank(b.name) || a.name.localeCompare(b.name, 'es')
    })
    .slice(0, 12)
}

async function solarRegion(constellationId: number): Promise<{ id: number; name: string } | null> {
  try {
    const constellation = await esi<{ region_id: number }>(`/universe/constellations/${constellationId}/`)
    const region = await esi<{ name: string }>(`/universe/regions/${constellation.region_id}/`)
    return { id: constellation.region_id, name: region.name }
  } catch {
    return null
  }
}

export async function characterMarketRegion(characterId: number): Promise<MarketTypeHit | null> {
  try {
    const token = await accessToken(characterId)
    const location = await optionalEsi<{ solar_system_id: number }>(`/characters/${characterId}/location/`, token)
    if (!location?.solar_system_id) return null
    const system = await esi<{ constellation_id: number }>(`/universe/systems/${location.solar_system_id}/`)
    const region = await solarRegion(system.constellation_id)
    return region ? { id: region.id, name: region.name } : null
  } catch {
    return null
  }
}

let kSpaceRegionsTask: Promise<number[]> | null = null

function kSpaceRegions(): Promise<number[]> {
  kSpaceRegionsTask ??= esi<number[]>('/universe/regions/')
    .then((ids) => ids.filter((id) => id < 11000000))
    .catch((error: unknown) => {
      kSpaceRegionsTask = null
      throw error
    })
  return kSpaceRegionsTask
}

const PLEX_TYPE_ID = 44992
const PLEX_REGION_ID = 19000001

type RawMarketOrder = {
  price: number
  volume_remain: number
  location_id: number
  system_id: number
  range: string
  issued: string
  duration: number
  is_buy_order?: boolean
}

function cacheUntil(expiresHeader: string | null, fallbackMs = 45_000): number {
  const parsed = expiresHeader ? Date.parse(expiresHeader) : Number.NaN
  const target = Number.isFinite(parsed) ? parsed : Date.now() + fallbackMs
  return Math.min(Date.now() + 5 * 60_000, Math.max(Date.now() + 20_000, target))
}

async function regionOrderPage(regionId: number, typeId: number, page: number): Promise<{ rows: RawMarketOrder[]; pages: number; expires: string | null } | null> {
  const response = await fetch(
    `https://esi.evetech.net/latest/markets/${regionId}/orders/?order_type=all&type_id=${typeId}&page=${page}`,
    { headers: { Accept: 'application/json', 'User-Agent': 'capsuleerOS/0.1' } }
  )
  if (!response.ok) return null
  return {
    rows: (await response.json()) as RawMarketOrder[],
    pages: Number(response.headers.get('x-pages') ?? '1') || 1,
    expires: response.headers.get('expires')
  }
}

type RegionOrderBook = { rows: RawMarketOrder[]; truncated: boolean; until: number }

const regionOrderCache = new Map<string, RegionOrderBook>()
const regionOrderInflight = new Map<string, Promise<RegionOrderBook>>()

async function regionOrders(regionId: number, typeId: number): Promise<RegionOrderBook> {
  const key = `${regionId}:${typeId}`
  const cached = regionOrderCache.get(key)
  if (cached && cached.until > Date.now()) return cached
  const pending = regionOrderInflight.get(key)
  if (pending) return pending
  const task = (async () => {
    const first = await regionOrderPage(regionId, typeId, 1)
    if (!first) return { rows: [] as RawMarketOrder[], truncated: false, until: Date.now() + 15_000 }
    const pageCount = Math.min(first.pages, 20)
    const rest =
      pageCount > 1
        ? await mapPool(
            Array.from({ length: pageCount - 1 }, (_, index) => index + 2),
            6,
            (page) => regionOrderPage(regionId, typeId, page)
          )
        : []
    const book = {
      rows: [first.rows, ...rest.filter((page) => page != null).map((page) => page.rows)].flat(),
      truncated: first.pages > 20,
      until: cacheUntil(first.expires)
    }
    regionOrderCache.set(key, book)
    return book
  })().finally(() => regionOrderInflight.delete(key))
  regionOrderInflight.set(key, task)
  return task
}

async function regionHistory(regionId: number, typeId: number): Promise<MarketDay[]> {
  const rows = await esi<{ average: number; date: string; highest: number; lowest: number; volume: number; order_count: number }[]>(
    `/markets/${regionId}/history/?type_id=${typeId}`
  ).catch(() => [])
  return rows.map((row) => ({
    date: row.date,
    average: row.average,
    highest: row.highest,
    lowest: row.lowest,
    volume: row.volume,
    orders: row.order_count
  }))
}

function mergeHistory(days: MarketDay[]): MarketDay[] {
  const byDate = new Map<string, { volume: number; orders: number; low: number; high: number; weight: number; weighted: number }>()
  for (const day of days) {
    const weight = day.volume > 0 ? day.volume : 1
    const current = byDate.get(day.date)
    if (!current) {
      byDate.set(day.date, {
        volume: day.volume,
        orders: day.orders,
        low: day.lowest,
        high: day.highest,
        weight,
        weighted: day.average * weight
      })
      continue
    }
    current.volume += day.volume
    current.orders += day.orders
    current.low = Math.min(current.low, day.lowest)
    current.high = Math.max(current.high, day.highest)
    current.weight += weight
    current.weighted += day.average * weight
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, row]) => ({
      date,
      average: row.weight > 0 ? row.weighted / row.weight : row.low,
      highest: row.high,
      lowest: row.low,
      volume: row.volume,
      orders: row.orders
    }))
}

type StructureInfo = { name: string; systemId: number; regionId: number }

const structureInfoCache = new Map<number, StructureInfo | null>()
const systemRegionCache = new Map<number, number>()
const characterStructureCache = new Map<number, { at: number; ids: number[] }>()

async function regionOfSystem(systemId: number): Promise<number | null> {
  const cached = systemRegionCache.get(systemId)
  if (cached) return cached
  try {
    const system = await esi<{ constellation_id: number }>(`/universe/systems/${systemId}/`)
    const constellation = await esi<{ region_id: number }>(`/universe/constellations/${system.constellation_id}/`)
    systemRegionCache.set(systemId, constellation.region_id)
    return constellation.region_id
  } catch {
    return null
  }
}

async function describeStructure(id: number, token: string): Promise<StructureInfo | null> {
  if (structureInfoCache.has(id)) return structureInfoCache.get(id) ?? null
  const row = await optionalEsi<{ name?: string; solar_system_id?: number }>(`/universe/structures/${id}/`, token)
  if (!row?.solar_system_id) {
    structureInfoCache.set(id, null)
    return null
  }
  const regionId = await regionOfSystem(row.solar_system_id)
  if (!regionId) {
    structureInfoCache.set(id, null)
    return null
  }
  const info = { name: row.name?.trim() || 'Estructura', systemId: row.solar_system_id, regionId }
  structureInfoCache.set(id, info)
  return info
}

async function characterStructureIds(characterId: number, token: string): Promise<number[]> {
  const cached = characterStructureCache.get(characterId)
  if (cached && Date.now() - cached.at < 5 * 60_000) return cached.ids
  const ids = new Set<number>()
  const location = await optionalEsi<{ structure_id?: number }>(`/characters/${characterId}/location/`, token)
  if (location?.structure_id) ids.add(location.structure_id)
  const clones = await optionalEsi<{
    home_location?: { location_id: number; location_type: string }
    jump_clones?: { location_id: number; location_type: string }[]
  }>(`/characters/${characterId}/clones/`, token)
  if (clones?.home_location?.location_type === 'structure') ids.add(clones.home_location.location_id)
  for (const clone of clones?.jump_clones ?? []) {
    if (clone.location_type === 'structure') ids.add(clone.location_id)
  }
  const assets = await characterAssets(characterId, token)
  for (const asset of assets ?? []) {
    if (asset.location_id >= 1_000_000_000) ids.add(asset.location_id)
  }
  const list = [...ids]
  characterStructureCache.set(characterId, { at: Date.now(), ids: list })
  return list
}

type StructureBook = { until: number; orders: Array<RawMarketOrder & { type_id: number }>; truncated: boolean; denied: boolean }

const structureBookCache = new Map<number, StructureBook>()
const structureBookInflight = new Map<number, Promise<StructureBook>>()

async function structureBook(structureId: number, systemId: number, token: string): Promise<StructureBook> {
  const cached = structureBookCache.get(structureId)
  if (cached && cached.until > Date.now()) return cached
  const pending = structureBookInflight.get(structureId)
  if (pending) return pending
  const task = (async (): Promise<StructureBook> => {
    const loadPage = async (page: number) => {
      const response = await fetch(`https://esi.evetech.net/latest/markets/structures/${structureId}/?page=${page}`, {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
          'User-Agent': 'capsuleerOS/0.1'
        }
      })
      if (response.status === 401) return { denied: true, rows: [], pages: 1, expires: null as string | null }
      if (!response.ok) return { denied: false, rows: [], pages: 1, expires: null as string | null }
      return {
        denied: false,
        rows: (await response.json()) as {
          type_id: number
          price: number
          volume_remain: number
          location_id: number
          range: string
          issued: string
          duration: number
          is_buy_order?: boolean
        }[],
        pages: Number(response.headers.get('x-pages') ?? '1') || 1,
        expires: response.headers.get('expires')
      }
    }
    const first = await loadPage(1)
    if (first.denied) return { until: Date.now() + 20_000, orders: [], truncated: false, denied: true }
    const pageCount = Math.min(first.pages, 20)
    const rest =
      pageCount > 1
        ? await mapPool(
            Array.from({ length: pageCount - 1 }, (_, index) => index + 2),
            6,
            (page) => loadPage(page).catch(() => ({ denied: false, rows: [], pages: 1, expires: null as string | null }))
          )
        : []
    const orders = [first, ...rest].flatMap((page) => page.rows).map((row) => ({
      type_id: row.type_id,
      price: row.price,
      volume_remain: row.volume_remain,
      location_id: row.location_id || structureId,
      system_id: systemId,
      range: row.range,
      issued: row.issued,
      duration: row.duration,
      is_buy_order: row.is_buy_order
    }))
    return { until: cacheUntil(first.expires, 3 * 60_000), orders, truncated: first.pages > 20, denied: false }
  })().then((book) => {
    structureBookCache.set(structureId, book)
    return book
  }).finally(() => structureBookInflight.delete(structureId))
  structureBookInflight.set(structureId, task)
  return task
}

async function accessibleStructureOrders(
  characterId: number,
  regionId: number,
  typeId: number,
  token: string
): Promise<{ rows: RawMarketOrder[]; names: Map<number, string>; truncated: boolean; notice: string }> {
  const ids = await characterStructureIds(characterId, token)
  const located = (
    await mapPool(ids, 6, async (id) => {
      const info = await describeStructure(id, token)
      return info ? { id, info } : null
    })
  ).filter((row): row is { id: number; info: StructureInfo } => row != null)
  const matched = located.filter((row) => (regionId === 0 ? row.info.regionId < 11_000_000 : row.info.regionId === regionId))
  const chosen = matched.slice(0, 12)
  const names = new Map(chosen.map((row) => [row.id, row.info.name]))
  const books = await mapPool(chosen, 4, (row) =>
    structureBook(row.id, row.info.systemId, token).catch(() => ({
      until: 0,
      orders: [] as StructureBook['orders'],
      truncated: false,
      denied: false
    }))
  )
  return {
    rows: books.flatMap((book) => book.orders.filter((order) => order.type_id === typeId)),
    names,
    truncated: matched.length > chosen.length || books.some((book) => book.truncated),
    notice: books.some((book) => book.denied)
      ? 'Para ver citadelas hay que conectar de nuevo y aceptar el permiso de mercados de estructuras.'
      : ''
  }
}

export async function itemMarket(characterId: number, regionId: number, typeId: number): Promise<MarketBook> {
  const regionTask = (async () => {
    const targets = typeId === PLEX_TYPE_ID ? [PLEX_REGION_ID] : regionId === 0 ? await kSpaceRegions() : [regionId]
    return mapPool(targets, 24, (id) => regionOrders(id, typeId).catch(() => ({ rows: [], truncated: false, until: 0 })))
  })()
  const structureTask = (async () => {
    if (typeId === PLEX_TYPE_ID) return { rows: [] as RawMarketOrder[], names: new Map<number, string>(), truncated: false, notice: '' }
    try {
      const token = await accessToken(characterId)
      return await accessibleStructureOrders(characterId, regionId, typeId, token)
    } catch {
      return { rows: [] as RawMarketOrder[], names: new Map<number, string>(), truncated: false, notice: '' }
    }
  })()
  const [batches, structureResult] = await Promise.all([regionTask, structureTask])
  const structureRows = structureResult.rows
  const structureNames = structureResult.names
  const structureTruncated = structureResult.truncated
  const structureNotice = structureResult.notice
  const rows = [...batches.flatMap((batch) => batch.rows), ...structureRows]
  const truncated = structureTruncated || batches.some((batch) => batch.truncated)
  const ranked = (buy: boolean) =>
    rows
      .filter((row) => (row.is_buy_order === true) === buy)
      .sort((a, b) => (buy ? b.price - a.price : a.price - b.price) || b.volume_remain - a.volume_remain)
  const sells = ranked(false)
  const buys = ranked(true)
  const shownSells = sells.slice(0, 80)
  const shownBuys = buys.slice(0, 80)
  const shown = [...shownSells, ...shownBuys]
  const stationIds = shown.map((row) => row.location_id).filter((id) => id < 1_000_000_000)
  const structureIds = [...new Set(shown.map((row) => row.location_id).filter((id) => id >= 1_000_000_000))]
  const names = await namesOf([...stationIds, ...shown.map((row) => row.system_id)])
  const structures = new Map<number, string>(structureNames)
  const token = structureIds.some((id) => !structures.has(id)) ? await accessToken(characterId).catch(() => '') : ''
  await mapPool(
    structureIds.filter((id) => !structures.has(id)),
    6,
    async (id) => {
      const row = token ? await optionalEsi<{ name: string }>(`/universe/structures/${id}/`, token) : null
      if (row?.name) structures.set(id, row.name)
      return null
    }
  )
  const toOrder = (row: RawMarketOrder): MarketBookOrder => {
    const system = names.get(row.system_id) ?? ''
    const place =
      row.location_id >= 1_000_000_000
        ? (structures.get(row.location_id) ?? 'Estructura')
        : (names.get(row.location_id) ?? 'Estación')
    return {
      price: row.price,
      volume: row.volume_remain,
      location: placeLabel(place, system),
      range: orderRange(row.range),
      expires: orderExpiry(row.issued, row.duration)
    }
  }
  return {
    sells: shownSells.map(toOrder),
    buys: shownBuys.map(toOrder),
    sellCount: sells.length,
    buyCount: buys.length,
    truncated,
    structureNotice
  }
}

export async function itemHistory(regionId: number, typeId: number): Promise<MarketDay[]> {
  if (typeId === PLEX_TYPE_ID) {
    const days = await regionHistory(PLEX_REGION_ID, typeId)
    return days.sort((a, b) => a.date.localeCompare(b.date))
  }
  if (regionId !== 0) {
    const days = await regionHistory(regionId, typeId)
    return days.sort((a, b) => a.date.localeCompare(b.date))
  }
  const ids = await kSpaceRegions()
  const books = await mapPool(ids, 24, (id) => regionHistory(id, typeId))
  return mergeHistory(books.flat())
}

export async function addCharacter(): Promise<CharacterProfile> {
  const store = readStore()
  if (!store.clientId.trim()) throw new Error('Falta el Client ID de la aplicación de EVE.')
  return login(store.clientId.trim(), store.clientSecret.trim())
}

export function hasStoredCharacters(): boolean {
  return readStore().accounts.length > 0
}

export function cachedCharacters(): CharacterProfile[] {
  return readStore().accounts.map((account) => account.profile)
}

export async function listCharacters(): Promise<CharacterProfile[]> {
  const store = readStore()
  if (!store.clientId.trim() || store.accounts.length === 0) return store.accounts.map((account) => account.profile)
  const clientId = store.clientId.trim()
  const clientSecret = store.clientSecret.trim()
  const profiles = await mapPool(store.accounts, 3, (account) => refreshAccount(account, clientId, clientSecret))
  writeStore(store)
  return profiles
}

export function removeCharacter(id: string): void {
  const store = readStore()
  store.accounts = store.accounts.filter((account) => account.profile.id !== id)
  writeStore(store)
}

export function reorderCharacters(ids: string[]): void {
  const store = readStore()
  const rank = new Map(ids.map((id, index) => [id, index]))
  store.accounts.sort((a, b) => (rank.get(a.profile.id) ?? ids.length) - (rank.get(b.profile.id) ?? ids.length))
  writeStore(store)
}

export function publicSettings(): { clientId: string; hasSecret: boolean; redirectUri: string; scopes: string[] } {
  const store = readStore()
  return {
    clientId: store.clientId,
    hasSecret: store.clientSecret.length > 0,
    redirectUri: REDIRECT_URI,
    scopes: [...EVE_SCOPES]
  }
}

export function saveSettings(input: { clientId: string; clientSecret?: string }): ReturnType<typeof publicSettings> {
  const store = readStore()
  store.clientId = input.clientId.trim()
  if (input.clientSecret?.trim()) store.clientSecret = input.clientSecret.trim()
  writeStore(store)
  return publicSettings()
}

export type SkillRequirement = { typeId: number; name: string; level: number }
export type SkillDescriptionInfo = { description: string; requirements: SkillRequirement[] }

const skillDescriptionCache = new Map<number, SkillDescriptionInfo>()

/** Pares dogma: skill type id + nivel mínimo (hasta 6 requisitos). */
const SKILL_REQ_ATTRS: Array<{ skill: number; level: number }> = [
  { skill: 182, level: 277 },
  { skill: 183, level: 278 },
  { skill: 184, level: 279 },
  { skill: 1285, level: 1286 },
  { skill: 1289, level: 1287 },
  { skill: 1290, level: 1288 }
]

function cleanSkillDescription(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function parseSkillRequirements(
  attrs: Array<{ attribute_id: number; value: number }> | undefined
): Array<{ typeId: number; level: number }> {
  if (!attrs?.length) return []
  const byId = new Map(attrs.map((row) => [row.attribute_id, row.value]))
  const out: Array<{ typeId: number; level: number }> = []
  for (const pair of SKILL_REQ_ATTRS) {
    const typeId = Math.round(byId.get(pair.skill) ?? 0)
    const level = Math.round(byId.get(pair.level) ?? 0)
    if (typeId > 0 && level > 0) out.push({ typeId, level: Math.min(5, Math.max(1, level)) })
  }
  return out
}

export async function skillDescription(typeId: number): Promise<SkillDescriptionInfo> {
  const empty: SkillDescriptionInfo = { description: '', requirements: [] }
  if (!Number.isInteger(typeId) || typeId <= 0) return empty
  const cached = skillDescriptionCache.get(typeId)
  if (cached != null) return cached
  try {
    const row = await esi<{
      description?: string
      dogma_attributes?: Array<{ attribute_id: number; value: number }>
    }>(`/universe/types/${typeId}/?language=es`)
    const description = cleanSkillDescription(row.description ?? '')
    const rawReqs = parseSkillRequirements(row.dogma_attributes)
    const names = rawReqs.length > 0 ? await namesOf(rawReqs.map((r) => r.typeId)) : new Map<number, string>()
    const requirements: SkillRequirement[] = rawReqs.map((req) => ({
      typeId: req.typeId,
      name: names.get(req.typeId) ?? `Habilidad ${req.typeId}`,
      level: req.level
    }))
    const info = { description, requirements }
    skillDescriptionCache.set(typeId, info)
    return info
  } catch {
    skillDescriptionCache.set(typeId, empty)
    return empty
  }
}
