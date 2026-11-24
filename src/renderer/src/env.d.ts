import type { ErpApi } from '@shared/api'

declare global {
  interface Window {
    api: ErpApi
  }
}

export {}
