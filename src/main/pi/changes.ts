/**
 * Tracks what the agent changes on disk, so the Changes tab can offer Keep and
 * Undo.
 *
 * The important detail is what "undo" means. A file's *original* contents are
 * captured the first time the agent touches it, and that baseline is kept however
 * many edits follow — so undoing restores the file to how it was before the agent
 * started on it, not to the state before the most recent edit. That is what a
 * person means by "undo that change", and it is the only version that is safe to
 * offer once several edits have landed.
 */
import { readFile, rm, writeFile } from 'node:fs/promises'
import { relative } from 'node:path'
import type {
  ExtensionAPI,
  ExtensionFactory,
  InlineExtension
} from '@earendil-works/pi-coding-agent'
import type { FsResultDto, PendingChangeDto } from '@shared/ipc'

/** Tools that write to a file the user may want to review. */
const WRITING_TOOLS = new Set(['write', 'edit'])

/** One file the agent changed, with what it takes to reverse it. */
interface PendingChange {
  path: string
  /** Contents before the agent touched it; null when the agent created it. */
  before: string | null
  after: string
}

function splitLines(text: string): string[] {
  return text.length === 0 ? [] : text.replace(/\n$/, '').split('\n')
}

/**
 * Mark the lines that differ, with the unchanged head and tail trimmed away.
 *
 * Not a real diff: the common prefix and suffix are dropped and everything
 * between is shown as removed then added. For the edits an agent makes that is
 * close enough to the truth, and it costs nothing to compute.
 */
function buildDiff(
  before: string,
  after: string
): { diff: string; added: number; removed: number } {
  const from = splitLines(before)
  const to = splitLines(after)

  let head = 0
  while (head < from.length && head < to.length && from[head] === to[head]) head += 1

  let tail = 0
  while (
    tail < from.length - head &&
    tail < to.length - head &&
    from[from.length - 1 - tail] === to[to.length - 1 - tail]
  ) {
    tail += 1
  }

  const removed = from.slice(head, from.length - tail)
  const added = to.slice(head, to.length - tail)

  // A line that appears on both sides did not change; it only ended up past the
  // edit. Pairing them off keeps an insertion from making the lines around it
  // look rewritten, which is the difference between a review and a puzzle.
  const gone = [...removed]
  const arrived = [...added]
  for (let index = arrived.length - 1; index >= 0; index -= 1) {
    const match = gone.indexOf(arrived[index])
    if (match === -1) continue
    gone.splice(match, 1)
    arrived.splice(index, 1)
  }

  return {
    diff: [...gone.map((line) => `-${line}`), ...arrived.map((line) => `+${line}`)].join('\n'),
    added: arrived.length,
    removed: gone.length
  }
}

export class ChangeTracker {
  private readonly changes = new Map<string, PendingChange>()

  /**
   * Which file each running tool call is writing.
   *
   * `tool_execution_end` carries no arguments — only `tool_execution_start` and
   * `tool_execution_update` do — so the path has to be remembered when the call
   * arrives.
   */
  private readonly inFlight = new Map<string, string>()

  /** The file a tool is about to write, from its arguments. */
  private static pathOf(args: unknown): string | null {
    const record = (args ?? {}) as Record<string, unknown>
    const path = record.path ?? record.file_path
    return typeof path === 'string' && path.length > 0 ? path : null
  }

  /** Remember a file's contents before the agent rewrites it. */
  async capture(path: string): Promise<void> {
    // The first capture wins: that is the baseline an undo returns to.
    if (this.changes.has(path)) return

    try {
      const before = await readFile(path, 'utf8')
      this.changes.set(path, { path, before, after: before })
    } catch {
      // Missing means the tool is about to create it.
      this.changes.set(path, { path, before: null, after: '' })
    }
  }

  /** Re-read the file once the tool has finished, and drop changes that are not one. */
  async settle(path: string): Promise<void> {
    const change = this.changes.get(path)
    if (!change) return

    try {
      change.after = await readFile(path, 'utf8')
    } catch {
      // Gone again: there is nothing left to review.
      this.changes.delete(path)
      return
    }

    if (change.before !== null && change.before === change.after) this.changes.delete(path)
  }

  list(workspaceRoot: string): PendingChangeDto[] {
    return [...this.changes.values()]
      .map((change) => {
        const { diff, added, removed } = buildDiff(change.before ?? '', change.after)
        return {
          path: change.path,
          relative: relative(workspaceRoot, change.path).replace(/\\/g, '/'),
          created: change.before === null,
          diff,
          added,
          removed
        }
      })
      .sort((a, b) => a.relative.localeCompare(b.relative))
  }

  /** Accept changes: they stay on disk and leave the review list. */
  keep(path: string | null): void {
    if (path === null) this.changes.clear()
    else this.changes.delete(path)
  }

  /** Put files back the way they were before the agent touched them. */
  async undo(path: string | null): Promise<FsResultDto> {
    const targets = path === null ? [...this.changes.values()] : [this.changes.get(path)]
    const work = targets.filter((change): change is PendingChange => change !== undefined)
    if (work.length === 0) return { ok: false, error: 'Nothing to undo.' }

    try {
      for (const change of work) {
        // A file the agent created is undone by removing it, not by emptying it.
        if (change.before === null) await rm(change.path, { force: true })
        else await writeFile(change.path, change.before, 'utf8')
        this.changes.delete(change.path)
      }
      return { ok: true, error: null }
    } catch (cause) {
      return { ok: false, error: cause instanceof Error ? cause.message : String(cause) }
    }
  }

  /** Forget everything, for a new session. */
  clear(): void {
    this.changes.clear()
  }

  /** The inline extension that watches what the agent writes. */
  extension(): InlineExtension {
    const factory: ExtensionFactory = (pi: ExtensionAPI) => {
      pi.on('tool_call', async (event) => {
        if (!WRITING_TOOLS.has(event.toolName)) return undefined
        const path = ChangeTracker.pathOf(event.input)
        if (path) {
          await this.capture(path)
          this.inFlight.set(event.toolCallId, path)
        }
        return undefined
      })

      pi.on('tool_execution_end', async (event) => {
        const path = this.inFlight.get(event.toolCallId)
        this.inFlight.delete(event.toolCallId)
        // A tool that failed wrote nothing worth reviewing.
        if (path && !event.isError) await this.settle(path)
        return undefined
      })
    }

    return { name: 'piui-changes', factory }
  }
}
