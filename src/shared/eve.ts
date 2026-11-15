export const REDIRECT_PORT = 47821
export const REDIRECT_URI = `http://127.0.0.1:${REDIRECT_PORT}/callback`

export const EVE_SCOPES = [
  'esi-skills.read_skills.v1',
  'esi-skills.read_skillqueue.v1',
  'esi-wallet.read_character_wallet.v1',
  'esi-assets.read_assets.v1',
  'esi-location.read_location.v1',
  'esi-location.read_ship_type.v1',
  'esi-clones.read_clones.v1',
  'esi-universe.read_structures.v1',
  'esi-markets.read_character_orders.v1',
  'esi-markets.structure_markets.v1'
] as const
