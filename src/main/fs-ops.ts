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
import { basename, dirname, isAbsolute, relative, resolve } from 'node:path'
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
    await rm(path, { recursive: true, force: false, maxRetries: 2 })
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
    }

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

    return { ok: true, error: null }
  } catch (cause) {
    return fail(cause)
  }
}
