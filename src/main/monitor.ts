import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { MonitorGpuDto, MonitorRequestDto, MonitorSnapshotDto } from '@shared/ipc'

const execFileAsync = promisify(execFile)

/** Raw Prometheus-style sample used to derive rates. */
interface EngineSample {
  at: number
  predictedTokens: number
  predictedSeconds: number
  promptTokens: number
  promptSeconds: number
}

let previousSample: EngineSample | null = null
let gpuCache: { at: number; gpus: MonitorGpuDto[] } | null = null

const HISTORY_LENGTH = 40
const answerHistory: number[] = []

export interface MonitorSource {
  /** Inference endpoint details for the active model. */
  endpoint(): { baseUrl: string | null; model: string | null; contextWindow: number | null }
  /** Recently completed model requests from the session transcript. */
  recentRequests(limit: number): MonitorRequestDto[]
}

/** llama.cpp exposes metrics at the server root, not under `/v1`. */
function metricsUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, '').replace(/\/v1$/, '')
  return `${trimmed}/metrics`
}

/** Parse Prometheus exposition text into name -> value. */
function parseMetrics(body: string): Map<string, number> {
  const values = new Map<string, number>()
  for (const line of body.split('\n')) {
    if (line.length === 0 || line.startsWith('#')) continue
    const space = line.lastIndexOf(' ')
    if (space <= 0) continue
    const name = line.slice(0, space).split('{')[0]?.trim()
    const value = Number.parseFloat(line.slice(space + 1))
    if (!name || Number.isNaN(value)) continue
    values.set(name, (values.get(name) ?? 0) + value)
  }
  return values
}

function pick(values: Map<string, number>, names: string[]): number | null {
  for (const name of names) {
    const value = values.get(name)
    if (typeof value === 'number') return value
  }
  return null
}

async function readGpus(): Promise<MonitorGpuDto[]> {
  if (gpuCache && Date.now() - gpuCache.at < 2000) return gpuCache.gpus

  const gpus: MonitorGpuDto[] = []
  try {
    const { stdout } = await execFileAsync(
      'nvidia-smi',
      [
        '--query-gpu=name,utilization.gpu,memory.used,memory.total,power.draw',
        '--format=csv,noheader,nounits'
      ],
      { timeout: 2500, windowsHide: true }
    )

    for (const line of stdout.split('\n')) {
      const parts = line.split(',').map((part) => part.trim())
      if (parts.length < 5) continue
      const power = Number.parseFloat(parts[4])
      gpus.push({
        name: parts[0] ?? 'GPU',
        utilization: Number.parseFloat(parts[1]) || 0,
        memoryUsed: Number.parseFloat(parts[2]) || 0,
        memoryTotal: Number.parseFloat(parts[3]) || 0,
        powerWatts: Number.isNaN(power) ? null : power
      })
    }

    gpuCache = { at: Date.now(), gpus }
  } catch {
    // nvidia-smi missing or no NVIDIA GPU: report no GPUs.
    gpuCache = { at: Date.now(), gpus: [] }
  }

  return gpus
}

/** Probe the inference endpoint and assemble one monitor snapshot. */
export async function readMonitor(source: MonitorSource): Promise<MonitorSnapshotDto> {
  const { baseUrl, model, contextWindow } = source.endpoint()

  const snapshot: MonitorSnapshotDto = {
    at: new Date().toISOString(),
    engine: { available: false, model, endpoint: baseUrl, contextWindow, error: null },
    speed: {
      answerTokensPerSecond: null,
      promptTokensPerSecond: null,
      history: [...answerHistory]
    },
    kvCache: { usageRatio: null, tokens: null },
    requests: { processing: 0, deferred: 0 },
    gpus: await readGpus(),
    recent: source.recentRequests(6)
  }

  if (!baseUrl) {
    snapshot.engine.error = 'No inference endpoint is configured for the active model.'
    return snapshot
  }

  try {
    const response = await fetch(metricsUrl(baseUrl), {
      signal: AbortSignal.timeout(1500)
    })
    if (!response.ok) {
      snapshot.engine.error =
        response.status === 404 || response.status === 501
          ? 'The server did not expose /metrics. Start llama.cpp with --metrics.'
          : `Metrics request failed with HTTP ${response.status}.`
      return snapshot
    }

    const values = parseMetrics(await response.text())
    const now = Date.now()

    const predictedTokens = pick(values, [
      'llamacpp:tokens_predicted_total',
      'llamacpp:tokens_predicted'
    ])
    const predictedSeconds = pick(values, [
      'llamacpp:tokens_predicted_seconds_total',
      'llamacpp:tokens_predicted_seconds'
    ])
    const promptTokens = pick(values, ['llamacpp:prompt_tokens_total', 'llamacpp:prompt_tokens'])
    const promptSeconds = pick(values, [
      'llamacpp:prompt_seconds_total',
      'llamacpp:prompt_tokens_seconds_total'
    ])

    snapshot.engine.available = true

    // Prefer the server's own instantaneous gauges, then fall back to deltas.
    snapshot.speed.answerTokensPerSecond = pick(values, [
      'llamacpp:predicted_tokens_seconds',
      'llamacpp:predicted_per_second'
    ])
    snapshot.speed.promptTokensPerSecond = pick(values, [
      'llamacpp:prompt_tokens_seconds',
      'llamacpp:prompt_per_second'
    ])

    if (
      predictedTokens !== null &&
      predictedSeconds !== null &&
      promptTokens !== null &&
      promptSeconds !== null
    ) {
      const current: EngineSample = {
        at: now,
        predictedTokens,
        predictedSeconds,
        promptTokens,
        promptSeconds
      }
      const previous = previousSample

      if (previous && current.at > previous.at) {
        const tokenDelta = current.predictedTokens - previous.predictedTokens
        const secondDelta = current.predictedSeconds - previous.predictedSeconds
        if (snapshot.speed.answerTokensPerSecond === null && secondDelta > 0 && tokenDelta >= 0) {
          snapshot.speed.answerTokensPerSecond = tokenDelta / secondDelta
        }

        const promptTokenDelta = current.promptTokens - previous.promptTokens
        const promptSecondDelta = current.promptSeconds - previous.promptSeconds
        if (
          snapshot.speed.promptTokensPerSecond === null &&
          promptSecondDelta > 0 &&
          promptTokenDelta >= 0
        ) {
          snapshot.speed.promptTokensPerSecond = promptTokenDelta / promptSecondDelta
        }
      }

      previousSample = current
    }

    snapshot.kvCache.usageRatio = pick(values, ['llamacpp:kv_cache_usage_ratio'])
    snapshot.kvCache.tokens = pick(values, ['llamacpp:kv_cache_tokens'])
    snapshot.requests.processing = pick(values, ['llamacpp:requests_processing']) ?? 0
    snapshot.requests.deferred = pick(values, ['llamacpp:requests_deferred']) ?? 0
  } catch (cause) {
    snapshot.engine.error =
      cause instanceof Error && cause.name === 'TimeoutError'
        ? 'The inference endpoint did not respond within 1.5s.'
        : `Could not reach ${metricsUrl(baseUrl)}.`
  }

  if (snapshot.speed.answerTokensPerSecond !== null) {
    answerHistory.push(snapshot.speed.answerTokensPerSecond)
    while (answerHistory.length > HISTORY_LENGTH) answerHistory.shift()
  }

  snapshot.speed.history = [...answerHistory]
  return snapshot
}
