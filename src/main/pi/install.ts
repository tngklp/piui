/**
 * Install the `pi` CLI on the user's behalf.
 *
 * This runs the same command the documentation gives a human to type, because
 * PiUI cannot do anything useful without `pi` and asking someone to leave the app
 * and copy a command out of a README is a poor first run.
 *
 * The installer is a script fetched over HTTPS and piped into a shell, which is
 * what makes it one step. Its output is captured rather than swallowed, so a
 * failure can be shown instead of a spinner that never resolves.
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { PiInstallResultDto } from '@shared/ipc'

const execFileAsync = promisify(execFile)

/** Long enough for a download plus a global install on a slow connection. */
const TIMEOUT_MS = 5 * 60 * 1000

/** The installer command for this platform. */
function installerCommand(): [string, string[]] {
  if (process.platform === 'win32') {
    return [
      'powershell.exe',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        'irm https://pi.dev/install.ps1 | iex'
      ]
    ]
  }

  return ['sh', ['-c', 'curl -fsSL https://pi.dev/install.sh | sh']]
}

/** The last few lines, which is where an installer puts its result. */
function tail(text: string, lines = 12): string {
  const trimmed = text.trim()
  if (trimmed.length === 0) return ''
  return trimmed.split('\n').slice(-lines).join('\n')
}

export async function installPi(): Promise<PiInstallResultDto> {
  const [command, args] = installerCommand()

  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      timeout: TIMEOUT_MS,
      windowsHide: true,
      maxBuffer: 4 * 1024 * 1024
    })
    return { ok: true, output: tail(stdout || stderr), error: null }
  } catch (cause) {
    // A non-zero exit still carries the useful part of the story in its output.
    const failure = cause as { stdout?: string; stderr?: string; message?: string }
    return {
      ok: false,
      output: tail(failure.stdout || failure.stderr || ''),
      error: failure.message ?? String(cause)
    }
  }
}
