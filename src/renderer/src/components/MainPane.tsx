import type { ChatItemDto } from '@shared/ipc'
import { usePiUi } from '../store'
import { ChatView } from './ChatView'
import { EditorView } from './editor/EditorView'

/** Collapse a prompt into a short single-line session title. */
function titleFrom(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > 64 ? `${flat.slice(0, 64)}…` : flat || 'New session'
}

/** Main column: chat/editor tabs, the session title, and the active view. */
export function MainPane() {
  const mainTab = usePiUi((state) => state.mainTab)
  const setMainTab = usePiUi((state) => state.setMainTab)
  const status = usePiUi((state) => state.status)
  const items = usePiUi((state) => state.items)
  const openFiles = usePiUi((state) => state.openFiles)
  const rightOpen = usePiUi((state) => state.rightOpen)
  const toggleRight = usePiUi((state) => state.toggleRight)

  const firstUser = items.find(
    (item): item is Extract<ChatItemDto, { kind: 'user' }> => item.kind === 'user'
  )
  const title = status?.sessionName ?? (firstUser ? titleFrom(firstUser.text) : 'New session')
  const running = Boolean(status?.isStreaming)

  return (
    <main className="main">
      <div className="head">
        <div className="tabs main-tabs" role="tablist">
          <button
            className={`t${mainTab === 'chat' ? ' on' : ''}`}
            role="tab"
            aria-selected={mainTab === 'chat'}
            onClick={() => setMainTab('chat')}
          >
            Chat
          </button>
          <button
            className={`t${mainTab === 'editor' ? ' on' : ''}`}
            role="tab"
            aria-selected={mainTab === 'editor'}
            disabled={openFiles.length === 0}
            title={openFiles.length === 0 ? 'Open a file from the Files tab' : undefined}
            onClick={() => setMainTab('editor')}
          >
            Editor
          </button>
        </div>

        <h1>{title}</h1>
        <span className="sp" />
        <span className="chip lil">{running ? 'Running' : 'Idle'}</span>
        {rightOpen ? null : (
          <button
            className="ibtn"
            onClick={toggleRight}
            title="Show right panel"
            aria-label="Show right panel"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor">
              <rect x="1.5" y="2.5" width="13" height="11" rx="2" />
              <path d="M10 2.5v11" />
            </svg>
          </button>
        )}
      </div>

      {mainTab === 'editor' && openFiles.length > 0 ? <EditorView /> : <ChatView />}
    </main>
  )
}
