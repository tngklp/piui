/**
 * URL for a local file, for things the file IPC cannot carry.
 *
 * Reading a file over IPC returns text, which is fine for the editor but useless
 * for an image or a PDF. Those are streamed instead through the `piui-file`
 * scheme registered in the main process. The path is a query parameter so that
 * a Windows drive letter or a path separator never has to survive URL parsing.
 */
const FILE_SCHEME = 'piui-file'

/** Absolute path -> URL the renderer can put in `src`. */
export function fileUrl(path: string): string {
  return `${FILE_SCHEME}://local/?path=${encodeURIComponent(path)}`
}
