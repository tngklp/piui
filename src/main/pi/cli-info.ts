import { existsSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'

export interface CliInfo {
  /** Version of the globally installed `pi` CLI, or null when it cannot be detected. */
  version: string | null
  /** Path to the CLI launcher when found. */
  path: string | null
}

/** Compare two dotted version strings, numerically where possible. */
function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((part) => Number.parseInt(part, 10))
  const pb = b.split('.').map((part) => Number.parseInt(part, 10))
  const length = Math.max(pa.length, pb.length)
  for (let i = 0; i < length; i += 1) {
    const na = Number.isNaN(pa[i]) ? 0 : (pa[i] ?? 0)
    const nb = Number.isNaN(pb[i]) ? 0 : (pb[i] ?? 0)
    if (na !== nb) return na - nb
  }
  return 0
}

/**
 * Detect the globally installed `pi` CLI.
 *
 * The pi.dev installer keeps managed releases under
 * `<agentDir>/install/releases/<version>` and launchers under `<agentDir>/bin`.
 * Reading those is cheaper and more reliable than shelling out to `pi`, whose
 * Windows launcher is a PowerShell script that cannot be spawned directly.
 */
export async function detectCli(agentDir: string): Promise<CliInfo> {
  const binDir = join(agentDir, 'bin')
  const launchers = ['pi.cmd', 'pi.exe', 'pi'].map((name) => join(binDir, name))
  const launcher = launchers.find((path) => existsSync(path)) ?? null

  try {
    const releasesDir = join(agentDir, 'install', 'releases')
    const entries = await readdir(releasesDir, { withFileTypes: true })
    const versions = entries
      .filter((entry) => entry.isDirectory() && /^\d+\.\d+\.\d+/.test(entry.name))
      .map((entry) => entry.name)
      .sort(compareVersions)

    const latest = versions[versions.length - 1]
    if (latest) return { version: latest, path: launcher }

    // No managed release directory: fall back to a launcher next to a bin dir.
    if (existsSync(join(binDir, 'pi.ps1'))) {
      return { version: null, path: join(binDir, 'pi.ps1') }
    }
  } catch {
    // The CLI may be installed by another package manager; report unknown.
  }

  return { version: null, path: launcher }
}
