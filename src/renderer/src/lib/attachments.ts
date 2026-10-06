/**
 * Image attachments for the composer.
 *
 * PiUI hands the agent base64 image blocks (`PromptInput.images`), so a picked
 * file is read as a data URL and split into its media type and payload. The data
 * URL is kept too, purely so the composer can show a thumbnail without building
 * a second copy of the bytes.
 */

/** An image waiting to be sent with the next message. */
export interface Attachment {
  /** Stable key for React, and the id used when removing it. */
  id: string
  name: string
  mimeType: string
  /** Base64 payload, without the data URL prefix. */
  data: string
  /** The original data URL, used as the thumbnail source. */
  dataUrl: string
}

/** Refuse anything the model providers would reject anyway. */
const MAX_BYTES = 8 * 1024 * 1024

let attachmentId = 0

/** Read one picked file into an attachment. */
export async function readAttachment(file: File): Promise<Attachment> {
  if (!file.type.startsWith('image/')) {
    throw new Error(`${file.name} is not an image.`)
  }
  if (file.size > MAX_BYTES) {
    throw new Error(`${file.name} is larger than ${Math.round(MAX_BYTES / 1024 / 1024)} MB.`)
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`))
    reader.readAsDataURL(file)
  })

  const separator = dataUrl.indexOf(',')
  if (separator < 0) throw new Error(`Could not read ${file.name}.`)

  attachmentId += 1
  return {
    id: `att-${attachmentId}`,
    name: file.name,
    mimeType: file.type,
    data: dataUrl.slice(separator + 1),
    dataUrl
  }
}

/** Read a whole selection, collecting per-file failures instead of aborting. */
export async function readAttachments(
  files: FileList | File[]
): Promise<{ added: Attachment[]; errors: string[] }> {
  const added: Attachment[] = []
  const errors: string[] = []

  for (const file of Array.from(files)) {
    try {
      added.push(await readAttachment(file))
    } catch (cause) {
      errors.push(cause instanceof Error ? cause.message : String(cause))
    }
  }

  return { added, errors }
}

/** The shape the agent expects. */
export function toPromptImages(
  attachments: Attachment[]
): { type: 'image'; data: string; mimeType: string }[] {
  return attachments.map((attachment) => ({
    type: 'image' as const,
    data: attachment.data,
    mimeType: attachment.mimeType
  }))
}
