import type { PiUiApi } from '@shared/ipc'

declare global {
  interface Window {
    piui: PiUiApi
  }
}

export {}
