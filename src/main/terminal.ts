/**
 * Pseudo-terminal sessions for the Terminal panel.
 *
 * Sessions live in the main process, so they keep running while the renderer
 * switches tabs or panels. A bounded copy of each session's output is retained
 * so a re-mounted terminal can replay its scrollback.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import * as pty from 'node-pty'
import type {
  TerminalCreateInput,
  TerminalDataDto,
  TerminalExitDto,
  TerminalSessionDto
} from '@shared/ipc'

/** How much output to keep for a re-attaching renderer. */
const MAX_BUFFER = 200_000

interface Session {
  id: string
  cwd: string
  shell: string
  process: pty.IPty
  buffer: string
  exited: boolean
}

/** Find the first executable on PATH, so the user's preferred shell wins. */
function findExecutable(candidates: string[]): string | null {
  const directories = (process.env.PATH ?? '').split(process.platform === 'win32' ? ';' : ':')
  for (const candidate of candidates) {
    if (candidate.includes('/') || candidate.includes('\\')) {
      if (existsSync(candidate)) return candidate
      continue
    }
    for (const directory of directories) {
      if (!directory) continue
      const full = join(directory, candidate)
      if (existsSync(full)) return full
    }
  }
  return null
}

/** Shell to run, and the arguments that keep it non-interactive-friendly. */
function resolveShell(): { file: string; args: string[] } {
  const override = process.env.PIUI_SHELL
  if (override) return { file: override, args: [] }

  if (process.platform === 'win32') {
    const shell = findExecutable(['pwsh.exe', 'powershell.exe']) ?? process.env.ComSpec ?? 'cmd.exe'
    const args = /cmd\.exe$/i.test(shell) ? [] : ['-NoLogo']
    return { file: shell, args }
  }

  return { file: process.env.SHELL ?? '/bin/bash', args: ['-l'] }
}

/** Owns the live terminal sessions for the app. */
export class TerminalManager {
  private readonly sessions = new Map<string, Session>()
  private readonly emitData: (payload: TerminalDataDto) => void
  private readonly emitExit: (payload: TerminalExitDto) => void

  constructor(
    emitData: (payload: TerminalDataDto) => void,
    emitExit: (payload: TerminalExitDto) => void
  ) {
    this.emitData = emitData
    this.emitExit = emitExit
  }

  /** Start a shell, or re-attach to the one already using this id. */
  create(input: TerminalCreateInput, fallbackCwd: string): TerminalSessionDto {
    const existing = this.sessions.get(input.id)
    if (existing && !existing.exited) {
      if (input.cols > 0 && input.rows > 0) existing.process.resize(input.cols, input.rows)
      return this.toDto(existing)
    }

    const cwd = existsSync(input.cwd) ? input.cwd : fallbackCwd
    // An explicit shell wins; otherwise pick the user's preferred one.
    const chosen = input.shell?.trim()
    const { file, args } =
      chosen && existsSync(chosen) ? { file: chosen, args: [] } : resolveShell()

    const child = pty.spawn(file, args, {
      name: 'xterm-256color',
      cols: Math.max(2, input.cols),
      rows: Math.max(1, input.rows),
      cwd,
      env: { ...process.env, TERM: 'xterm-256color', PIUI: '1' } as Record<string, string>
    })

    const session: Session = {
      id: input.id,
      cwd,
      shell: args.length > 0 ? `${file} ${args.join(' ')}` : file,
      process: child,
      buffer: '',
      exited: false
    }

    child.onData((data) => {
      session.buffer = (session.buffer + data).slice(-MAX_BUFFER)
      this.emitData({ id: session.id, data })
    })

    child.onExit(({ exitCode }) => {
      session.exited = true
      this.emitExit({ id: session.id, exitCode })
    })

    this.sessions.set(input.id, session)
    return this.toDto(session)
  }

  write(id: string, data: string): void {
    const session = this.sessions.get(id)
    if (session && !session.exited) session.process.write(data)
  }

  resize(id: string, cols: number, rows: number): void {
    const session = this.sessions.get(id)
    if (!session || session.exited) return
    if (cols < 2 || rows < 1) return
    try {
      session.process.resize(cols, rows)
    } catch {
      // The shell may have exited between the check and the resize.
    }
  }

  dispose(id: string): void {
    const session = this.sessions.get(id)
    if (!session) return
    this.sessions.delete(id)
    if (!session.exited) {
      try {
        session.process.kill()
      } catch {
        // Already gone.
      }
    }
  }

  /** Kill every session, called when the app quits. */
  disposeAll(): void {
    for (const id of [...this.sessions.keys()]) this.dispose(id)
  }

  private toDto(session: Session): TerminalSessionDto {
    return {
      id: session.id,
      cwd: session.cwd,
      shell: session.shell,
      buffer: session.buffer
    }
  }
}
