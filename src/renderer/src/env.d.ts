/// <reference types="vite/client" />

import type { CapsuleerOsApi } from '../../preload/index'

declare global {
  interface Window {
    os?: CapsuleerOsApi
  }
}

export {}
