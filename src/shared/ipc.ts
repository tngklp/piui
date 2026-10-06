/**
 * Shared IPC contract between the PiUI main process and the renderer.
 *
 * Keep this module dependency-free — it is imported by both the Node-side
 * main process and the browser-side renderer, so it must not reference
 * Electron, Node built-ins, or DOM globals.
 */

export const IpcChannel = {
  /** Returns static application/runtime information. */
  AppInfo: 'piui:app:info'
} as const

export type IpcChannel = (typeof IpcChannel)[keyof typeof IpcChannel]

/** Static information about the running PiUI application. */
export interface AppInfo {
  /** Application name, e.g. `PiUI`. */
  name: string
  /** Application version from package.json. */
  version: string
  /** Host platform, e.g. `win32`, `linux`. */
  platform: string
  /** Underlying runtime versions. */
  versions: {
    electron: string
    chrome: string
    node: string
    v8: string
  }
}

/**
 * The API surface PiUI exposes to the renderer as `window.piui`.
 * Every method is implemented in the preload script and backed by IPC.
 */
export interface PiUiApi {
  getAppInfo(): Promise<AppInfo>
}
