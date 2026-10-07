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
import { isAbsolute, relative, resolve } from 'node:path'
import type {
  ExtensionAPI,
  ExtensionFactory,
  InlineExtension
} from '@earendil-works/pi-coding-agent'
import type { FsResultDto, LineChangeDto, PendingChangeDto } from '@shared/ipc'

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

/**
 * Above this many cells the LCS table is not worth building: the product of the
 * two changed regions is the table size, and a whole-file rewrite would allocate
 * hundreds of megabytes to say "all of it changed".
 */
const DIFF_CELL_LIMIT = 4_000_000

/**
 * Which lines of the current file the agent touched.
 *
 * The display diff above is enough to read but carries no line numbers, and the
 * gutter needs them: an editor marks a line *in the file you are looking at*.
 * So this runs a real longest-common-subsequence over the lines, on the changed
 * region only — the unchanged head and tail can never contain a marked line and
 * trimming them keeps the table small.
 *
 * A replacement is reported as `modified` and a pure insertion as `added`,
 * because that is the distinction an editor draws: added lines get a green bar,
 * rewritten ones a different colour. When a hunk replaces three lines with five,
 * the first three are paired off as modified and the last two are added; the
 * pairing is arbitrary but stable, and any split of "some changed, some new"
 * would be.
 */
export function diffLines(before: string, after: string): LineChangeDto {
  const from = splitLines(before)
  const to = splitLines(after)

  const empty: LineChangeDto = { added: [], modified: [], removed: [] }

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

  const a = from.slice(head, from.length - tail)
  const b = to.slice(head, to.length - tail)
  /** Where the changed region starts in the new file, 0-based. */
  const offset = head

  // Nothing in the middle on one side: a pure insertion or a pure deletion, which
  // need no table at all.
  if (a.length === 0) {
    return { ...empty, added: b.map((_line, index) => offset + index + 1) }
  }
  if (b.length === 0) {
    // A deletion has no line of its own to sit on, so the marker goes on the line
    // above it — which is what an editor shows. 1 when there is no line above.
    return { ...empty, removed: [Math.max(1, offset)] }
  }

  if (a.length * b.length > DIFF_CELL_LIMIT) {
    return { ...empty, modified: b.map((_line, index) => offset + index + 1) }
  }

  // LCS lengths, computed backwards so the walk below can go forwards.
  const width = b.length + 1
  const table = new Int32Array((a.length + 1) * width)
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i * width + j] =
        a[i] === b[j]
          ? table[(i + 1) * width + j + 1] + 1
          : Math.max(table[(i + 1) * width + j], table[i * width + j + 1])
    }
  }

  const added: number[] = []
  const modified: number[] = []
  const removed: number[] = []

  let i = 0
  let j = 0
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      i += 1
      j += 1
      continue
    }

    // Consume one hunk: everything up to the next line the two sides agree on.
    const deletedFrom = i
    const insertedFrom = j
    while (i < a.length || j < b.length) {
      if (i < a.length && j < b.length && a[i] === b[j]) break
      const canDescend = i < a.length
      const descend =
        canDescend && j < b.length
          ? table[(i + 1) * width + j] >= table[i * width + j + 1]
          : canDescend
      if (descend) i += 1
      else j += 1
    }

    const deleted = i - deletedFrom
    const inserted = j - insertedFrom
    // New-file line numbers for the inserted side of the hunk, 1-based.
    for (let index = 0; index < inserted; index += 1) {
      const line = offset + insertedFrom + index + 1
      if (index < deleted) modified.push(line)
      else added.push(line)
    }
    // More lines went than came, so after the paired ones there is a deletion
    // with nothing on the other side. A removed line has no line of its own, so
    // it is anchored on the line it sits below — which is the last line the hunk
    // inserted, not the line before the hunk.
    if (deleted > inserted) {
      removed.push(Math.max(1, offset + insertedFrom + inserted))
    }
  }

  return { added, modified, removed }
}

export class ChangeTracker {
  private readonly changes = new Map<string, PendingChange>()

  /**
   * The workspace the agent works in.
   *
   * Tools are given paths the way a person would write them — `hello.py`, not
   * `C:\\...\\hello.py` — so every path has to be resolved before it is read.
   * Reading a relative path without this resolved against the process directory
   * instead, missed the file entirely, and left the Changes tab empty.
   */
  private root = ''

  /** See {@link setAutoKeep}. */
  private autoKeep = false

  /** Bumped whenever the reviewed set changes, so the editor can re-read files. */
  private revision = 0

  /**
   * Which file each running tool call is writing.
   *
   * `tool_execution_end` carries no arguments — only `tool_execution_start` and
   * `tool_execution_update` do — so the path has to be remembered when the call
   * arrives.
   */
  private readonly inFlight = new Map<string, string>()

  setWorkspaceRoot(root: string): void {
    this.root = root
  }

  /**
   * Accept whatever the agent writes, and stop offering it for review.
   *
   * Nothing is recorded at all, rather than recorded and immediately kept: the
   * point of the setting is that the review step is not wanted, and a list that
   * is always empty still costs a diff, a baseline copy of every file, and a
   * revision bump per write. Anything already pending is dropped.
   */
  setAutoKeep(enabled: boolean): void {
    if (this.autoKeep === enabled) return
    this.autoKeep = enabled
    if (enabled && this.changes.size > 0) {
      this.changes.clear()
      this.revision += 1
    }
  }

  getAutoKeep(): boolean {
    return this.autoKeep
  }

  /** Absolute form of a path the agent supplied. */
  private absolute(path: string): string {
    if (isAbsolute(path) || this.root.length === 0) return path
    return resolve(this.root, path)
  }

  getRevision(): number {
    return this.revision
  }

  /** The file a tool is about to write, from its arguments. */
  private static pathOf(args: unknown): string | null {
    const record = (args ?? {}) as Record<string, unknown>
    const path = record.path ?? record.file_path
    return typeof path === 'string' && path.length > 0 ? path : null
  }

  /** Remember a file's contents before the agent rewrites it. */
  async capture(path: string): Promise<void> {
    // Auto-keep means there is nothing to compare against, so the file is never
    // even read.
    if (this.autoKeep) return

    const target = this.absolute(path)
    // The first capture wins: that is the baseline an undo returns to.
    if (this.changes.has(target)) return

    try {
      const before = await readFile(target, 'utf8')
      this.changes.set(target, { path: target, before, after: before })
    } catch {
      // Missing means the tool is about to create it.
      this.changes.set(target, { path: target, before: null, after: '' })
    }
    this.revision += 1
  }

  /** Re-read the file once the tool has finished, and drop changes that are not one. */
  async settle(path: string): Promise<void> {
    if (this.autoKeep) return

    const change = this.changes.get(this.absolute(path))
    if (!change) return

    try {
      change.after = await readFile(change.path, 'utf8')
    } catch {
      // Gone again: there is nothing left to review.
      this.changes.delete(change.path)
      this.revision += 1
      return
    }

    if (change.before !== null && change.before === change.after) {
      this.changes.delete(change.path)
    }
    // The file on disk may have just changed, which is what the revision is for.
    this.revision += 1
  }

  list(): PendingChangeDto[] {
    return [...this.changes.values()]
      .map((change) => {
        const { diff, added, removed } = buildDiff(change.before ?? '', change.after)
        return {
          path: change.path,
          relative: relative(this.root, change.path).replace(/\\/g, '/'),
          created: change.before === null,
          diff,
          lines: diffLines(change.before ?? '', change.after),
          added,
          removed
        }
      })
      .sort((a, b) => a.relative.localeCompare(b.relative))
  }

  /** Accept changes: they stay on disk and leave the review list. */
  keep(path: string | null): void {
    if (path === null) this.changes.clear()
    else this.changes.delete(this.absolute(path))
  }

  /** Put files back the way they were before the agent touched them. */
  async undo(path: string | null): Promise<FsResultDto> {
    const key = path === null ? null : this.absolute(path)
    const targets = key === null ? [...this.changes.values()] : [this.changes.get(key)]
    const work = targets.filter((change): change is PendingChange => change !== undefined)
    if (work.length === 0) return { ok: false, error: 'Nothing to undo.' }

    try {
      for (const change of work) {
        // A file the agent created is undone by removing it, not by emptying it.
        if (change.before === null) await rm(change.path, { force: true })
        else await writeFile(change.path, change.before, 'utf8')
        this.changes.delete(change.path)
      }
      this.revision += 1
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
