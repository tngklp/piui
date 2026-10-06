import type { MaterialIconManifest } from './material-icon-types'
import manifest from './material-icons.json'

const icons = manifest as MaterialIconManifest

/** Icon definition name for a file, following Material Icon Theme's lookups. */
export function fileIconName(fileName: string): string {
  const lower = fileName.toLowerCase()

  const exact = icons.fileNames[lower]
  if (exact) return exact

  // Match the longest extension chain first ("d.ts" before "ts").
  const parts = lower.split('.')
  for (let index = 1; index < parts.length; index += 1) {
    const extension = parts.slice(index).join('.')
    const hit = icons.fileExtensions[extension]
    if (hit) return hit
  }

  return icons.file
}

/** Icon definition name for a folder, expanded or collapsed. */
export function folderIconName(folderName: string, expanded: boolean): string {
  const lower = folderName.toLowerCase()
  const named = expanded ? icons.folderNamesExpanded : icons.folderNames
  return named[lower] ?? (expanded ? icons.folderExpanded : icons.folder)
}

/**
 * URL for an icon, resolved relative to the document so it works both on the
 * dev server and under the `file://` protocol in a packaged build.
 */
export function iconUrl(name: string): string {
  return new URL(`material-icons/${name}.svg`, document.baseURI).href
}
