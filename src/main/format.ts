/**
 * Format-on-save, backed by Prettier.
 *
 * Prettier ships as a runtime dependency so an installed build can format
 * without a Node toolchain. It is loaded lazily: a save that never asks for
 * formatting should not pay for importing it.
 *
 * A file whose language Prettier cannot infer is left alone rather than treated
 * as an error — the editor writes the buffer unchanged, which is what the user
 * expects from saving a `.env` or a `.log`.
 */

export interface FormatResultDto {
  /** Formatted text, or null when the file was left as it was. */
  text: string | null
  /** Why nothing was formatted, when that is worth telling the user. */
  error: string | null
}

const EMPTY: FormatResultDto = { text: null, error: null }

let prettierModule: Promise<typeof import('prettier')> | null = null

/** Import Prettier once, on first use. */
function prettier(): Promise<typeof import('prettier')> {
  prettierModule ??= import('prettier')
  return prettierModule
}

/**
 * Format `content` as if it were `path`. Returns `text: null` when there is no
 * parser for that file, which callers should treat as "save it as it is".
 */
export async function formatDocument(path: string, content: string): Promise<FormatResultDto> {
  if (path.length === 0) return EMPTY

  try {
    const engine = await prettier()

    const info = await engine.getFileInfo(path)
    if (info.ignored || info.inferredParser === null) return EMPTY

    // The project's own configuration wins over Prettier's defaults.
    const formatted = await engine.format(content, {
      ...(await engine.resolveConfig(path)),
      filepath: path,
      parser: info.inferredParser
    })

    if (formatted === content) return EMPTY
    return { text: formatted, error: null }
  } catch (cause) {
    return { text: null, error: cause instanceof Error ? cause.message : String(cause) }
  }
}
