import { formatCost, formatPercent, formatTokens, shortenPath } from '../lib/format'
import { usePiUi } from '../store'

export function StatusBar() {
  const status = usePiUi((state) => state.status)
  if (!status) return <div className="statusbar" />

  return (
    <div className="statusbar">
      <span className="statusbar__item" title={status.cwd}>
        {shortenPath(status.cwd)}
      </span>
      <span className="statusbar__item">{status.model?.name ?? 'no model'}</span>
      {status.supportsThinking ? (
        <span className="statusbar__item statusbar__item--dim">{status.thinkingLevel}</span>
      ) : null}
      <span className="statusbar__spacer" />
      {status.isCompacting ? <span className="statusbar__item">compacting…</span> : null}
      {status.isRetrying ? <span className="statusbar__item">retrying…</span> : null}
      {status.pendingMessageCount > 0 ? (
        <span className="statusbar__item">{status.pendingMessageCount} queued</span>
      ) : null}
      <span className="statusbar__item" title="Context window usage">
        ctx {formatPercent(status.contextUsage?.percent ?? null)}
      </span>
      <span className="statusbar__item" title="Total tokens this session">
        {formatTokens(status.tokens.total)} tok
      </span>
      <span className="statusbar__item" title="Total cost this session">
        {formatCost(status.cost)}
      </span>
      <span
        className="statusbar__item statusbar__item--dim"
        title={status.sessionFile ?? 'ephemeral'}
      >
        {status.sessionId.slice(0, 8)}
      </span>
    </div>
  )
}
