import { memo, useMemo, useState } from 'react'
import { TypeIcon } from '../components/TypeIcon'
import { formatIsk, formatNum } from '../lib/format'
import { useCharacter } from '../state/character'
import type { Asset } from '../types'

function formatVolume(value: number): string {
  if (value <= 0) return formatNum(0)
  if (value < 1) return formatNum(value, 2)
  return formatNum(value, Number.isInteger(value) ? 0 : 1)
}

function treeValue(asset: Asset): number {
  return asset.value + asset.contents.reduce((sum, child) => sum + treeValue(child), 0)
}

function countAssets(assets: Asset[]): number {
  return assets.reduce((sum, asset) => sum + 1 + countAssets(asset.contents), 0)
}

function filterAssets(assets: Asset[], needle: string): Asset[] {
  if (!needle) return assets
  const visible: Asset[] = []
  for (const asset of assets) {
    const contents = filterAssets(asset.contents, needle)
    if (asset.name.toLowerCase().includes(needle)) visible.push(asset)
    else if (contents.length > 0) visible.push({ ...asset, contents })
  }
  return visible
}

function AssetBranch({ asset, depth, forceOpen }: { asset: Asset; depth: number; forceOpen: boolean }) {
  const [open, setOpen] = useState(false)
  const contents = asset.contents ?? []
  const expanded = forceOpen || open
  return (
    <>
      <tr>
        <td>
          <div className="item-name" style={{ paddingLeft: depth * 16 }}>
            {contents.length > 0 ? (
              <button
                type="button"
                className="twist"
                aria-expanded={expanded}
                aria-label={expanded ? 'Cerrar contenedor' : 'Abrir contenedor'}
                onClick={() => setOpen((value) => !value)}
              >
                {expanded ? '▾' : '▸'}
              </button>
            ) : (
              <span className="twist-spacer" />
            )}
            <TypeIcon typeId={asset.typeId} name={asset.name} copy={asset.copy} size={28} />
            {asset.name}
          </div>
        </td>
        <td className="num">{formatNum(asset.qty)}</td>
        <td className="num">{formatVolume(asset.volume)}</td>
        <td className="num">{formatIsk(treeValue(asset))}</td>
      </tr>
      {expanded &&
        contents.map((child) => <AssetBranch key={child.id} asset={child} depth={depth + 1} forceOpen={forceOpen} />)}
    </>
  )
}

function AssetRows({ assets, forceOpen }: { assets: Asset[]; forceOpen: boolean }) {
  return (
    <table className="skills-table dense">
      <thead>
        <tr>
          <th>Objeto</th>
          <th className="num">Cant.</th>
          <th className="num">m³</th>
          <th className="num">Valor</th>
        </tr>
      </thead>
      <tbody>
        {assets.map((asset) => (
          <AssetBranch key={asset.id} asset={asset} depth={0} forceOpen={forceOpen} />
        ))}
      </tbody>
    </table>
  )
}

function AssetSection({ title, assets, forceOpen }: { title: string; assets: Asset[]; forceOpen: boolean }) {
  const [open, setOpen] = useState(true)
  const expanded = forceOpen || open
  return (
    <>
      <button
        type="button"
        className="inv-label"
        aria-expanded={expanded}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="twist" aria-hidden="true">{expanded ? '▾' : '▸'}</span>
        {title}
        <span className="nav-meta">{assets.length}</span>
      </button>
      {expanded && <AssetRows assets={assets} forceOpen={forceOpen} />}
    </>
  )
}

export const Inventory = memo(function Inventory() {
  const profile = useCharacter().profile
  const locations = profile?.locations ?? []
  const [query, setQuery] = useState('')
  const [locationId, setLocationId] = useState('')
  const places = locations.length > 0 ? locations : [{ id: 'empty', name: 'Sin activos', detail: '', assets: [] }]
  const location = places.find((item) => item.id === locationId) ?? places[0]!
  const assets = useMemo(() => filterAssets(location.assets, query.trim().toLowerCase()), [location, query])
  const ships = assets.filter((asset) => asset.ship)
  const containers = assets.filter((asset) => !asset.ship && asset.contents.length > 0)
  const things = assets.filter((asset) => !asset.ship && asset.contents.length === 0)
  const totals = {
    count: countAssets(assets),
    value: assets.reduce((sum, asset) => sum + treeValue(asset), 0),
    volume: assets.reduce((sum, asset) => sum + asset.volume, 0)
  }
  if (!profile) return null

  return (
    <div className="stack">
      <div className="toolbar">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filtrar objetos"
          aria-label="Filtrar objetos"
        />
        <span className="dim">{location.detail}</span>
      </div>
      <div className="stack-main split">
        <div className="pane nav-list">
          {places.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === location.id ? 'nav-item selected' : 'nav-item'}
              onClick={() => setLocationId(item.id)}
            >
              <span>{item.name}</span>
              <span className="nav-meta">{countAssets(item.assets)}</span>
            </button>
          ))}
        </div>
        <div className="pane">
          {assets.length === 0 ? (
            <p className="empty">No hay objetos con ese filtro.</p>
          ) : (
            <>
              {ships.length > 0 && (
                <AssetSection title="Naves" assets={ships} forceOpen={query.trim().length > 0} />
              )}
              {containers.length > 0 && (
                <AssetSection title="Contenedores" assets={containers} forceOpen={query.trim().length > 0} />
              )}
              {things.length > 0 && (
                <AssetSection title="Item Hangar" assets={things} forceOpen={query.trim().length > 0} />
              )}
            </>
          )}
        </div>
      </div>
      <footer className="module-foot">
        <span>
          {totals.count} objetos · {formatVolume(totals.volume)} m³
        </span>
        <span className="mono">{formatIsk(totals.value)}</span>
      </footer>
    </div>
  )
})
