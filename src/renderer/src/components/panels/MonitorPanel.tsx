import { useEffect } from 'react'
import type { MonitorSnapshotDto } from '@shared/ipc'
import { usePiUi } from '../../store'

const POLL_MS = 1500

function number(value: number | null, digits = 0): string {
  if (value === null || !Number.isFinite(value)) return '—'
  return value.toLocaleString('en-US', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits
  })
}

function ratio(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—'
  return `${Math.round(value * 100)}`
}

function sparkPaths(values: number[]): { line: string; area: string } | null {
  if (values.length < 2) return null
  const max = Math.max(...values, 1)
  const step = 300 / (values.length - 1)
  const points = values.map(
    (value, index) =>
      `${(index * step).toFixed(1)},${(62 - (Math.min(value, max) / max) * 58).toFixed(1)}`
  )
  return { line: `M${points.join('L')}`, area: `M0,64L${points.join('L')}L300,64Z` }
}

function timeOf(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/** What the model is doing, as one line of text plus a completion ratio. */
function describeStatus(status: MonitorSnapshotDto['status']): {
  text: string
  percent: number | null
} {
  if (status.phase === 'prompt') {
    const processed = status.promptProcessed
    const total = status.promptTotal
    if (processed === null || total === null) {
      return {
        text: total === null ? 'Reading the prompt…' : `Reading ${number(total)} tokens…`,
        percent: null
      }
    }
    return {
      text: `${number(processed)} of ${number(total)} tokens`,
      percent: total > 0 ? Math.min(100, (processed / total) * 100) : null
    }
  }

  if (status.phase === 'generate') {
    const generated = status.generated
    if (generated === null) return { text: 'Generating…', percent: null }
    const max = status.maxOutput
    return {
      text:
        max === null || max <= 0
          ? `${number(generated)} tokens`
          : `${number(generated)} of max ${number(max)} tokens`,
      percent: max !== null && max > 0 ? Math.min(100, (generated / max) * 100) : null
    }
  }

  return { text: 'Idle', percent: null }
}

/** Short duration for the request table. */
function duration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return '—'
  if (ms < 1000) return `${Math.round(ms)} ms`
  const seconds = ms / 1000
  if (seconds < 60) return `${seconds.toFixed(1)} s`
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`
}

/** Live inference metrics from the model endpoint and GPU telemetry. */
export function MonitorPanel() {
  const monitor = usePiUi((state) => state.monitor)
  const setMonitor = usePiUi((state) => state.setMonitor)
  // Re-poll immediately when the active model changes.
  const modelKey = usePiUi((state) =>
    state.status?.model ? `${state.status.model.provider}/${state.status.model.id}` : ''
  )

  useEffect(() => {
    let cancelled = false
    let running = false

    const tick = async (): Promise<void> => {
      // Never stack polls: the endpoint's counters are cumulative.
      if (running) return
      running = true
      try {
        const snapshot = await window.piui.getMonitor()
        if (!cancelled) setMonitor(snapshot)
      } catch {
        // Leave the last snapshot in place; the next tick retries.
      } finally {
        running = false
      }
    }

    void tick()
    const timer = window.setInterval(() => void tick(), POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [setMonitor, modelKey])

  if (!monitor) {
    return (
      <div className="pad">
        <p style={{ color: 'var(--dim)', fontSize: 13 }}>Reading metrics…</p>
      </div>
    )
  }

  const spark = sparkPaths(monitor.speed.history)
  const kvPercent = monitor.kvCache.usageRatio
  const statusView = describeStatus(monitor.status)

  return (
    <div className="pad mon">
      <div className="eng">
        <span className={monitor.engine.available ? 'dot' : 'dot off'} />
        <div>
          <b>{monitor.engine.model ?? 'No model selected'}</b>
          <small>{monitor.engine.endpoint ?? 'no endpoint configured'}</small>
        </div>
        <span className="sp" />
        <span className="chip lil">{monitor.engine.available ? 'Serving' : 'Offline'}</span>
      </div>

      {monitor.engine.error ? (
        <div className="mc">
          <h3>Endpoint</h3>
          <small>{monitor.engine.error}</small>
        </div>
      ) : null}

      <div className="mc">
        <h3>Status</h3>
        <div className="gh">
          <b style={{ fontWeight: 500 }}>{statusView.text}</b>
          <small>{statusView.percent === null ? '—' : `${Math.round(statusView.percent)}%`}</small>
        </div>
        <div className="bar">
          <i style={{ width: `${statusView.percent ?? 0}%` }} />
        </div>
        {monitor.status.elapsedSeconds === null ? null : (
          <small>{monitor.status.elapsedSeconds.toFixed(1)} s elapsed</small>
        )}
      </div>

      <div className="mc">
        <div className="two">
          <div>
            <small>Answer speed</small>
            <div className="big">
              {number(monitor.speed.answerTokensPerSecond, 0)}
              <em>tok/s</em>
            </div>
          </div>
          <div>
            <small>Prompt speed</small>
            <div className="big">
              {number(monitor.speed.promptTokensPerSecond, 0)}
              <em>tok/s</em>
            </div>
          </div>
        </div>
        {spark ? (
          <svg
            className="spark"
            viewBox="0 0 300 64"
            preserveAspectRatio="none"
            aria-label="Answer speed history"
          >
            <path className="ar" d={spark.area} />
            <path className="ln" d={spark.line} />
          </svg>
        ) : (
          <small style={{ display: 'block', marginTop: 6 }}>Not enough samples yet.</small>
        )}
      </div>

      <div className="mc">
        <h3>KV cache</h3>
        <div className="gh">
          <b style={{ fontWeight: 500 }}>
            {monitor.kvCache.tokens === null ? '—' : `${number(monitor.kvCache.tokens)} tokens`}
          </b>
          <small>{kvPercent === null ? '—' : `${ratio(kvPercent)}%`}</small>
        </div>
        <div className="bar">
          <i style={{ width: `${Math.min(100, Math.max(0, (kvPercent ?? 0) * 100))}%` }} />
        </div>
        <small>
          Context window {number(monitor.engine.contextWindow)} tokens ·{' '}
          {monitor.requests.processing} processing · {monitor.requests.deferred} deferred
        </small>
      </div>

      {monitor.gpus.length > 0 ? (
        <div className="mc">
          <h3>GPUs</h3>
          {monitor.gpus.map((gpu) => (
            <div className="gpu" key={gpu.name}>
              <div className="gh">
                <b>{gpu.name}</b>
                <small>
                  {Math.round(gpu.utilization)}% load
                  {gpu.temperatureC === null ? '' : ` · ${Math.round(gpu.temperatureC)} °C`}
                  {gpu.powerWatts === null ? '' : ` · ${Math.round(gpu.powerWatts)} W`}
                </small>
              </div>
              <div className="bar">
                <i style={{ width: `${Math.min(100, gpu.utilization)}%` }} />
              </div>
              <small>
                VRAM {(gpu.memoryUsed / 1024).toFixed(1)} of {(gpu.memoryTotal / 1024).toFixed(1)}{' '}
                GB
              </small>
              <div className="bar">
                <i
                  style={{
                    width: `${gpu.memoryTotal > 0 ? Math.min(100, (gpu.memoryUsed / gpu.memoryTotal) * 100) : 0}%`,
                    opacity: 0.55
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mc">
          <h3>GPUs</h3>
          <small>nvidia-smi reported no GPU. Ignore this if you run the model elsewhere.</small>
        </div>
      )}

      <div className="mc">
        <h3>Recent requests</h3>
        {monitor.recent.length === 0 ? (
          <small>No completed requests in this session yet.</small>
        ) : (
          <table className="rq">
            <thead>
              <tr>
                <th>Time</th>
                <th>Prompt</th>
                <th>Answer</th>
                <th>Took</th>
                <th>tok/s</th>
              </tr>
            </thead>
            <tbody>
              {monitor.recent.map((request, index) => (
                <tr key={`${request.at}-${index}`}>
                  <td>{timeOf(request.at)}</td>
                  <td>{request.promptTokens.toLocaleString('en-US')}</td>
                  <td>{request.answerTokens.toLocaleString('en-US')}</td>
                  <td>{duration(request.durationMs)}</td>
                  <td>
                    {request.tokensPerSecond === null ? '—' : request.tokensPerSecond.toFixed(1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
