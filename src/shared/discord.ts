export type DiscordChannel = {
  id: string
  name: string
  url: string
}

export type DiscordChannelLink = {
  guildId: string
  channelId: string
  url: string
}

export type DiscordState = {
  channels: DiscordChannel[]
  activeId: string
}

const HOSTS = new Set([
  'discord.com',
  'www.discord.com',
  'canary.discord.com',
  'ptb.discord.com',
  'discordapp.com',
  'www.discordapp.com',
  'canary.discordapp.com',
  'ptb.discordapp.com'
])

function isSnowflake(value: string | undefined): value is string {
  return !!value && /^\d{5,22}$/.test(value)
}

export function parseDiscordChannelUrl(input: string): DiscordChannelLink | null {
  let parsed: URL
  try {
    parsed = new URL(input.trim())
  } catch {
    return null
  }
  if (parsed.protocol !== 'https:' || !HOSTS.has(parsed.hostname)) return null
  const parts = parsed.pathname.split('/').filter(Boolean)
  if (parts[0] !== 'channels' || !isSnowflake(parts[1]) || !isSnowflake(parts[2])) return null
  return {
    guildId: parts[1],
    channelId: parts[2],
    url: `https://discord.com/channels/${parts[1]}/${parts[2]}`
  }
}

export function discordDesktopUrl(link: DiscordChannelLink): string {
  return `discord://-/channels/${link.guildId}/${link.channelId}`
}
