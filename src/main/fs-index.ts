/**
 * Flat, recursive index of the workspace, used by the editor's quick open
 * (Ctrl+P) palette.
 *
 * The walk is depth-limited and skips the directories that would drown out the
 * result list, and the index is cached briefly so repeated palette opens are
 * instant.
 */
import { readdir } from 'node:fs/promises'
import { join, relative } from 'node:path'

/** Directories never worth indexing. */
const SKIP_DIRECTORIES = new Set([
  '.git',
  '.hg',
  '.svn',
  '.cache',
  '.next',
  '.nuxt',
  '.output',
  '.parcel-cache',
  '.turbo',
  '.venv',
  '.vscode-test',
  '__pycache__',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'release',
  'target',
  'vendor'
])

/** Hard ceiling so a huge repository cannot stall the palette. */
const MAX_FILES = 8000
const MAX_DEPTH = 12
const CACHE_MS = 4000

interface IndexCache {
  at: number
  root: string
  files: string[]
}

let cache: IndexCache | null = null

async function walk(
  directory: string,
  root: string,
  depth: number,
  files: string[]
): Promise<void> {
  if (depth > MAX_DEPTH || files.length >= MAX_FILES) return

  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch {
    return
  }

  const directories: string[] = []

  for (const entry of entries) {
    if (files.length >= MAX_FILES) return

    if (entry.isDirectory()) {
      if (SKIP_DIRECTORIES.has(entry.name) || entry.name.startsWith('.git')) continue
      directories.push(join(directory, entry.name))
      continue
    }

    if (!entry.isFile()) continue
    files.push(relative(root, join(directory, entry.name)).replace(/\\/g, '/'))
  }

  // Await sequentially: this can run while the user is typing.
  for (const child of directories) {
    await walk(child, root, depth + 1, files)
  }
}

/** Workspace-relative file paths, sorted, cached for a few seconds. */
export async function listWorkspaceFiles(root: string): Promise<string[]> {
  if (cache && cache.root === root && Date.now() - cache.at < CACHE_MS) return cache.files

  const files: string[] = []
  await walk(root, root, 0, files)
  files.sort()

  cache = { at: Date.now(), root, files }
  return files
}

/** Drop the cached index, e.g. after a file is written. */
export function invalidateWorkspaceFiles(): void {
  cache = null
}
