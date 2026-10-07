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

/** Whether a string looks like the HTML the GitHub feed hands over. */
const HTML_TAG = /<(h[1-6]|ul|ol|li|p|br|strong|em|code|b|i)\b/i

/**
 * Turn HTML release notes into the markdown the changelog dialog renders.
 *
 * Notes normally arrive as markdown, because the release workflow writes
 * `build/release-notes.md` and electron-builder embeds it in `latest.yml`. When
 * the channel file carries none — an older release, or one published outside the
 * workflow — electron-updater falls back to the GitHub releases feed, whose Atom
 * `<content>` is rendered HTML. Feeding that to a markdown renderer would show
 * the tags as literal text, which is what this repairs.
 */
function normaliseNotes(raw: string): string {
  if (!HTML_TAG.test(raw)) return raw

  return (
    raw
      // GitHub puts a `<br>` before the newline it came from, so consuming the
      // newline too avoids turning one line break into a paragraph break.
      .replace(/<br\s*\/?>[ \t]*\n?/gi, '\n')
      .replace(/<\/(h[1-6]|p|ul|ol)>/gi, '\n\n')
      .replace(/<h[1-6][^>]*>/gi, '### ')
      // Consuming the whitespace before `<li>` keeps the items in one list; leaving
      // the source newline in place would start a new list at every bullet.
      .replace(/\s*<li[^>]*>/gi, '\n- ')
      .replace(/<\/li>/gi, '')
      .replace(/<(strong|b)[^>]*>/gi, '**')
      .replace(/<\/(strong|b)>/gi, '**')
      .replace(/<(em|i)[^>]*>/gi, '_')
      .replace(/<\/(em|i)>/gi, '_')
      .replace(/<code[^>]*>/gi, '`')
      .replace(/<\/code>/gi, '`')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  )
}

/** Release notes arrive as a string, a list of notes, or not at all. */
function notesOf(info: UpdateInfo): string | null {
  const notes = info.releaseNotes
  if (typeof notes === 'string') return normaliseNotes(notes).trim() || null
  if (Array.isArray(notes)) {
    const joined = notes
      .map((entry) => normaliseNotes(entry.note ?? ''))
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

    autoUpdater.autoDownload = true
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
    // Silent, and relaunch afterwards. The NSIS wizard has nothing to ask that the
    // user has not already answered, and clicking through it is the difference
    // between an update and a chore. Passing `isSilent` runs the installer with
    // `/S`, which electron-builder resolves against the existing install location.
    // Let the IPC reply reach the renderer before the process goes away.
    setImmediate(() => autoUpdater.quitAndInstall(true, true))
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
