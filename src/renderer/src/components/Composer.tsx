import { useState, type KeyboardEvent } from 'react'
import { usePiUi } from '../store'

type SendMode = 'prompt' | 'steer' | 'followUp'

export function Composer() {
  const [text, setText] = useState('')
  const status = usePiUi((state) => state.status)
  const busy = usePiUi((state) => state.busy)
  const send = usePiUi((state) => state.send)
  const abort = usePiUi((state) => state.abort)

  const streaming = status?.isStreaming ?? false

  const submit = async (mode: SendMode): Promise<void> => {
    const value = text
    setText('')
    await send(value, mode)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault()
      void abort()
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
    <div className="composer">
      <textarea
        className="composer__input"
        value={text}
        rows={3}
        spellCheck={false}
        placeholder={
          streaming
            ? 'Steer Pi — Enter steers now, Ctrl+Enter queues a follow-up…'
            : 'Ask Pi to build, explain, or fix something…'
        }
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
      />
      <div className="composer__actions">
        <span className="composer__hint">
          {streaming
            ? 'Enter steer · Ctrl+Enter follow-up · Esc stop'
            : 'Enter send · Shift+Enter newline'}
        </span>
        {streaming ? (
          <button className="button button--danger" onClick={() => void abort()}>
            Stop
          </button>
        ) : (
          <button
            className="button button--primary"
            onClick={() => void submit('prompt')}
            disabled={busy || text.trim().length === 0}
          >
            Send
          </button>
        )}
      </div>
    </div>
  )
}
