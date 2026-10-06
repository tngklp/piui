import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { CommandDto, ThinkingLevelDto } from '@shared/ipc'
import { usePiUi } from '../store'
import { readAttachments, toPromptImages, type Attachment } from '../lib/attachments'
import { Select, type SelectOption } from './Select'

/** A row in the slash menu. */
interface Command extends CommandDto {
  /** Omitted for discovered commands, which are sent as prompts. */
  run?: () => void
}

/** Prompt input with a slash-command menu, model picker, and send/stop. */
export function Composer() {
  const [text, setText] = useState('')
  const [cursor, setCursor] = useState(0)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [attachError, setAttachError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const status = usePiUi((state) => state.status)
  const models = usePiUi((state) => state.models)
  const discovered = usePiUi((state) => state.commands)
  const busy = usePiUi((state) => state.busy)
  const send = usePiUi((state) => state.send)
  const abort = usePiUi((state) => state.abort)
  const compact = usePiUi((state) => state.compact)
  const newSession = usePiUi((state) => state.newSession)
  const forkSession = usePiUi((state) => state.forkSession)
  const selectModel = usePiUi((state) => state.selectModel)
  const selectThinking = usePiUi((state) => state.selectThinking)
  const sendOnEnter = usePiUi((state) => state.prefs.sendOnEnter)

  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  const streaming = status?.isStreaming ?? false

  // PiUI's own commands run locally; skills and prompt templates are sent as a
  // normal message, which Pi expands before calling the model.
  const commands = useMemo<Command[]>(
    () => [
      {
        name: '/compact',
        description: 'Summarize earlier turns',
        kind: 'builtin',
        run: () => void compact()
      },
      {
        name: '/fork',
        description: 'Duplicate this session',
        kind: 'builtin',
        run: () => void forkSession()
      },
      {
        name: '/new',
        description: 'Start a new session',
        kind: 'builtin',
        run: () => void newSession()
      },
      ...discovered.map<Command>((command) => ({ ...command }))
    ],
    [compact, forkSession, newSession, discovered]
  )

  const slashOpen = text.startsWith('/') && !/\s/.test(text)
  const matches = slashOpen
    ? commands.filter((command) => command.name.startsWith(text.toLowerCase()))
    : []

  const modelKey = status?.model ? `${status.model.provider}/${status.model.id}` : ''
  const modelOptions: SelectOption<string>[] = models.map((model) => ({
    value: `${model.provider}/${model.id}`,
    label: model.name
  }))

  const thinking = status?.thinkingLevel ?? 'off'
  const thinkingOptions: SelectOption<ThinkingLevelDto>[] = (
    status?.availableThinkingLevels ?? ['off']
  ).map((level) => ({ value: level, label: level }))

  const submit = async (mode: 'prompt' | 'steer' | 'followUp'): Promise<void> => {
    const value = text
    // Attachments only travel with a prompt; steering and follow-ups are text.
    const images = mode === 'prompt' ? toPromptImages(attachments) : undefined
    setText('')
    if (mode === 'prompt') setAttachments([])
    await send(value, mode, images)
  }

  const pickFiles = async (files: FileList | null): Promise<void> => {
    if (!files || files.length === 0) return
    const { added, errors } = await readAttachments(files)
    setAttachError(errors.length > 0 ? errors.join(' ') : null)
    if (added.length > 0) setAttachments((current) => [...current, ...added])
    // Let the same file be picked again after being removed.
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const removeAttachment = (id: string): void =>
    setAttachments((current) => current.filter((attachment) => attachment.id !== id))

  const runCommand = (command: Command): void => {
    if (command.run) {
      setText('')
      command.run()
      return
    }

    // A discovered command with no arguments can go straight to the agent;
    // otherwise leave the caret after the name so the user can add them.
    const needsArgs = (command.argumentHint ?? '').trim().length > 0
    const next = needsArgs ? `${command.name} ` : command.name
    setText(next)

    if (needsArgs) {
      requestAnimationFrame(() => {
        inputRef.current?.focus()
        inputRef.current?.setSelectionRange(next.length, next.length)
      })
      return
    }
    void send(next, streaming ? 'steer' : 'prompt')
    setText('')
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (slashOpen && matches.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setCursor((current) => (current + 1) % matches.length)
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setCursor((current) => (current - 1 + matches.length) % matches.length)
        return
      }
      if (event.key === 'Enter') {
        event.preventDefault()
        const command = matches[cursor] ?? matches[0]
        if (command) runCommand(command)
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        setText('')
        return
      }
    }

    if (event.key === 'Escape') {
      if (streaming) {
        event.preventDefault()
        void abort()
      }
      return
    }

    if (event.key !== 'Enter') return

    // Enter sends unless the user asked for newlines, in which case Ctrl/Cmd
    // does. Anything else is a line break, so leave it to the textarea.
    const modifier = event.ctrlKey || event.metaKey
    const sends = sendOnEnter ? !event.shiftKey : modifier
    if (!sends || event.shiftKey) return
    event.preventDefault()

    if (modifier) {
      void submit(streaming ? 'followUp' : 'prompt')
      return
    }
    void submit(streaming ? 'steer' : 'prompt')
  }

  return (
    <div className="comp">
      {slashOpen ? (
        <div className="slash">
          {matches.length === 0 ? (
            <div className="none">
              No matching command. Type / to see PiUI's commands, plus any skills and prompt
              templates installed for this workspace.
            </div>
          ) : (
            matches.map((command, index) => (
              <button
                className={index === cursor ? 'sel' : ''}
                key={command.name}
                onMouseEnter={() => setCursor(index)}
                onClick={() => runCommand(command)}
              >
                <b className="mono">{command.name}</b>
                <em>{command.description}</em>
                <span className={`kind ${command.kind}`}>{command.kind}</span>
              </button>
            ))
          )}
        </div>
      ) : null}

      <div className="box">
        <textarea
          ref={inputRef}
          value={text}
          rows={2}
          spellCheck={false}
          placeholder={
            streaming
              ? `Steer Pi — ${sendOnEnter ? 'Enter steers' : 'Ctrl+Enter steers'}, Ctrl+Enter queues a follow-up`
              : 'Message Pi. Type / for commands'
          }
          onChange={(event) => {
            setText(event.target.value)
            setCursor(0)
          }}
          onKeyDown={onKeyDown}
        />

        {attachments.length > 0 || attachError ? (
          <div className="attach">
            {attachments.map((attachment) => (
              <span className="attach__item" key={attachment.id}>
                <img src={attachment.dataUrl} alt="" title={attachment.name} />
                <button
                  type="button"
                  className="attach__x"
                  title={`Remove ${attachment.name}`}
                  aria-label={`Remove ${attachment.name}`}
                  onClick={() => removeAttachment(attachment.id)}
                >
                  ✕
                </button>
              </span>
            ))}
            {attachError ? <span className="attach__err">{attachError}</span> : null}
          </div>
        ) : null}

        <div className="tools">
          <Select
            value={modelKey}
            options={modelOptions}
            onChange={(value) => {
              const separator = value.indexOf('/')
              if (separator > 0)
                void selectModel(value.slice(0, separator), value.slice(separator + 1))
            }}
            disabled={models.length === 0}
            direction="up"
            hideCaret
            title="Model"
            placeholder="No model"
          />

          <Select
            value={thinking}
            options={thinkingOptions}
            onChange={(value) => void selectThinking(value)}
            disabled={!status?.supportsThinking}
            direction="up"
            hideCaret
            title="Reasoning level"
            placeholder="off"
          />

          <span className="sp" />

          <input
            ref={fileInputRef}
            className="attach__input"
            type="file"
            accept="image/*"
            multiple
            tabIndex={-1}
            aria-hidden="true"
            onChange={(event) => void pickFiles(event.target.files)}
          />

          <button
            type="button"
            className="ibtn attach__add"
            title="Add an image to the prompt"
            aria-label="Add an image to the prompt"
            onClick={() => fileInputRef.current?.click()}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            >
              <path d="M8 3.5v9M3.5 8h9" />
            </svg>
          </button>

          {streaming ? (
            <button
              className="send stop"
              onClick={() => void abort()}
              aria-label="Stop"
              title="Stop (Esc)"
            >
              <svg width="14" height="14" viewBox="0 0 14 14">
                <rect x="2" y="2" width="10" height="10" rx="2" fill="currentColor" />
              </svg>
            </button>
          ) : (
            <button
              className="send"
              onClick={() => void submit('prompt')}
              disabled={busy || (text.trim().length === 0 && attachments.length === 0)}
              aria-label="Send"
              title={sendOnEnter ? 'Send (Enter)' : 'Send (Ctrl+Enter)'}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
