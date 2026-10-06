/** Shape of the trimmed Material Icon Theme manifest bundled with the renderer. */
export interface MaterialIconManifest {
  file: string
  folder: string
  folderExpanded: string
  fileNames: Record<string, string>
  fileExtensions: Record<string, string>
  folderNames: Record<string, string>
  folderNamesExpanded: Record<string, string>
}
