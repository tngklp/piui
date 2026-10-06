import { useEffect, useRef } from 'react'
import type { ChatBlockDto, ChatItemDto } from '@shared/ipc'
import { summarizeToolArguments } from '../lib/format'
import { usePiUi } from '../store'
import { DiffView } from './DiffView'
import { Markdown } from './Markdown'

function ToolCallBlock({ block }: { block: Extract<ChatBlockDto, { type: 'toolCall' }> }) {
  const summary = summarizeToolArguments(block.arguments)
  let body: string
  try {
    body = JSON.stringify(block.arguments, null, 2)
  } catch {
    body = String(block.arguments)
  }

  return (
    <details className="tool">
      <summary className="tool__summary">
        <span className="tool__badge">tool</span>
        <span className="tool__name">{block.name}</span>
        {summary ? <code className="tool__args">{summary}</code> : null}
      </summary>
      <pre className="tool__body">{body}</pre>
    </details>
  )
}

function AssistantMessage({ item }: { item: Extract<ChatItemDto, { kind: 'assistant' }> }) {
  return (
    <div className="message message--assistant">
      {item.blocks.map((block, index) => {
        if (block.type === 'text') {
          return <Markdown text={block.text} key={`text-${index}`} />
        }
        if (block.type === 'thinking') {
          return (
            <details className="thinking" key={`thinking-${index}`}>
              <summary className="thinking__summary">Thinking</summary>
              <pre className="thinking__body">{block.text}</pre>
            </details>
          )
        }
        return <ToolCallBlock block={block} key={block.id || `tool-${index}`} />
      })}
      {item.stopped ? <p className="message__meta">Stopped by user</p> : null}
      {item.error ? <p className="message__error">{item.error}</p> : null}
    </div>
  )
}

function TranscriptItem({ item }: { item: ChatItemDto }) {
  switch (item.kind) {
    case 'user':
      return (
        <div className="message message--user">
          <div className="prose">{item.text}</div>
          {item.imageCount > 0 ? (
            <p className="message__meta">
              {item.imageCount} image{item.imageCount === 1 ? '' : 's'}
            </p>
          ) : null}
        </div>
      )

    case 'assistant':
      return <AssistantMessage item={item} />

    case 'toolResult': {
      const diff = item.diff
      const hasCounts = item.addedLines !== undefined || item.removedLines !== undefined

      return (
        <details className={`result${item.isError ? ' result--error' : ''}`} open={Boolean(diff)}>
          <summary className="result__summary">
            <span className="tool__badge">{item.isError ? 'error' : 'result'}</span>
            <span className="tool__name">{item.toolName}</span>
            {item.filePath ? <code className="tool__args">{item.filePath}</code> : null}
            {hasCounts ? (
              <span className="diff__counts">
                {item.addedLines ? <span className="diff__added">+{item.addedLines}</span> : null}
                {item.removedLines ? (
                  <span className="diff__removed">−{item.removedLines}</span>
                ) : null}
              </span>
            ) : null}
          </summary>
          {diff ? (
            <DiffView diff={diff} />
          ) : (
            <pre className="result__body">{item.text || '(no output)'}</pre>
          )}
        </details>
      )
    }

    case 'bash':
      return (
        <div className="message message--bash">
          <code className="bash__command">$ {item.command}</code>
          <pre className="bash__output">{item.output || '(no output)'}</pre>
        </div>
      )

    default:
      return null
  }
}

export function Transcript() {
  const items = usePiUi((state) => state.items)
  const streaming = usePiUi((state) => state.streaming)
  const runningTools = usePiUi((state) => state.runningTools)
  const endRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [items, streaming, runningTools])

  const isEmpty = items.length === 0 && !streaming && runningTools.length === 0

  return (
    <div className="transcript">
      {isEmpty ? (
        <div className="empty">
          <p className="empty__title">Ask Pi to work on your project.</p>
          <p className="empty__hint">
            PiUI runs the Pi agent against the current working directory. Enter sends a prompt.
            While Pi is working, Enter steers the current turn and Ctrl+Enter queues a follow-up.
          </p>
        </div>
      ) : null}

      {items.map((item) => (
        <TranscriptItem item={item} key={item.id} />
      ))}

      {runningTools.map((tool) => (
        <div className="running" key={tool.id}>
          <span className="running__spinner" aria-hidden="true" />
          <span className="tool__name">{tool.name}</span>
          <span className="running__label">running…</span>
        </div>
      ))}

      {streaming ? (
        <div className="message message--assistant">
          {streaming.thinking ? (
            <details className="thinking" open>
              <summary className="thinking__summary">Thinking</summary>
              <pre className="thinking__body">{streaming.thinking}</pre>
            </details>
          ) : null}
          {streaming.text ? <Markdown text={streaming.text} /> : null}
          {streaming.tools.map((tool) => (
            <div className="tool tool--streaming" key={tool.id || tool.name}>
              <span className="tool__badge">tool</span>
              <span className="tool__name">{tool.name}</span>
            </div>
          ))}
          <span className="caret" aria-hidden="true" />
        </div>
      ) : null}

      <div ref={endRef} />
    </div>
  )
}
