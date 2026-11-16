export type UpdateState =
  | { phase: 'idle' }
  | { phase: 'unsupported' }
  | { phase: 'checking' }
  | { phase: 'current' }
  | { phase: 'available'; version: string }
  | { phase: 'downloading'; version: string; percent: number }
  | { phase: 'ready'; version: string }
  | { phase: 'error'; message: string }
