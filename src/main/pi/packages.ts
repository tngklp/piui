/**
 * Browse and install pi packages (skills, extensions, prompts, themes).
 *
 * The catalogue is served as server-rendered HTML at pi.dev/packages, which
 * already supports search, type filtering, and paging. Each result card carries
 * its metadata in `data-*` attributes, so parsing is a matter of splitting on
 * the card marker and reading the attributes rather than walking a DOM.
 *
 * Installation goes through the SDK's own package manager, which writes the
 * source into `settings.json` and installs into the agent directory.
 */
import {
  DefaultPackageManager,
  SettingsManager,
  getAgentDir
} from '@earendil-works/pi-coding-agent'
import type { CatalogPackageDto, CatalogPageDto, InstalledPackageDto } from '@shared/ipc'

const CATALOG_ORIGIN = 'https://pi.dev'
/** Cards per catalogue page. */
const PAGE_SIZE = 50

/** Decode the handful of entities the catalogue actually emits. */
function decodeEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x2F;/g, '/')
    .replace(/&amp;/g, '&')
    .trim()
}

function attribute(chunk: string, name: string): string {
  const match = new RegExp(`${name}="([^"]*)"`).exec(chunk)
  return match ? decodeEntities(match[1] ?? '') : ''
}

/** Turn one `<article data-package-card>` chunk into a result. */
function parseCard(chunk: string): CatalogPackageDto | null {
  const name = attribute(chunk, 'data-package-name')
  if (name.length === 0) return null

  const description = /class="packages-desc">([\s\S]*?)<\/p>/.exec(chunk)
  const copy = /data-copy-text="pi install ([^"]+)"/.exec(chunk)
  const date = Number(attribute(chunk, 'data-package-date'))

  return {
    name,
    description: description ? decodeEntities(description[1] ?? '') : '',
    types: attribute(chunk, 'data-package-types').split(/\s+/).filter(Boolean),
    downloads: Number(attribute(chunk, 'data-package-downloads')) || 0,
    updatedAt: Number.isFinite(date) && date > 0 ? new Date(date).toISOString() : '',
    // Fall back to the npm name, which is what the catalogue links to.
    source: copy ? copy[1] : `npm:${name}`,
    url: `${CATALOG_ORIGIN}/packages/${name}`
  }
}

/** Search the catalogue. `type` is `skill`, `extension`, or empty for all. */
export async function searchCatalog(
  query: string,
  type: string,
  page: number
): Promise<CatalogPageDto> {
  const url = new URL('/packages', CATALOG_ORIGIN)
  // The site's own filter field is `name` (there is no `q` parameter).
  if (query.trim().length > 0) url.searchParams.set('name', query.trim())
  if (type.length > 0) url.searchParams.set('type', type)
  if (page > 1) url.searchParams.set('page', String(page))

  const response = await fetch(url, {
    headers: { accept: 'text/html', 'user-agent': 'PiUI' }
  })
  if (!response.ok) {
    throw new Error(`The catalogue answered ${response.status} ${response.statusText}.`)
  }

  const html = await response.text()
  const chunks = html.split('data-package-card="true"').slice(1)
  const items = chunks.map(parseCard).filter((item): item is CatalogPackageDto => item !== null)

  // The footer reads "1-50 / 310 (of 5551)": the third number is the match
  // count for this filter, the bracketed one is every package on the site.
  const footer = /(\d+)\s*[-–]\s*(\d+)\s*\/\s*(\d+)\s*\(of\s*(\d+)\)/.exec(html)
  const total = footer ? Number(footer[3]) : items.length

  return { items, page, pageSize: PAGE_SIZE, total }
}

/** Package manager bound to the current agent directory. */
async function managerFor(cwd: string): Promise<DefaultPackageManager> {
  const agentDir = getAgentDir()
  const settingsManager = await SettingsManager.create(cwd, agentDir)
  return new DefaultPackageManager({ cwd, agentDir, settingsManager })
}

/** Sources configured in settings, with their install scope. */
export async function listInstalledPackages(cwd: string): Promise<InstalledPackageDto[]> {
  const manager = await managerFor(cwd)
  return manager.listConfiguredPackages().map((entry) => ({
    source: entry.source,
    scope: entry.scope,
    filtered: entry.filtered
  }))
}

/** Install a package and persist it into settings. */
export async function installPackage(
  cwd: string,
  source: string,
  onProgress: (message: string) => void
): Promise<void> {
  const manager = await managerFor(cwd)
  manager.setProgressCallback((event) => {
    if (event.message) onProgress(event.message)
  })
  try {
    await manager.installAndPersist(source)
  } finally {
    manager.setProgressCallback(undefined)
  }
}

/** Remove a package and drop it from settings. */
export async function removePackage(cwd: string, source: string): Promise<void> {
  const manager = await managerFor(cwd)
  await manager.removeAndPersist(source)
}
