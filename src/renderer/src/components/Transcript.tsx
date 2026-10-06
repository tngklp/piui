import { useEffect, useRef } from 'react'
import type { ChatBlockDto, ChatItemDto } from '@shared/ipc'
import { summarizeToolArguments } from '../lib/format'
import { usePiUi } from '../store'
import { DiffView } from './DiffView'
import { Markdown } from './Markdown'

function ToolCallCard({ block }: { block: Extract<ChatBlockDto, { type: 'toolCall' }> }) {
  const summary = summarizeToolArguments(block.arguments)

  return (
    <div className="card">
      <div className="hd">
        <span className="tag">{block.name}</span>
        {summary ? <span className="path">{summary}</span> : null}
      </div>
    </div>
  )
}

function AssistantItem({ item }: { item: Extract<ChatItemDto, { kind: 'assistant' }> }) {
  return (
    <div className="asst">
      {item.blocks.map((block, index) => {
        if (block.type === 'text') {
          return <Markdown text={block.text} key={`text-${index}`} />
        }
        if (block.type === 'thinking') {
          return (
            <details className="think" key={`think-${index}`}>
              <summary>Thought</summary>
              <pre>{block.text}</pre>
            </details>
          )
        }
        return <ToolCallCard block={block} key={block.id || `tool-${index}`} />
      })}
      {item.stopped ? <p style={{ color: 'var(--dim)', fontSize: 13 }}>Stopped by user</p> : null}
      {item.error ? <p style={{ color: 'var(--del)', fontSize: 13 }}>{item.error}</p> : null}
    </div>
  )
}

function ToolResultCard({ item }: { item: Extract<ChatItemDto, { kind: 'toolResult' }> }) {
  const diff = item.diff
  const hasCounts = item.addedLines !== undefined || item.removedLines !== undefined

  return (
    <div className="card">
      <div className="hd">
        <span className={`tag${item.isError ? ' bad' : ''}`}>{item.toolName}</span>
        {item.filePath ? <span className="path">{item.filePath}</span> : null}
        <span className="sp" />
        {hasCounts ? (
          <>
            {item.addedLines ? <span className="ok">+{item.addedLines}</span> : null}
            {item.removedLines ? (
              <span style={{ color: 'var(--del)' }}>−{item.removedLines}</span>
            ) : null}
          </>
        ) : item.isError ? (
          <span style={{ color: 'var(--del)' }}>failed</span>
        ) : (
          <span className="ok">✓</span>
        )}
      </div>
      {diff ? <DiffView diff={diff} /> : <pre className="out">{item.text || '(no output)'}</pre>}
    </div>
  )
}

function TranscriptItem({ item }: { item: ChatItemDto }) {
  switch (item.kind) {
    case 'user':
      return (
        <div className="user">
          {item.text}
          {item.imageCount > 0 ? (
            <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
              {item.imageCount} image{item.imageCount === 1 ? '' : 's'}
            </div>
          ) : null}
        </div>
      )

    case 'assistant':
      return <AssistantItem item={item} />

    case 'toolResult':
      return <ToolResultCard item={item} />

    case 'bash':
      return (
        <div className="card">
          <div className="hd">
            <span className="tag">bash</span>
            <b className="mono" style={{ fontWeight: 500 }}>
              {item.command}
            </b>
            <span className="sp" />
            <span className="ok">{item.exitCode === 0 ? '✓' : `exit ${item.exitCode ?? '?'}`}</span>
          </div>
          <pre className="out">{item.output || '(no output)'}</pre>
        </div>
      )

    default:
      return null
  }
}

/** Scrolling transcript with a live streaming bubble. */
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
    <div className="col">
      {isEmpty ? (
        <div className="empty">
          <b>Ask Pi to work on your project.</b>
          Message Pi below. Type <code>/</code> for commands, <code>!</code> to run a shell command.
        </div>
      ) : null}

      {items.map((item) => (
        <TranscriptItem item={item} key={item.id} />
      ))}

      {runningTools.map((tool) => (
        <div className="activity" key={tool.id}>
          <span className="spinner" />
          <span className="mono">{tool.name}</span>
          <span>running…</span>
        </div>
      ))}

      {streaming ? (
        <div className="asst">
          {streaming.thinking ? (
            <details className="think" open>
              <summary>Thinking</summary>
              <pre>{streaming.thinking}</pre>
            </details>
          ) : null}
          {streaming.text ? <Markdown text={streaming.text} /> : null}
          {streaming.tools.map((tool) => (
            <div className="card" key={tool.id || tool.name}>
              <div className="hd">
                <span className="tag">{tool.name}</span>
                <span className="path">{summarizeToolArguments(tool.argsText)}</span>
              </div>
            </div>
          ))}
          <p className="stream" />
        </div>
      ) : null}

      <div ref={endRef} />
    </div>
  )
}
