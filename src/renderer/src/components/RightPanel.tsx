import type { PointerEvent } from 'react'
import { usePiUi, type RightTab } from '../store'
import { BranchesPanel } from './panels/BranchesPanel'
import { FilesPanel } from './panels/FilesPanel'
import { MonitorPanel } from './panels/MonitorPanel'
import { TerminalPanel } from './panels/TerminalPanel'

const TABS: { id: RightTab; label: string }[] = [
  { id: 'files', label: 'Files' },
  { id: 'term', label: 'Terminal' },
  { id: 'tree', label: 'Branches' },
  { id: 'mon', label: 'Monitor' }
]

interface RightPanelProps {
  onGripDown: (event: PointerEvent<HTMLDivElement>) => void
}

/** Tabbed, resizable, collapsible side panel. */
export function RightPanel({ onGripDown }: RightPanelProps) {
  const tab = usePiUi((state) => state.rightTab)
  const setTab = usePiUi((state) => state.setRightTab)
  const toggleRight = usePiUi((state) => state.toggleRight)
  const monitor = usePiUi((state) => state.monitor)

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
          title="Collapse panel"
          aria-label="Collapse panel"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor">
            <path d="M6 3.5 10.5 8 6 12.5" />
          </svg>
        </button>
      </div>

      <div className="pane">
        {tab === 'files' ? <FilesPanel /> : null}
        {tab === 'term' ? <TerminalPanel /> : null}
        {tab === 'tree' ? <BranchesPanel /> : null}
        {tab === 'mon' ? <MonitorPanel /> : null}
      </div>
    </aside>
  )
}
