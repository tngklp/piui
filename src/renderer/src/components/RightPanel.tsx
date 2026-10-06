import type { PointerEvent } from 'react'
import { usePiUi, type RightTab } from '../store'
import { FilesPanel } from './panels/FilesPanel'
import { MonitorPanel } from './panels/MonitorPanel'
import { TerminalPanel } from './panels/TerminalPanel'

const TABS: { id: RightTab; label: string }[] = [
  { id: 'files', label: 'Files' },
  { id: 'term', label: 'Terminal' },
  { id: 'mon', label: 'Monitor' }
]

interface RightPanelProps {
  onGripDown: (event: PointerEvent<HTMLDivElement>) => void
}

/** Tabbed, resizable side panel with its own collapse control. */
export function RightPanel({ onGripDown }: RightPanelProps) {
  const tab = usePiUi((state) => state.rightTab)
  const setTab = usePiUi((state) => state.setRightTab)
  const monitor = usePiUi((state) => state.monitor)
  const toggleRight = usePiUi((state) => state.toggleRight)

  const live = tab === 'mon' && monitor?.engine.available

  return (
    <aside className="right">
      <div
        className="grip"
        onPointerDown={onGripDown}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panel"
      />

      <div className="tabs" role="tablist">
        {TABS.map((entry) => (
          <button
            className={`t${tab === entry.id ? ' on' : ''}`}
            key={entry.id}
            role="tab"
            aria-selected={tab === entry.id}
            onClick={() => setTab(entry.id)}
          >
            {entry.label}
            {entry.id === 'mon' && live ? <i className="lv" /> : null}
          </button>
        ))}

        <span className="sp" />
        <button
          className="ibtn"
          onClick={toggleRight}
          title="Hide right panel"
          aria-label="Hide right panel"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor">
            <path d="M6 4l4 4-4 4" />
          </svg>
        </button>
      </div>

      <div className="pane">
        {tab === 'files' ? <FilesPanel /> : null}
        {tab === 'term' ? <TerminalPanel /> : null}
        {tab === 'mon' ? <MonitorPanel /> : null}
      </div>
    </aside>
  )
}
