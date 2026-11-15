import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { CharacterProfile } from '../types'

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

  useEffect(() => {
    let active = true
    if (!window.os?.listCharacters) {
      setCharactersReady(true)
      return
    }
    void (async () => {
      const cached = window.os?.cachedCharacters ? await window.os.cachedCharacters().catch(() => []) : []
      if (!active) return
      if (cached.length > 0) {
        setProfiles(cached)
        setId((current) => (current && cached.some((item) => item.id === current) ? current : cached[0]!.id))
        setCharactersReady(true)
      } else {
        setLoadingCharacters(true)
      }
      try {
        const list = await window.os!.listCharacters()
        if (!active) return
        setProfiles(list)
        setId((current) => (current && list.some((item) => item.id === current) ? current : (list[0]?.id ?? null)))
      } catch {
        if (!active) return
      } finally {
        if (!active) return
        setLoadingCharacters(false)
        setCharactersReady(true)
      }
    })()
    return () => {
      active = false
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
        const created = await window.os.addCharacter()
        setProfiles((current) => [created, ...current.filter((item) => item.id !== created.id)])
        setId(created.id)
      },
      remove: async (characterId: string) => {
        await window.os?.removeCharacter(characterId)
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
