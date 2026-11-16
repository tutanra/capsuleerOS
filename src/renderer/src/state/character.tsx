import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
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
}

const CharacterContext = createContext<CharacterContextValue | null>(null)

export function CharacterProvider({ children }: { children: ReactNode }) {
  const [profiles, setProfiles] = useState<CharacterProfile[]>([])
  const [id, setId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [loadingCharacters, setLoadingCharacters] = useState(false)
  const [charactersReady, setCharactersReady] = useState(false)
  const profile = profiles.find((item) => item.id === id) ?? null
  const editEpoch = useRef(0)

  useEffect(() => {
    let active = true
    let refreshing = false
    if (!window.os?.listCharacters) {
      setCharactersReady(true)
      return
    }

    async function refresh(initial: boolean): Promise<void> {
      if (refreshing) return
      refreshing = true
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
        refreshing = false
        if (!active || !initial) return
        setLoadingCharacters(false)
        setCharactersReady(true)
      }
    }

    void refresh(true)
    const timer = window.setInterval(() => {
      void refresh(false)
    }, CHARACTER_REFRESH_MS)
    return () => {
      active = false
      window.clearInterval(timer)
    }
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
    [profiles, profile, adding, loadingCharacters, charactersReady]
  )

  return <CharacterContext.Provider value={value}>{children}</CharacterContext.Provider>
}

export function useCharacter(): CharacterContextValue {
  const value = useContext(CharacterContext)
  if (!value) throw new Error('useCharacter debe usarse dentro de CharacterProvider')
  return value
}
