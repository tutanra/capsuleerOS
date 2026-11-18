import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { CharacterProfile } from '../types'

/** Vuelta a ESI de todos los personajes. No muestra el estado de carga del arranque. */
const CHARACTER_REFRESH_MS = 15 * 60 * 1000

type CharacterContextValue = {
  profiles: CharacterProfile[]
  profile: CharacterProfile | null
  select: (id: string) => void
  add: () => Promise<void>
  remove: (id: string) => Promise<void>
  reorder: (ids: string[]) => void
  adding: boolean
  setAdding: (open: boolean) => void
  loadingCharacters: boolean
  charactersReady: boolean
  refreshing: boolean
  refreshNow: () => void
}

const CharacterContext = createContext<CharacterContextValue | null>(null)

export function CharacterProvider({ children }: { children: ReactNode }) {
  const [profiles, setProfiles] = useState<CharacterProfile[]>([])
  const [id, setId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [loadingCharacters, setLoadingCharacters] = useState(false)
  const [charactersReady, setCharactersReady] = useState(false)
  const [refreshing, setRefreshing] = useState(() => Boolean(window.os?.listCharacters))
  const profile = profiles.find((item) => item.id === id) ?? null
  const editEpoch = useRef(0)
  const refreshNowRef = useRef<() => void>(() => {})

  useEffect(() => {
    let active = true
    let inFlight = false
    let timer = 0
    if (!window.os?.listCharacters) {
      setRefreshing(false)
      setCharactersReady(true)
      return
    }

    function armTimer(): void {
      window.clearInterval(timer)
      timer = window.setInterval(() => {
        void refresh(false)
      }, CHARACTER_REFRESH_MS)
    }

    async function refresh(initial: boolean): Promise<void> {
      if (inFlight) return
      inFlight = true
      setRefreshing(true)
      const ticket = editEpoch.current
      try {
        if (initial) {
          const cached = window.os?.cachedCharacters ? await window.os.cachedCharacters().catch(() => []) : []
          if (!active) return
          if (cached.length > 0) {
            setProfiles(cached)
            setId((current) => (current && cached.some((item) => item.id === current) ? current : cached[0]!.id))
            setCharactersReady(true)
          } else {
            setLoadingCharacters(true)
          }
        }
        const list = await window.os!.listCharacters()
        if (!active || ticket !== editEpoch.current) return
        setProfiles(list)
        setId((current) => (current && list.some((item) => item.id === current) ? current : (list[0]?.id ?? null)))
      } catch {
        if (!active) return
      } finally {
        inFlight = false
        if (active) setRefreshing(false)
        if (!active || !initial) return
        setLoadingCharacters(false)
        setCharactersReady(true)
      }
    }

    refreshNowRef.current = () => {
      if (!active || inFlight) return
      armTimer()
      void refresh(false)
    }

    void refresh(true)
    armTimer()
    return () => {
      active = false
      window.clearInterval(timer)
      refreshNowRef.current = () => {}
    }
  }, [])

  const refreshNow = useCallback(() => {
    refreshNowRef.current()
  }, [])

  const value = useMemo<CharacterContextValue>(
    () => ({
      profiles,
      profile,
      select: setId,
      adding,
      setAdding,
      loadingCharacters,
      charactersReady,
      refreshing,
      refreshNow,
      add: async () => {
        if (!window.os?.addCharacter) throw new Error('Añadir personajes solo está disponible en la aplicación de escritorio.')
        editEpoch.current += 1
        const created = await window.os.addCharacter()
        editEpoch.current += 1
        setProfiles((current) => [created, ...current.filter((item) => item.id !== created.id)])
        setId(created.id)
      },
      remove: async (characterId: string) => {
        editEpoch.current += 1
        await window.os?.removeCharacter(characterId)
        editEpoch.current += 1
        setProfiles((current) => {
          const next = current.filter((item) => item.id !== characterId)
          setId((selected) => (selected === characterId ? (next[0]?.id ?? null) : selected))
          return next
        })
      },
      reorder: (ids: string[]) => {
        const rank = new Map(ids.map((itemId, index) => [itemId, index]))
        setProfiles((current) => [...current].sort((a, b) => (rank.get(a.id) ?? ids.length) - (rank.get(b.id) ?? ids.length)))
        void window.os?.reorderCharacters(ids)
      }
    }),
    [profiles, profile, adding, loadingCharacters, charactersReady, refreshing, refreshNow]
  )

  return <CharacterContext.Provider value={value}>{children}</CharacterContext.Provider>
}

export function useCharacter(): CharacterContextValue {
  const value = useContext(CharacterContext)
  if (!value) throw new Error('useCharacter debe usarse dentro de CharacterProvider')
  return value
}
