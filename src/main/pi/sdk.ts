/**
 * Resolve which copy of the pi SDK PiUI runs on.
 *
 * PiUI ships a copy of the SDK so it always starts, but the pi installer keeps
 * its own dependency tree under `<agentDir>/install/releases/<version>`. When a
 * release newer than (or equal to) the bundled one is installed there, PiUI
 * loads that copy instead. That keeps the embedded agent and the CLI on the same
 * version — sessions and settings stay compatible, and upgrading pi does not
 * require a new PiUI build.
 */
import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import * as bundled from '@earendil-works/pi-coding-agent'

/** Shape of the SDK module (the bundled copy defines the contract). */
export type PiSdk = typeof bundled

let active: PiSdk = bundled
let loadedFrom: string | null = null

/** The SDK PiUI should use. */
export function sdk(): PiSdk {
  return active
}

/** Absolute path of the loaded copy, or null when the bundled one is in use. */
export function sdkPath(): string | null {
  return loadedFrom
}

/**
 * Agent directory, resolved the same way the SDK does. Needed before the SDK is
 * loaded, so it cannot call `getAgentDir()`.
 */
function agentDir(): string {
  const fromEnv = process.env.PI_CODING_AGENT_DIR
  if (fromEnv && fromEnv.length > 0) return resolve(fromEnv.replace(/^~/, homedir()))
  return join(homedir(), '.pi', 'agent')
}

/** Compare dotted version strings, numerically where possible. */
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

/** Highest version directory under `install/releases`. */
async function newestRelease(releasesDir: string): Promise<string | null> {
  try {
    const entries = await readdir(releasesDir, { withFileTypes: true })
    const versions = entries
      .filter((entry) => entry.isDirectory() && /^\d+\.\d+\.\d+/.test(entry.name))
      .map((entry) => entry.name)
      .sort(compareVersions)
    return versions[versions.length - 1] ?? null
  } catch {
    return null
  }
}

/** ESM entry point declared by a package's `exports` or `main`. */
async function entryPoint(packageDir: string): Promise<string | null> {
  try {
    const manifest = JSON.parse(await readFile(join(packageDir, 'package.json'), 'utf8')) as {
      exports?: Record<string, unknown>
      main?: string
    }
    const root = manifest.exports?.['.']
    const target =
      typeof root === 'string'
        ? root
        : typeof root === 'object' && root !== null
          ? ((root as Record<string, unknown>).import ?? (root as Record<string, unknown>).default)
          : manifest.main

    if (typeof target !== 'string' || target.length === 0) return null
    return resolve(packageDir, target)
  } catch {
    return null
  }
}

/**
 * Prefer the installed pi release over the bundled copy. Safe to call once at
 * startup; any failure leaves the bundled SDK in place and the runtime banner
 * reports the mismatch.
 */
export async function initSdk(): Promise<void> {
  try {
    const version = await newestRelease(join(agentDir(), 'install', 'releases'))
    if (!version) return

    const packageDir = join(
      agentDir(),
      'install',
      'releases',
      version,
      'node_modules',
      '@earendil-works',
      'pi-coding-agent'
    )
    const entry = await entryPoint(packageDir)
    if (!entry || !existsSync(entry)) return

    const loaded = (await import(pathToFileURL(entry).href)) as PiSdk
    if (typeof loaded.VERSION !== 'string') return
    if (typeof loaded.createAgentSession !== 'function') return
    // Never downgrade below what PiUI was built against.
    if (compareVersions(loaded.VERSION, bundled.VERSION) < 0) return

    active = loaded
    loadedFrom = entry
  } catch {
    // Keep the bundled SDK.
  }
}
