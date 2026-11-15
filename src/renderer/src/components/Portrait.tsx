import { useState } from 'react'

function characterId(profileId: string): string | null {
  const id = profileId.startsWith('eve-') ? profileId.slice(4) : ''
  return /^\d+$/.test(id) ? id : null
}

function initials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
}

export function Portrait({ profileId, name, small }: { profileId: string; name: string; small?: boolean }) {
  const id = characterId(profileId)
  const [failed, setFailed] = useState(false)
  const size = small ? 64 : 128
  return (
    <span className={small ? 'portrait sm' : 'portrait'} aria-hidden="true">
      {id && !failed ? (
        <img
          src={`https://images.evetech.net/characters/${id}/portrait?size=${size}`}
          alt=""
          width={size}
          height={size}
          onError={() => setFailed(true)}
        />
      ) : (
        initials(name)
      )}
    </span>
  )
}
