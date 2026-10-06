import { basename } from 'node:path'
import { sdk } from './sdk'
import type { SessionSummaryDto } from '@shared/ipc'

/** Shape of a `SessionInfo` as returned by the SDK. */
interface SdkSessionInfo {
  path: string
  id: string
  cwd: string
  name?: string
  parentSessionPath?: string
  created: Date | string
  modified: Date | string
  messageCount: number
  firstMessage: string
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function toSummary(info: SdkSessionInfo): SessionSummaryDto {
  return {
    path: info.path,
    id: info.id,
    cwd: info.cwd,
    name: info.name ?? null,
    created: toIso(info.created),
    modified: toIso(info.modified),
    messageCount: info.messageCount,
    firstMessage: info.firstMessage,
    parentSessionPath: info.parentSessionPath ?? null
  }
}

function newestFirst(summaries: SessionSummaryDto[]): SessionSummaryDto[] {
  return summaries.sort((a, b) => b.modified.localeCompare(a.modified))
}

/** Sessions recorded for one working directory. */
export async function listSessions(cwd: string): Promise<SessionSummaryDto[]> {
  const infos = (await sdk().SessionManager.list(cwd)) as unknown as SdkSessionInfo[]
  return newestFirst(infos.map(toSummary))
}

/** Sessions across every working directory Pi has recorded. */
export async function listAllSessions(): Promise<SessionSummaryDto[]> {
  const infos = (await sdk().SessionManager.listAll()) as unknown as SdkSessionInfo[]
  return newestFirst(infos.map(toSummary))
}

/** Leaf folder name for display, falling back to the full path. */
export function workspaceName(cwd: string): string {
  const leaf = basename(cwd)
  return leaf.length > 0 ? leaf : cwd
}
