import { formatCost, formatPercent, formatTokens } from '../lib/format'
import { usePiUi } from '../store'

/** Bottom status strip: context usage, cost, tokens, and agent state. */
export function StatusFooter() {
  const status = usePiUi((state) => state.status)

  const percent = status?.contextUsage?.percent ?? null
  const contextWindow = status?.contextUsage?.contextWindow ?? 0

  return (
    <footer className="foot">
      <span className="stat">
        Context
        <span className="meter">
          <i style={{ width: `${Math.min(100, Math.max(0, percent ?? 0))}%` }} />
        </span>
        {formatPercent(percent)} of {formatTokens(contextWindow)}
      </span>
      <span className="stat hide">Cost {formatCost(status?.cost ?? 0)}</span>
      <span className="stat hide">
        {formatTokens(status?.tokens.input ?? 0)} in · {formatTokens(status?.tokens.output ?? 0)}{' '}
        out
      </span>
      <span className="sp" />
      {status?.isCompacting ? <span className="stat">Compacting…</span> : null}
      {status?.isRetrying ? <span className="stat">Retrying…</span> : null}
      {status && status.pendingMessageCount > 0 ? (
        <span className="stat">{status.pendingMessageCount} queued</span>
      ) : null}
      <span className="stat">{status?.model?.name ?? 'no model'}</span>
      <span className="stat">
        <span className={status?.isStreaming ? 'dot' : 'dot off'} />
        {status?.isStreaming ? 'Agent running' : 'Idle'}
      </span>
    </footer>
  )
}
