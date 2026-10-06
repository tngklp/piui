import { usePiUi } from '../../store'

/**
 * Placeholder shell. An interactive terminal is not implemented yet, so this
 * shows only the workspace prompt.
 */
export function TerminalPanel() {
  const workspace = usePiUi((state) => state.workspace)

  return (
    <div className="pad">
      <div className="term">
        <span className="p">{workspace?.cwd ?? '~'}</span> <span className="g">$</span>{' '}
        <span className="stream" />
      </div>
    </div>
  )
}
