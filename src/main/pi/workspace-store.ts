import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

/** Persists the working directory the agent should operate on. */
export class WorkspaceStore {
  private readonly filePath: string
  private cwd: string

  constructor(filePath: string, fallback: string) {
    this.filePath = filePath
    this.cwd = fallback
  }

  async load(): Promise<string> {
    try {
      const raw = await readFile(this.filePath, 'utf8')
      const parsed = JSON.parse(raw) as { cwd?: unknown }
      if (typeof parsed.cwd === 'string' && parsed.cwd.length > 0) {
        this.cwd = parsed.cwd
      }
    } catch {
      // First run, or unreadable: keep the fallback.
    }
    return this.cwd
  }

  get(): string {
    return this.cwd
  }

  async set(cwd: string): Promise<void> {
    this.cwd = cwd
    await mkdir(dirname(this.filePath), { recursive: true })
    await writeFile(this.filePath, `${JSON.stringify({ cwd }, null, 2)}\n`, 'utf8')
  }
}
