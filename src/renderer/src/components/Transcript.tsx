import { useEffect, useRef, useState } from 'react'
import type { ChatBlockDto, ChatItemDto, UiRequestDto } from '@shared/ipc'
import { formatDuration, summarizeToolArguments } from '../lib/format'
import { usePiUi } from '../store'
import { Collapsible } from './Collapsible'
import { DiffView } from './DiffView'
import { Markdown } from './Markdown'

/** Reasoning block with an animated open/close. */
function Thinking({ text, live }: { text: string; live?: boolean }) {
  const expandThinking = usePiUi((state) => state.prefs.expandThinking)
  const [open, setOpen] = useState(Boolean(live) || expandThinking)

  return (
    <div className="think">
      <button
        className="think__summary"
        aria-expanded={open}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        <span className={`chev${open ? ' o' : ''}`}>›</span>
        {live ? 'Thinking…' : 'Thought'}
      </button>
      <Collapsible open={open}>
        <pre>{text}</pre>
      </Collapsible>
    </div>
  )
}

/** Tool call and its result in a single card. */
function ToolCard({ item }: { item: Extract<ChatItemDto, { kind: 'tool' }> }) {
  const expandToolOutput = usePiUi((state) => state.prefs.expandToolOutput)
  const [showCommand, setShowCommand] = useState(expandToolOutput)

  const args = (item.arguments ?? {}) as Record<string, unknown>
  const command = typeof args.command === 'string' ? args.command : null
  const summary = command ?? item.filePath ?? summarizeToolArguments(item.arguments)

  return (
    <div className="card">
      <div className="hd">
        <span className={`tag${item.isError ? ' bad' : ''}`}>{item.name}</span>

        {summary ? (
          <button
            className="cmd"
            title={command ? `${summary}\n\nClick to expand` : summary}
            onClick={() => setShowCommand((was) => !was)}
          >
            <span className="cmd__text">{summary}</span>
          </button>
        ) : null}

        <span className="hd__end">
          {item.addedLines ? <span className="ok">+{item.addedLines}</span> : null}
          {item.removedLines ? <span className="del">−{item.removedLines}</span> : null}
          {item.running ? (
            <span className="spinner" />
          ) : (
            <>
              <span className={item.isError ? 'del' : 'ok'}>{item.isError ? '✕' : '✓'}</span>
              {item.durationMs ? (
                <span className="took">{formatDuration(item.durationMs)}</span>
              ) : null}
            </>
          )}
        </span>
      </div>

      {showCommand && command ? <pre className="cmd__full">{command}</pre> : null}

      {item.diff ? <DiffView diff={item.diff} /> : null}
      {!item.diff && item.text ? <pre className="out">{item.text}</pre> : null}
      {!item.diff && !item.text && item.running ? <pre className="out">running…</pre> : null}
    </div>
  )
}

function AssistantItem({ item }: { item: Extract<ChatItemDto, { kind: 'assistant' }> }) {
  return (
    <div className="asst">
      {item.blocks.map((block: ChatBlockDto, index) => {
        if (block.type === 'text') {
          return <Markdown text={block.text} key={`text-${index}`} />
        }
        if (block.type === 'thinking') {
          return <Thinking text={block.text} key={`think-${index}`} />
        }
        return null
      })}
      {item.stopped ? <p className="note">Stopped by user</p> : null}
      {item.error ? <p className="note bad">{item.error}</p> : null}
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
            <div className="user__meta">
              {item.imageCount} image{item.imageCount === 1 ? '' : 's'}
            </div>
          ) : null}
        </div>
      )

    case 'assistant':
      return <AssistantItem item={item} />

    case 'tool':
      return <ToolCard item={item} />

    case 'bash':
      return (
        <div className="card">
          <div className="hd">
            <span className="tag">bash</span>
            <span className="cmd__text mono">{item.command}</span>
            <span className="hd__end">
              <span className={item.exitCode === 0 ? 'ok' : 'del'}>
                {item.exitCode === 0 ? '✓' : `exit ${item.exitCode ?? '?'}`}
              </span>
            </span>
          </div>
          <pre className="out">{item.output || '(no output)'}</pre>
        </div>
      )

    default:
      return null
  }
}

/** Inline approval prompt for a tool the agent wants to run. */
function ApprovalCard({ request }: { request: Extract<UiRequestDto, { method: 'approval' }> }) {
  const respond = usePiUi((state) => state.respondToDialog)

  return (
    <div className="card appro">
      <div className="hd">
        <span className="tag">{request.tool}</span>
        <span className="appro__title">{request.title}</span>
        <span className="hd__end">
          <span className="appro__wait">waiting</span>
        </span>
      </div>

      <pre className="cmd__full">{request.detail}</pre>

      <div className="appro__acts">
        <button
          className="b pri"
          autoFocus
          onClick={() => void respond({ id: request.id, decision: 'allow' })}
        >
          Allow
        </button>
        <button className="b" onClick={() => void respond({ id: request.id, decision: 'deny' })}>
          Deny
        </button>
      </div>
    </div>
  )
}

/** Scrolling transcript with a live streaming bubble. */
export function Transcript() {
  const items = usePiUi((state) => state.items)
  const streaming = usePiUi((state) => state.streaming)
  const runningTools = usePiUi((state) => state.runningTools)
  const dialog = usePiUi((state) => state.dialog)
  const endRef = useRef<HTMLDivElement | null>(null)
  const colRef = useRef<HTMLDivElement | null>(null)
  /** Whether the transcript was pinned to the bottom before the last update. */
  const pinned = useRef(true)

  // Track the scroll position of the surrounding `.scroll` container so new
  // output only follows the bottom when the user is already there.
  useEffect(() => {
    const scroller = colRef.current?.closest('.scroll')
    if (!scroller) return

    const onScroll = (): void => {
      pinned.current = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 64
    }

    onScroll()
    scroller.addEventListener('scroll', onScroll, { passive: true })
    return () => scroller.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (!pinned.current) return
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [items, streaming, runningTools, dialog])

  const isEmpty = items.length === 0 && !streaming && runningTools.length === 0

  return (
    <div className="col" ref={colRef}>
      {isEmpty ? (
        <div className="empty">
          <b>Ask Pi to work on your project.</b>
          Message Pi below. Type <code>/</code> for commands.
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
            <Thinking text={streaming.thinking} live={streaming.thinkingLive} />
          ) : null}
          {streaming.text ? <Markdown text={streaming.text} /> : null}
          {streaming.tools.map((tool) => (
            <div className="card" key={tool.id || tool.name}>
              <div className="hd">
                <span className="tag">{tool.name}</span>
                <span className="cmd__text mono">{summarizeToolArguments(tool.argsText)}</span>
                <span className="hd__end">
                  <span className="spinner" />
                </span>
              </div>
            </div>
          ))}
          <p className="stream" />
        </div>
      ) : null}

      {dialog && dialog.method === 'approval' ? <ApprovalCard request={dialog} /> : null}

      <div ref={endRef} />
    </div>
  )
}
