const headers = { Accept: 'application/json', 'User-Agent': 'capsuleerOS/0.1' }

async function get(path) {
  const response = await fetch(`https://esi.evetech.net/latest${path}`, { headers })
  if (!response.ok) throw new Error(`${path} ${response.status}`)
  return response.json()
}

async function pool(items, size, run) {
  const results = new Array(items.length)
  let cursor = 0
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor
        cursor += 1
        results[index] = await run(items[index])
      }
    })
  )
  return results
}

const categories = await get('/universe/categories/')
const categoryDocs = await pool(categories, 8, (id) => get(`/universe/categories/${id}/`))
const groupIds = categoryDocs.flatMap((category) => category.groups ?? [])
const typeIds = [
  ...new Set(
    (
      await pool(groupIds, 12, async (id) => {
        try {
          const group = await get(`/universe/groups/${id}/`)
          return group.published ? group.types ?? [] : []
        } catch {
          return []
        }
      })
    ).flat()
  )
]

const names = new Map()
async function loadNames(chunk) {
  if (chunk.length === 0) return
  const response = await fetch('https://esi.evetech.net/latest/universe/names/', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(chunk)
  })
  if (!response.ok) {
    if (chunk.length === 1) return
    const mid = Math.ceil(chunk.length / 2)
    await loadNames(chunk.slice(0, mid))
    await loadNames(chunk.slice(mid))
    return
  }
  for (const row of await response.json()) names.set(row.id, row.name)
}

for (let index = 0; index < typeIds.length; index += 500) await loadNames(typeIds.slice(index, index + 500))

const types = [...names.entries()]
  .map(([id, name]) => ({ id, name }))
  .sort((a, b) => a.name.localeCompare(b.name, 'en'))

await import('node:fs').then(({ writeFileSync }) =>
  writeFileSync(new URL('../src/shared/market-types.json', import.meta.url), JSON.stringify(types))
)
console.log(`types ${types.length}`)
