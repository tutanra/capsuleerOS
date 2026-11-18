export type ModuleId = 'overview' | 'skills' | 'market' | 'inventory' | 'wallet' | 'prices' | 'wiki' | 'settings'

export type ModuleMeta = {
  title: string
  blurb: string
}

export const MODULES: Record<ModuleId, ModuleMeta> = {
  overview: { title: 'Resumen', blurb: 'Identidad, nave y accesos' },
  skills: { title: 'Habilidades', blurb: 'Niveles, SP y cola de entrenamiento' },
  inventory: { title: 'Inventario', blurb: 'Activos por ubicación' },
  market: { title: 'Mercado', blurb: 'Órdenes de compra y venta' },
  wallet: { title: 'Monedero', blurb: 'Saldo y diario' },
  prices: { title: 'Market', blurb: 'Dónde está más barato un objeto' },
  wiki: { title: 'UniWiki', blurb: 'Anomalías y exploración' },
  settings: { title: 'Ajustes', blurb: 'Preferencias de la interfaz' }
}

export const NEOCOM: ModuleId[] = ['overview', 'skills', 'inventory', 'market', 'wallet']

export const UTILITIES: ModuleId[] = ['prices', 'wiki']

export const SYSTEM: ModuleId[] = ['settings']

export const MARKET_REGIONS = [
  { id: 10000002, name: 'The Forge' },
  { id: 10000043, name: 'Domain' },
  { id: 10000032, name: 'Sinq Laison' },
  { id: 10000030, name: 'Heimatar' },
  { id: 10000042, name: 'Metropolis' },
  { id: 10000064, name: 'Essence' }
] as const

export type MarketTypeHit = {
  id: number
  name: string
}

export type MarketBookOrder = {
  price: number
  volume: number
  location: string
  range: string
  expires: string
}

export type MarketDay = {
  date: string
  average: number
  highest: number
  lowest: number
  volume: number
  orders: number
}

export type MarketBook = {
  sells: MarketBookOrder[]
  buys: MarketBookOrder[]
  sellCount: number
  buyCount: number
  truncated: boolean
  structureNotice: string
}

export type Character = {
  name: string
  corp: string
  alliance: string
  system: string
  regionId: number
  region: string
  security: number
  station: string
  ship: string
  skillpoints: number
  wallet: number
  clone: string
}

export type Skill = {
  typeId?: number
  name: string
  rank: number | null
  level: number
  sp: number
  nextSp: number | null
  group?: string
  /** Hay que comprar el libro de habilidad */
  buy?: boolean
}

export type SkillGroup = {
  name: string
  skills: Skill[]
}

export type TrainingJob = {
  typeId?: number
  name: string
  from: number
  to: number
  progress: number
  remaining: string
  remainingSp: number
  finishAt: string | null
  /** Inicio del entrenamiento de este nivel, si está en curso. */
  startAt?: string | null
  levelStartSp?: number
  levelEndSp?: number
  trainingStartSp?: number
}

export type CharacterOrder = {
  id: string
  typeId: number
  name: string
  price: number
  remain: number
  total: number
  location: string
  range: string
  issued: string
  expires: string
  buy: boolean
  corporation: boolean
}

export type Asset = {
  id: string
  name: string
  qty: number
  volume: number
  value: number
  typeId: number
  ship: boolean
  copy?: boolean
  contents: Asset[]
}

export type AssetLocation = {
  id: string
  name: string
  detail: string
  assets: Asset[]
}

export type JournalRow = {
  when: string
  ref: string
  party: string
  amount: number
  balance: number
}

/** Acelerador cerebral activo (ESI no da inicio/fin). */
export type ActiveAccelerator = {
  name: string
  bonus: number
}

export type CharacterProfile = {
  id: string
  color: string
  source?: 'demo' | 'esi'
  notice?: string
  character: Character
  skillGroups: SkillGroup[]
  unownedSkills: Skill[]
  trainingQueue: TrainingJob[]
  queueSummary: string
  /** Acelerador cerebral activo, si se puede detectar. */
  accelerator?: ActiveAccelerator | null
  /** Varias colas activas en la app (multipilot aparente; ESI no da caducidad). */
  multipilot?: { activeQueues: number } | null
  locations: AssetLocation[]
  journal: JournalRow[]
  orders: CharacterOrder[]
}
