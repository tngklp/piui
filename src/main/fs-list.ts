import { execFile } from 'node:child_process'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { promisify } from 'node:util'
import type { FsEntryDto, FsFileDto, FsListingDto } from '@shared/ipc'

const execFileAsync = promisify(execFile)

interface GitCache {
  at: number
  root: string
  map: Map<string, 'M' | 'U'>
}

let gitCache: GitCache | null = null

/** Working-tree status keyed by workspace-relative path, cached briefly. */
async function readGitStatus(workspaceRoot: string): Promise<Map<string, 'M' | 'U'>> {
  if (gitCache && gitCache.root === workspaceRoot && Date.now() - gitCache.at < 5000) {
    return gitCache.map
  }

  const map = new Map<string, 'M' | 'U'>()
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['status', '--porcelain', '--untracked-files=all'],
      { cwd: workspaceRoot, maxBuffer: 8 * 1024 * 1024, windowsHide: true }
    )

    for (const line of stdout.split('\n')) {
      if (line.length < 4) continue
      const code = line.slice(0, 2)
      const filePath = line.slice(3).trim()
      if (!filePath) continue
      map.set(filePath, code.includes('?') ? 'U' : 'M')
    }

    gitCache = { at: Date.now(), root: workspaceRoot, map }
  } catch {
    // Not a git repository, or git is not installed.
  }

  return map
}

/** List a directory for the explorer, decorating entries with git status. */
export async function listDirectory(target: string, workspaceRoot: string): Promise<FsListingDto> {
  const path = resolve(target)

  try {
    const dirents = await readdir(path, { withFileTypes: true })
    const git = await readGitStatus(workspaceRoot)

    const entries: FsEntryDto[] = dirents
      .map((dirent) => {
        const child = join(path, dirent.name)
        const relativePath = relative(workspaceRoot, child).replace(/\\/g, '/')
        const entry: FsEntryDto = {
          name: dirent.name,
          path: child,
          kind: dirent.isDirectory() ? 'directory' : 'file'
        }
        const status = git.get(relativePath)
        if (status) entry.status = status
        return entry
      })
      .sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1
        return a.name.localeCompare(b.name)
      })

    return { path, entries, error: null }
  } catch (cause) {
    return {
      path,
      entries: [],
      error: cause instanceof Error ? cause.message : String(cause)
    }
  }
}

/** Read a file as UTF-8 text for the editor. */
export async function readFileText(target: string): Promise<FsFileDto> {
  const path = resolve(target)
  try {
    return { path, content: await readFile(path, 'utf8'), error: null }
  } catch (cause) {
    return { path, content: '', error: cause instanceof Error ? cause.message : String(cause) }
  }
}

/** Write UTF-8 text to a file and drop the cached git status. */
export async function writeFileText(target: string, content: string): Promise<void> {
  await writeFile(resolve(target), content, 'utf8')
  invalidateGitStatus()
}

/** Drop the cached git status. Any write to the tree makes it stale. */
export function invalidateGitStatus(): void {
  gitCache = null
}
