import { memo, useMemo, useState } from 'react'
import { ClearableInput } from '../components/ClearableInput'
import { Isk } from '../components/Isk'
import { TypeIcon } from '../components/TypeIcon'
import { formatNum } from '../lib/format'
import { useCharacter } from '../state/character'
import type { Asset, AssetLocation } from '../types'

function formatVolume(value: number): string {
  if (value <= 0) return formatNum(0)
  if (value < 1) return formatNum(value, 2)
  return formatNum(value, Number.isInteger(value) ? 0 : 1)
}

function treeValue(asset: Asset): number {
  return asset.value + asset.contents.reduce((sum, child) => sum + treeValue(child), 0)
}

function treeVolume(asset: Asset): number {
  return asset.volume + asset.contents.reduce((sum, child) => sum + treeVolume(child), 0)
}

function countAssets(assets: Asset[]): number {
  return assets.reduce((sum, asset) => sum + 1 + countAssets(asset.contents), 0)
}

function sumAssets(assets: Asset[]) {
  return {
    count: countAssets(assets),
    value: assets.reduce((sum, asset) => sum + treeValue(asset), 0),
    volume: assets.reduce((sum, asset) => sum + treeVolume(asset), 0)
  }
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

function splitAssets(assets: Asset[]) {
  return {
    ships: assets.filter((asset) => asset.ship),
    containers: assets.filter((asset) => !asset.ship && asset.contents.length > 0),
    things: assets.filter((asset) => !asset.ship && asset.contents.length === 0)
  }
}

function AssetGroups({ assets, forceOpen }: { assets: Asset[]; forceOpen: boolean }) {
  const { ships, containers, things } = splitAssets(assets)
  if (assets.length === 0) return <p className="empty">No hay objetos con ese filtro.</p>
  return (
    <>
      {ships.length > 0 && <AssetSection title="Naves" assets={ships} forceOpen={forceOpen} />}
      {containers.length > 0 && <AssetSection title="Contenedores" assets={containers} forceOpen={forceOpen} />}
      {things.length > 0 && <AssetSection title="Item Hangar" assets={things} forceOpen={forceOpen} />}
    </>
  )
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
        <td className="num">
          <Isk value={treeValue(asset)} />
        </td>
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
  const [allLocations, setAllLocations] = useState(false)
  const [locationId, setLocationId] = useState('')
  const places = locations.length > 0 ? locations : [{ id: 'empty', name: 'Sin activos', detail: '', assets: [] }]
  const location = places.find((item) => item.id === locationId) ?? places[0]!
  const needle = query.trim().toLowerCase()
  const searchEverywhere = allLocations && needle.length > 0
  const filteredPlaces = useMemo(
    () =>
      places.map((place) => ({
        ...place,
        assets: filterAssets(place.assets, needle)
      })),
    [places, needle]
  )
  const matches = useMemo(
    () => (searchEverywhere ? filteredPlaces.filter((place) => place.assets.length > 0) : []),
    [filteredPlaces, searchEverywhere]
  )
  const assets = useMemo(
    () => (searchEverywhere ? matches.flatMap((place) => place.assets) : filterAssets(location.assets, needle)),
    [searchEverywhere, matches, location, needle]
  )
  const forceOpen = needle.length > 0
  const viewTotals = useMemo(() => sumAssets(assets), [assets])
  const inventoryTotals = useMemo(
    () => sumAssets(places.flatMap((place) => place.assets)),
    [places]
  )
  const locationTotals = useMemo(
    () => (searchEverywhere ? viewTotals : sumAssets(location.assets)),
    [searchEverywhere, viewTotals, location.assets]
  )
  if (!profile) return null

  return (
    <div className="stack">
      <div className="toolbar">
        <div className="toolbar-start">
          <ClearableInput
            value={query}
            onChange={setQuery}
            placeholder="Filtrar objetos"
            aria-label="Filtrar objetos"
          />
          <label className="toolbar-check">
            <input
              type="checkbox"
              checked={allLocations}
              onChange={(event) => setAllLocations(event.target.checked)}
            />
            Todas las ubicaciones
          </label>
        </div>
        <div className="inv-summary" aria-label="Totales de todas las ubicaciones">
          <span className="inv-stat">
            <em>Objetos</em>
            <strong className="num">{formatNum(inventoryTotals.count)}</strong>
          </span>
          <span className="inv-stat">
            <em>Volumen</em>
            <strong className="num">{formatVolume(inventoryTotals.volume)} m³</strong>
          </span>
          <span className="inv-stat">
            <em>Estimado</em>
            <Isk value={inventoryTotals.value} />
          </span>
        </div>
      </div>
      <div className="stack-main split">
        <div className="pane nav-list">
          {places.map((item) => {
            const filtered = filteredPlaces.find((place) => place.id === item.id)
            const count = searchEverywhere
              ? countAssets(filtered?.assets ?? [])
              : countAssets(item.assets)
            const selected = !searchEverywhere && item.id === location.id
            return (
              <button
                key={item.id}
                type="button"
                className={selected ? 'nav-item selected' : 'nav-item'}
                disabled={searchEverywhere}
                onClick={() => setLocationId(item.id)}
              >
                <span>{item.name}</span>
                <span className="nav-meta">{count}</span>
              </button>
            )
          })}
        </div>
        <div className="inv-list-pane">
          <div className="inv-list-scroll pane">
            {searchEverywhere ? (
              matches.length === 0 ? (
                <p className="empty">No hay objetos con ese filtro.</p>
              ) : (
                matches.map((place: AssetLocation) => (
                  <AssetSection key={place.id} title={place.name} assets={place.assets} forceOpen={forceOpen} />
                ))
              )
            ) : (
              <AssetGroups assets={assets} forceOpen={forceOpen} />
            )}
          </div>
          <div className="inv-loc-foot" aria-label="Total de la ubicación">
            <span className="inv-loc-name">{searchEverywhere ? 'Vista' : location.name}</span>
            <span className="inv-stat">
              <em>Objetos</em>
              <strong className="num">{formatNum(locationTotals.count)}</strong>
            </span>
            <span className="inv-stat">
              <em>Volumen</em>
              <strong className="num">{formatVolume(locationTotals.volume)} m³</strong>
            </span>
            <span className="inv-stat">
              <em>Estimado</em>
              <Isk value={locationTotals.value} />
            </span>
          </div>
        </div>
      </div>
    </div>
  )
})
