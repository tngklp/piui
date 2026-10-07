import { usePiUi } from '../store'
import { ChangesView } from './ChangesView'
import { ChatView } from './ChatView'
import { EditorView } from './editor/EditorView'

/** Main column: chat/editor tabs, the run state, and the active view. */
export function MainPane() {
  const mainTab = usePiUi((state) => state.mainTab)
  const setMainTab = usePiUi((state) => state.setMainTab)
  const status = usePiUi((state) => state.status)
  const openFiles = usePiUi((state) => state.openFiles)
  const changes = usePiUi((state) => state.changes)
  const rightOpen = usePiUi((state) => state.rightOpen)
  const toggleRight = usePiUi((state) => state.toggleRight)

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
            onClick={() => setMainTab('editor')}
            title={openFiles.length === 0 ? 'No file is open yet' : undefined}
          >
            Editor
          </button>
          <button
            className={`t${mainTab === 'changes' ? ' on' : ''}`}
            role="tab"
            aria-selected={mainTab === 'changes'}
            onClick={() => setMainTab('changes')}
            title="Files the agent changed, waiting for review"
          >
            Changes
            {changes.length > 0 ? <span className="t__count">{changes.length}</span> : null}
          </button>
        </div>

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

      {mainTab === 'editor' && openFiles.length > 0 ? (
        <EditorView />
      ) : mainTab === 'changes' ? (
        <ChangesView />
      ) : (
        <ChatView />
      )}
    </main>
  )
}
