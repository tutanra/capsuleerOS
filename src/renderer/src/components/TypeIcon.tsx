import { useEffect, useState } from 'react'

type Variant = 'icon' | 'render' | 'bp' | 'bpc' | 'off'

function firstVariant(name: string | undefined, copy: boolean): Variant {
  if (copy) return 'bpc'
  if (name?.toLowerCase().includes('blueprint')) return 'bp'
  return 'icon'
}

function nextVariant(current: Variant): Variant {
  if (current === 'bpc' || current === 'icon') return 'render'
  if (current === 'render') return 'bp'
  return 'off'
}

export function TypeIcon({
  typeId,
  name,
  copy = false,
  size
}: {
  typeId: number
  name?: string
  copy?: boolean
  size: number
}) {
  const [variant, setVariant] = useState<Variant>(() => firstVariant(name, copy))

  useEffect(() => {
    setVariant(firstVariant(name, copy))
  }, [typeId, name, copy])

  if (variant === 'off') return null

  return (
    <img
      className={size <= 24 ? 'type-icon sm' : 'type-icon'}
      src={`https://images.evetech.net/types/${typeId}/${variant}?size=32`}
      alt=""
      width={size}
      height={size}
      onError={() => {
        setVariant((current) => nextVariant(current))
      }}
    />
  )
}
