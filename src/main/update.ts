/**
 * Self-update through the GitHub releases electron-builder publishes to.
 *
 * The installer checks the release feed, downloads in the background, and then
 * hands over to `quitAndInstall`. Portable builds unpack into a temporary
 * directory that has nothing to replace, so they are told to download the new
 * version by hand instead. Nothing here runs in development.
 */
import { app } from 'electron'
// electron-updater is CommonJS and assigns its exports dynamically, so Node's
// named-export detection misses them. Reach the real exports through the default
// export instead.
import updater from 'electron-updater'
import type { AppUpdater, UpdateInfo } from 'electron-updater'
import type { UpdateStateDto } from '@shared/ipc'

const autoUpdater: AppUpdater = (updater as unknown as { autoUpdater: AppUpdater }).autoUpdater

/** Why this build cannot update itself, or null when it can. */
function blockedReason(): string | null {
  if (!app.isPackaged) return 'Updates only apply to an installed build.'

  // The portable target sets these; it has no installation to patch.
  if (process.env.PORTABLE_EXECUTABLE_DIR ?? process.env.PORTABLE_EXECUTABLE_FILE) {
    return 'This is the portable build, so it cannot update itself. Grab the new version from the releases page.'
  }

  // Of the Linux targets only the AppImage can replace itself in place.
  if (process.platform === 'linux' && !process.env.APPIMAGE) {
    return 'Only the AppImage build can update itself. Reinstall from the new package instead.'
  }

  return null
}

/** Release notes arrive as a string, a list of notes, or not at all. */
function notesOf(info: UpdateInfo): string | null {
  const notes = info.releaseNotes
  if (typeof notes === 'string') return notes.trim() || null
  if (Array.isArray(notes)) {
    const joined = notes
      .map((entry) => entry.note ?? '')
      .join('\n\n')
      .trim()
    return joined || null
  }
  return null
}

/** Tracks the updater's state and forwards every change to the renderer. */
export class UpdateService {
  private readonly emit: (state: UpdateStateDto) => void
  private state: UpdateStateDto

  constructor(emit: (state: UpdateStateDto) => void) {
    this.emit = emit

    const blocked = blockedReason()
    this.state = {
      phase: blocked ? 'unsupported' : 'idle',
      version: null,
      currentVersion: app.getVersion(),
      percent: null,
      message: blocked,
      notes: null,
      canInstall: blocked === null
    }

    if (!this.state.canInstall) return

    autoUpdater.autoDownload = false
    // A downloaded update still lands if the user quits before pressing the button.
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.allowPrerelease = false
    // electron-updater logs through a winston-style logger; PiUI has no use for it.
    autoUpdater.logger = null

    autoUpdater.on('update-available', (info) => {
      this.set({ phase: 'available', version: info.version, notes: notesOf(info), percent: null })
    })
    autoUpdater.on('update-not-available', () => {
      this.set({ phase: 'up-to-date', version: null, notes: null, percent: null })
    })
    autoUpdater.on('download-progress', (progress) => {
      this.set({ phase: 'downloading', percent: Math.round(progress.percent) })
    })
    autoUpdater.on('update-downloaded', (info) => {
      this.set({ phase: 'ready', version: info.version, percent: 100, notes: notesOf(info) })
    })
    autoUpdater.on('error', (cause: unknown) => this.fail(cause))
  }

  getState(): UpdateStateDto {
    return this.state
  }

  /** Ask the release feed whether a newer version exists. */
  async check(): Promise<UpdateStateDto> {
    if (!this.state.canInstall) return this.state
    // A download is already under way; do not throw it away.
    if (this.state.phase === 'downloading' || this.state.phase === 'ready') return this.state

    this.set({ phase: 'checking', message: null, percent: null })
    try {
      await autoUpdater.checkForUpdates()
    } catch (cause) {
      this.fail(cause)
    }
    return this.state
  }

  /** Pull the offered version down in the background. */
  async download(): Promise<UpdateStateDto> {
    if (!this.state.canInstall) return this.state
    if (this.state.phase !== 'available') return this.state

    this.set({ phase: 'downloading', percent: 0, message: null })
    try {
      await autoUpdater.downloadUpdate()
    } catch (cause) {
      this.fail(cause)
    }
    return this.state
  }

  /** Quit, apply the downloaded update, and start the new version. */
  install(): void {
    if (!this.state.canInstall || this.state.phase !== 'ready') return
    // Let the IPC reply reach the renderer before the process goes away.
    setImmediate(() => autoUpdater.quitAndInstall())
  }

  /** Check once shortly after launch, so an available update announces itself. */
  scheduleStartupCheck(delayMs = 5000): void {
    if (!this.state.canInstall) return
    setTimeout(() => {
      void this.check()
    }, delayMs)
  }

  private fail(cause: unknown): void {
    const message = cause instanceof Error ? cause.message : String(cause)
    this.set({ phase: 'error', message, percent: null })
  }

  private set(patch: Partial<UpdateStateDto>): void {
    this.state = { ...this.state, ...patch }
    this.emit(this.state)
  }
}
