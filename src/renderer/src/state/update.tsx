import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { UpdateState } from '../../../shared/update'

type UpdateContextValue = {
  state: UpdateState
  version: string
  check: () => void
  install: () => void
}

const UpdateContext = createContext<UpdateContextValue | null>(null)

export function UpdateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<UpdateState>({ phase: 'idle' })
  const [version, setVersion] = useState('')

  useEffect(() => {
    if (!window.os?.onUpdate || !window.os.updateState || !window.os.appVersion) {
      setState({ phase: 'unsupported' })
      return
    }
    let active = true
    void window.os.appVersion().then((value) => {
      if (active) setVersion(value)
    })
    void window.os.updateState().then((value) => {
      if (active) setState(value)
    })
    const stop = window.os.onUpdate((value) => setState(value))
    return () => {
      active = false
      stop()
    }
  }, [])

  const value = useMemo<UpdateContextValue>(
    () => ({
      state,
      version,
      check: () => {
        void window.os?.checkUpdate()
      },
      install: () => {
        void window.os?.installUpdate()
      }
    }),
    [state, version]
  )

  return <UpdateContext.Provider value={value}>{children}</UpdateContext.Provider>
}

export function useUpdate(): UpdateContextValue {
  const value = useContext(UpdateContext)
  if (!value) throw new Error('useUpdate debe usarse dentro de UpdateProvider')
  return value
}
