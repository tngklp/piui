import { useMemo, useState, type KeyboardEvent } from 'react'
import type { ThinkingLevelDto } from '@shared/ipc'
import { usePiUi } from '../store'
import { Select, type SelectOption } from './Select'

interface Command {
  name: string
  description: string
  run: () => void
}

/** Prompt input with a slash-command menu, model picker, and send/stop. */
export function Composer() {
  const [text, setText] = useState('')
  const [cursor, setCursor] = useState(0)

  const status = usePiUi((state) => state.status)
  const models = usePiUi((state) => state.models)
  const busy = usePiUi((state) => state.busy)
  const send = usePiUi((state) => state.send)
  const abort = usePiUi((state) => state.abort)
  const compact = usePiUi((state) => state.compact)
  const newSession = usePiUi((state) => state.newSession)
  const forkSession = usePiUi((state) => state.forkSession)
  const selectModel = usePiUi((state) => state.selectModel)
  const selectThinking = usePiUi((state) => state.selectThinking)

  const streaming = status?.isStreaming ?? false

  const commands = useMemo<Command[]>(
    () => [
      { name: '/compact', description: 'Summarize earlier turns', run: () => void compact() },
      { name: '/fork', description: 'Duplicate this session', run: () => void forkSession() },
      { name: '/new', description: 'Start a new session', run: () => void newSession() }
    ],
    [compact, forkSession, newSession]
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
    setText('')
    await send(value, mode)
  }

  const runCommand = (command: Command): void => {
    setText('')
    command.run()
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

    if (event.key !== 'Enter' || event.shiftKey) return
    event.preventDefault()

    if (event.ctrlKey || event.metaKey) {
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
              No matching command. Skill and template commands from Pi are sent as prompts.
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
              </button>
            ))
          )}
        </div>
      ) : null}

      <div className="box">
        <textarea
          value={text}
          rows={2}
          spellCheck={false}
          placeholder={
            streaming
              ? 'Steer Pi — Enter steers, Ctrl+Enter queues a follow-up'
              : 'Message Pi. Type / for commands'
          }
          onChange={(event) => {
            setText(event.target.value)
            setCursor(0)
          }}
          onKeyDown={onKeyDown}
        />

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
            title="Model"
            placeholder="No model"
          />

          <Select
            value={thinking}
            options={thinkingOptions}
            onChange={(value) => void selectThinking(value)}
            disabled={!status?.supportsThinking}
            direction="up"
            title="Reasoning level"
            placeholder="off"
          />

          <span className="sp" />

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
              disabled={busy || text.trim().length === 0}
              aria-label="Send"
              title="Send (Enter)"
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
