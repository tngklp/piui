import { randomUUID } from 'node:crypto'
import type { NoticeDto, UiRequestDto, UiResponseDto } from '@shared/ipc'
import type { ExtensionUIContext } from '@earendil-works/pi-coding-agent'

/**
 * Sink the extension UI host writes into. Implemented by the main process,
 * which forwards the calls to the renderer.
 */
export interface UiTransport {
  /** Ask the user a question and resolve with their answer. */
  ask(request: UiRequestDto): Promise<UiResponseDto>
  notify(notice: NoticeDto): void
  setStatus(key: string, text: string | undefined): void
  setWidget(
    key: string,
    lines: string[] | undefined,
    placement: 'aboveEditor' | 'belowEditor'
  ): void
  setTitle(title: string): void
  setEditorText(text: string): void
  log(message: string): void
}

const NOOP = (): void => {}

/**
 * Build an `ExtensionUIContext` for the PiUI GUI.
 *
 * PiUI presents the same surface as Pi's RPC mode: notifications, status,
 * widgets, title, and editor text are forwarded to the renderer, and
 * interactive dialogs are answered by a renderer modal.
 *
 * TUI-only members (terminal input, custom components, themes, footer/header)
 * are intentionally unsupported, matching Pi's own RPC-mode limitations.
 */
export function createUiHost(transport: UiTransport): ExtensionUIContext {
  const unsupported = (member: string): void => {
    transport.log(`Extension UI '${member}' is not supported in PiUI yet.`)
  }

  const host = {
    select: async (title: string, options: string[]): Promise<string | undefined> => {
      const response = await transport.ask({ id: randomUUID(), method: 'select', title, options })
      return 'value' in response ? response.value : undefined
    },
    confirm: async (title: string, message: string): Promise<boolean> => {
      const response = await transport.ask({ id: randomUUID(), method: 'confirm', title, message })
      return 'confirmed' in response ? response.confirmed : false
    },
    input: async (title: string, placeholder?: string): Promise<string | undefined> => {
      const response = await transport.ask({
        id: randomUUID(),
        method: 'input',
        title,
        placeholder
      })
      return 'value' in response ? response.value : undefined
    },
    editor: async (title: string, prefill?: string): Promise<string | undefined> => {
      const response = await transport.ask({ id: randomUUID(), method: 'editor', title, prefill })
      return 'value' in response ? response.value : undefined
    },
    notify: (message: string, type: 'info' | 'warning' | 'error' = 'info'): void => {
      transport.notify({ level: type, message })
    },
    onTerminalInput: (): (() => void) => NOOP,
    setStatus: (key: string, text: string | undefined): void => {
      transport.setStatus(key, text)
    },
    setWorkingMessage: NOOP,
    setWorkingVisible: NOOP,
    setWorkingIndicator: NOOP,
    setHiddenThinkingLabel: NOOP,
    setWidget: (key: string, content?: unknown): void => {
      if (Array.isArray(content)) {
        transport.setWidget(key, content as string[], 'aboveEditor')
      } else {
        transport.setWidget(key, undefined, 'aboveEditor')
      }
    },
    setFooter: NOOP,
    setHeader: NOOP,
    setTitle: (title: string): void => {
      transport.setTitle(title)
    },
    custom: async <T>(): Promise<T> => {
      unsupported('custom')
      return undefined as T
    },
    pasteToEditor: (text: string): void => {
      transport.setEditorText(text)
    },
    setEditorText: (text: string): void => {
      transport.setEditorText(text)
    },
    getEditorText: (): string => '',
    addAutocompleteProvider: NOOP,
    setEditorComponent: NOOP,
    getEditorComponent: (): undefined => undefined,
    getAllThemes: (): { name: string; path: string | undefined }[] => [],
    getTheme: (): undefined => undefined,
    setTheme: (): { success: boolean; error?: string } => ({
      success: false,
      error: 'Theme switching is handled by PiUI, not by Pi themes.'
    }),
    getToolsExpanded: (): boolean => false,
    setToolsExpanded: NOOP
  }

  return host as unknown as ExtensionUIContext
}
