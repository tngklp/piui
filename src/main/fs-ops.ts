/**
 * Filesystem operations behind the explorer's context menu.
 *
 * Every one of these refuses rather than guesses. The workspace root is not
 * deleted, an existing destination is not overwritten, and a directory cannot be
 * copied or moved inside itself. The explorer is a convenience layered over the
 * disk, and a convenience that quietly destroys files is worse than one that says
 * no and explains why.
 */
import { cp, mkdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import type { FsResultDto } from '@shared/ipc'

/** Whether `child` is `parent` itself or lives underneath it. */
function isInside(parent: string, child: string): boolean {
  const path = relative(parent, child)
  return path === '' || (!path.startsWith('..') && !isAbsolute(path))
}

function fail(cause: unknown): FsResultDto {
  return { ok: false, error: cause instanceof Error ? cause.message : String(cause) }
}

async function exists(target: string): Promise<boolean> {
  try {
    await stat(target)
    return true
  } catch {
    return false
  }
}

/** Where deleted paths are parked, so a delete can be taken back. */
const trashDir = join(tmpdir(), `piui-trash-${process.pid}`)

/** One reversible operation, newest last. */
interface UndoEntry {
  /** Phrased to complete "Undid ...", for the explorer's notice line. */
  label: string
  restore: () => Promise<void>
}

const history: UndoEntry[] = []

/** Deep enough for a session of tidying, shallow enough to forget old ghosts. */
const HISTORY_LIMIT = 50

function remember(entry: UndoEntry): void {
  history.push(entry)
  if (history.length > HISTORY_LIMIT) history.shift()
}

/**
 * Move a path, falling back to a copy when the two ends are on different volumes.
 * A rename across drives fails with EXDEV, and the system temporary directory is
 * often on a different one from the workspace.
 */
async function movePath(from: string, to: string): Promise<void> {
  try {
    await rename(from, to)
  } catch {
    await cp(from, to, { recursive: true })
    await rm(from, { recursive: true, force: true })
  }
}

/** Reverse the most recent operation. */
export async function undoLast(): Promise<FsResultDto> {
  const entry = history.pop()
  if (!entry) return { ok: false, error: 'Nothing to undo.' }

  try {
    await entry.restore()
    return { ok: true, error: null, label: `Undid ${entry.label}` }
  } catch (cause) {
    return fail(cause)
  }
}

/** Drop the parked copies. The history cannot survive the process that made it. */
export async function disposeUndoHistory(): Promise<void> {
  history.length = 0
  await rm(trashDir, { recursive: true, force: true }).catch(() => undefined)
}

/** Rename or move a path. Refuses to overwrite. */
export async function renameEntry(from: string, to: string): Promise<FsResultDto> {
  const source = resolve(from)
  const destination = resolve(to)
  if (source === destination) return { ok: true, error: null }

  try {
    if (await exists(destination)) {
      return { ok: false, error: `${destination} already exists.` }
    }
    await mkdir(dirname(destination), { recursive: true })
    await rename(source, destination)
    remember({
      label: `renaming ${basename(source)}`,
      restore: async () => {
        if (await exists(source)) throw new Error(`${source} is in the way.`)
        await rename(destination, source)
      }
    })
    return { ok: true, error: null }
  } catch (cause) {
    return fail(cause)
  }
}

/** Delete a file, or a directory with everything under it. Never the workspace. */
export async function deleteEntry(target: string, workspaceRoot: string): Promise<FsResultDto> {
  const path = resolve(target)

  if (path === resolve(workspaceRoot)) {
    return { ok: false, error: 'Refusing to delete the workspace folder.' }
  }
  // A drive root is its own parent, and deleting one is never what was meant.
  if (dirname(path) === path) {
    return { ok: false, error: 'Refusing to delete a drive root.' }
  }

  try {
    // Parked rather than removed, so the delete can be taken back. The copy is
    // thrown away when the app exits.
    await mkdir(trashDir, { recursive: true })
    const parked = join(trashDir, `${Date.now()}-${basename(path)}`)
    await movePath(path, parked)

    remember({
      label: `delete of ${basename(path)}`,
      restore: async () => {
        await mkdir(dirname(path), { recursive: true })
        await movePath(parked, path)
      }
    })

    return { ok: true, error: null }
  } catch (cause) {
    return fail(cause)
  }
}

/** Copy or move paths into a directory. Refuses to move a folder inside itself. */
export async function transferEntries(
  paths: string[],
  targetDir: string,
  mode: 'copy' | 'move'
): Promise<FsResultDto> {
  const sources = paths.map((path) => resolve(path))
  if (sources.length === 0) return { ok: false, error: 'Nothing to paste.' }

  const directory = resolve(targetDir)
  const made: { from: string; to: string }[] = []

  try {
    await mkdir(directory, { recursive: true })

    for (const source of sources) {
      if (isInside(source, directory)) {
        return { ok: false, error: `Cannot ${mode} a folder into itself.` }
      }

      const destination = resolve(directory, basename(source))
      if (await exists(destination)) {
        return { ok: false, error: `${destination} already exists.` }
      }

      if (mode === 'copy') {
        await cp(source, destination, { recursive: true, errorOnExist: true })
      } else {
        await rename(source, destination)
      }
      made.push({ from: source, to: destination })
    }

    remember({
      label: mode === 'copy' ? 'a paste' : 'a move',
      restore: async () => {
        for (const entry of made) {
          if (mode === 'copy') await rm(entry.to, { recursive: true, force: true })
          else await rename(entry.to, entry.from)
        }
      }
    })

    return { ok: true, error: null }
  } catch (cause) {
    return fail(cause)
  }
}

/** Create an empty file or a directory. Refuses to overwrite. */
export async function createEntry(
  target: string,
  kind: 'file' | 'directory'
): Promise<FsResultDto> {
  const path = resolve(target)

  try {
    if (await exists(path)) {
      return { ok: false, error: `${path} already exists.` }
    }

    if (kind === 'directory') {
      await mkdir(path, { recursive: true })
    } else {
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, '', 'utf8')
    }

    remember({
      label: `creating ${basename(path)}`,
      restore: async () => {
        await rm(path, { recursive: true, force: true })
      }
    })

    return { ok: true, error: null }
  } catch (cause) {
    return fail(cause)
  }
}
