import { shortenPath } from '../../lib/format'
import { usePiUi } from '../../store'

/**
 * Session shell context. PiUI does not run an interactive PTY yet, so this shows
 * the environment that the agent's `bash` tool runs with.
 */
export function TerminalPanel() {
  const status = usePiUi((state) => state.status)
  const workspace = usePiUi((state) => state.workspace)

  const model = status?.model ? `${status.model.provider}/${status.model.id}` : 'unset'
  const thinking = status?.thinkingLevel ?? 'off'

  return (
    <div className="pad">
      <div className="term">
        <span className="m">
          PI_MODEL={model} PI_REASONING_LEVEL={thinking}
        </span>
        {'\n'}
        <span className="m">PI_SESSION_ID={status?.sessionId ?? 'unset'}</span>
        {'\n'}
        <span className="m">PI_SESSION_FILE={status?.sessionFile ?? 'ephemeral'}</span>
        {'\n\n'}
        <span className="p">{shortenPath(workspace?.cwd ?? 'no workspace', 60)}</span>{' '}
        <span className="g">$</span> <span className="stream" />
        {'\n\n'}
        <span className="m">
          These are the variables the agent&apos;s bash tool receives. An interactive terminal pane
          is not implemented yet.
        </span>
      </div>
    </div>
  )
}
