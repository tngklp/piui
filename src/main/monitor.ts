/**
 * Live inference telemetry for the Monitor tab.
 *
 * Two endpoint shapes are supported, detected from the body of `/metrics`:
 *
 * - **Engine JSON** — llama.cpp forks (and the `engine` builds) answer
 *   `/metrics` with a JSON document holding `engine`, `live`, `requests`,
 *   `totals`, `hardware`, and `history`. This is the richest source: it reports
 *   the current request's prompt/generation progress and throughput directly.
 * - **Prometheus text** — stock llama.cpp with `--metrics`. Rate gauges are read
 *   directly and, when they are missing, derived from the cumulative counters.
 *   `/slots` supplies per-request progress where the build exposes it.
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type {
  MonitorGpuDto,
  MonitorRequestDto,
  MonitorSnapshotDto,
  MonitorStatusDto
} from '@shared/ipc'

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
/** Read currently in flight, so polls never overlap. */
let inFlight: Promise<MonitorSnapshotDto> | null = null
let lastSnapshot: MonitorSnapshotDto | null = null

const HISTORY_LENGTH = 40
const answerHistory: number[] = []

export interface MonitorSource {
  /** Inference endpoint details for the active model. */
  endpoint(): {
    baseUrl: string | null
    model: string | null
    contextWindow: number | null
    maxTokens: number | null
  }
  /** Recently completed model requests from the session transcript. */
  recentRequests(limit: number): MonitorRequestDto[]
}

/** llama.cpp exposes metrics and slot state at the server root, not under `/v1`. */
function serverRoot(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '').replace(/\/v1$/, '')
}

function metricsUrl(baseUrl: string): string {
  return `${serverRoot(baseUrl)}/metrics`
}

function slotsUrl(baseUrl: string): string {
  return `${serverRoot(baseUrl)}/slots`
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

/** Read a finite number, or null. Numeric strings are accepted. */
function num(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
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

/**
 * Ask `/slots` what the server is doing right now.
 *
 * llama.cpp reports `state` as 0 idle, 1 reading the prompt, 2 generating, and
 * includes per-request token counters. Not every build enables the endpoint, so
 * every field is optional.
 */
async function readSlots(
  baseUrl: string,
  maxTokens: number | null
): Promise<MonitorStatusDto | null> {
  try {
    const response = await fetch(slotsUrl(baseUrl), {
      signal: AbortSignal.timeout(1200),
      headers: { accept: 'application/json' }
    })
    if (!response.ok) return null

    const body: unknown = await response.json()
    const slots = Array.isArray(body) ? body : [body]

    let best: Record<string, unknown> | null = null
    let bestState = 0
    for (const entry of slots) {
      if (typeof entry !== 'object' || entry === null) continue
      const slot = entry as Record<string, unknown>
      const state = num(slot.state) ?? (slot.is_processing ? 1 : 0)
      if (state > bestState) {
        best = slot
        bestState = state
      }
    }

    if (!best || bestState === 0) {
      return {
        source: 'slots',
        phase: 'idle',
        promptProcessed: null,
        promptTotal: null,
        generated: null,
        maxOutput: maxTokens,
        elapsedSeconds: null
      }
    }

    const progress = asRecord(best.prompt_progress)
    const nextToken = asRecord(best.next_token)

    return {
      source: 'slots',
      phase: bestState === 1 ? 'prompt' : 'generate',
      promptProcessed: num(best.n_prompt_tokens_processed) ?? num(progress.processed),
      promptTotal: num(best.n_prompt_tokens) ?? num(progress.total),
      generated: num(best.n_decoded) ?? num(nextToken.n_decoded),
      maxOutput: maxTokens,
      elapsedSeconds: null
    }
  } catch {
    return null
  }
}

/** Build GPU cards from the engine's `hardware` block, when it has one. */
function gpusFromHardware(hardware: Record<string, unknown>, name: string): MonitorGpuDto[] {
  const totalBytes = num(hardware.gpu_mem_total)
  if (totalBytes === null || totalBytes <= 0) return []

  const mib = 1024 * 1024
  return [
    {
      name,
      utilization: num(hardware.gpu_util) ?? 0,
      memoryUsed: (num(hardware.gpu_mem_used) ?? 0) / mib,
      memoryTotal: totalBytes / mib,
      powerWatts: num(hardware.gpu_power),
      temperatureC: num(hardware.gpu_temp)
    }
  ]
}

async function readGpus(): Promise<MonitorGpuDto[]> {
  if (gpuCache && Date.now() - gpuCache.at < 2000) return gpuCache.gpus

  const gpus: MonitorGpuDto[] = []
  try {
    const { stdout } = await execFileAsync(
      'nvidia-smi',
      [
        '--query-gpu=name,utilization.gpu,memory.used,memory.total,power.draw,temperature.gpu',
        '--format=csv,noheader,nounits'
      ],
      { timeout: 2500, windowsHide: true }
    )

    for (const line of stdout.split('\n')) {
      const parts = line.split(',').map((part) => part.trim())
      if (parts.length < 5) continue
      const power = Number.parseFloat(parts[4])
      const temperature = Number.parseFloat(parts[5] ?? '')
      gpus.push({
        name: parts[0] ?? 'GPU',
        utilization: Number.parseFloat(parts[1]) || 0,
        memoryUsed: Number.parseFloat(parts[2]) || 0,
        memoryTotal: Number.parseFloat(parts[3]) || 0,
        powerWatts: Number.isNaN(power) ? null : power,
        temperatureC: Number.isNaN(temperature) ? null : temperature
      })
    }

    gpuCache = { at: Date.now(), gpus }
  } catch {
    // nvidia-smi missing or no NVIDIA GPU: report no GPUs.
    gpuCache = { at: Date.now(), gpus: [] }
  }

  return gpus
}

/** Snapshot skeleton, before any endpoint has answered. */
function skeleton(
  model: string | null,
  baseUrl: string | null,
  contextWindow: number | null,
  maxTokens: number | null,
  recent: MonitorRequestDto[],
  gpus: MonitorGpuDto[]
): MonitorSnapshotDto {
  return {
    at: new Date().toISOString(),
    engine: { available: false, model, endpoint: baseUrl, contextWindow, error: null },
    speed: {
      answerTokensPerSecond: null,
      promptTokensPerSecond: null,
      history: [...answerHistory]
    },
    kvCache: { usageRatio: null, tokens: null },
    requests: { processing: 0, deferred: 0 },
    gpus,
    recent,
    status: {
      source: 'none',
      phase: 'idle',
      promptProcessed: null,
      promptTotal: null,
      generated: null,
      maxOutput: maxTokens,
      elapsedSeconds: null
    }
  }
}

/** Apply the engine's JSON document to the snapshot. */
function applyEngineJson(
  snapshot: MonitorSnapshotDto,
  data: Record<string, unknown>,
  modelMaxTokens: number | null
): void {
  const engine = asRecord(data.engine)
  const live = asRecord(data.live)
  const hardware = asRecord(data.hardware)
  const history = asRecord(data.history)
  const requests = Array.isArray(data.requests) ? data.requests : []

  snapshot.engine.available = true

  if (typeof engine.model === 'string' && engine.model.length > 0 && !snapshot.engine.model) {
    snapshot.engine.model = engine.model
  }
  snapshot.engine.contextWindow =
    num(engine.max_context) ?? num(engine.context) ?? snapshot.engine.contextWindow

  // Throughput: the live request first, then the rolling mean.
  snapshot.speed.answerTokensPerSecond = num(live.tok_s) ?? num(hardware.tok_s)
  snapshot.speed.promptTokensPerSecond =
    num(live.prefill_tok_s_mean) ?? num(hardware.prefill_tok_s_mean)

  const series = Array.isArray(history.tok_s)
    ? history.tok_s.map(num).filter((value): value is number => value !== null)
    : []
  if (series.length >= 2) snapshot.speed.history = series.slice(-HISTORY_LENGTH)

  // How much of the context window the current sequence occupies.
  const livePrompt = num(live.prompt_total)
  const liveGenerated = num(live.generated)
  const latest = requests.length > 0 ? asRecord(requests[0]) : null
  const kvTokens =
    livePrompt !== null
      ? livePrompt + (liveGenerated ?? 0)
      : latest
        ? (num(latest.prompt_total) ?? 0) + (num(latest.output_tokens) ?? 0)
        : null

  snapshot.kvCache.tokens = kvTokens
  const window = snapshot.engine.contextWindow
  snapshot.kvCache.usageRatio =
    kvTokens !== null && window !== null && window > 0 ? Math.min(1, kvTokens / window) : null

  const state = typeof live.state === 'string' ? live.state : 'idle'
  const busy = state.length > 0 && state !== 'idle'
  snapshot.requests.processing = busy ? 1 : 0
  snapshot.requests.deferred = num(live.queued) ?? 0

  // Prompt reading is reported by token counters rather than by the state name,
  // which keeps this working for engines that name the phases differently.
  let phase: MonitorStatusDto['phase'] = 'idle'
  if (busy) {
    if (livePrompt !== null && liveGenerated === null) phase = 'prompt'
    else if (
      livePrompt !== null &&
      num(live.prompt_read) !== null &&
      num(live.prompt_read)! < livePrompt
    ) {
      phase = 'prompt'
    } else phase = 'generate'
  }

  snapshot.status = {
    source: 'engine',
    phase,
    promptProcessed: num(live.prompt_read),
    promptTotal: livePrompt,
    generated: liveGenerated,
    maxOutput: num(live.max_tokens) ?? modelMaxTokens,
    elapsedSeconds: num(live.elapsed_s)
  }

  const hardwareGpus = gpusFromHardware(hardware, snapshot.gpus[0]?.name ?? 'GPU')
  if (hardwareGpus.length > 0) snapshot.gpus = hardwareGpus

  if (requests.length > 0) {
    snapshot.recent = requests.slice(0, 6).map((raw): MonitorRequestDto => {
      const request = asRecord(raw)
      const seconds = num(request.time)
      const promptMs = num(request.prompt_ms)
      const decodeMs = num(request.decode_ms)
      return {
        at: seconds === null ? new Date().toISOString() : new Date(seconds * 1000).toISOString(),
        model: typeof engine.model === 'string' ? engine.model : '',
        promptTokens: num(request.prompt_total) ?? num(request.prompt_tokens) ?? 0,
        answerTokens: num(request.output_tokens) ?? 0,
        durationMs:
          promptMs !== null || decodeMs !== null ? (promptMs ?? 0) + (decodeMs ?? 0) : null,
        tokensPerSecond: num(request.decode_tok_s)
      }
    })
  }
}

/** Apply Prometheus text, falling back to `/slots` for request progress. */
async function applyPrometheus(
  snapshot: MonitorSnapshotDto,
  body: string,
  baseUrl: string,
  modelMaxTokens: number | null
): Promise<void> {
  const values = parseMetrics(body)
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

  if (snapshot.requests.processing > 0) {
    const slots = await readSlots(baseUrl, modelMaxTokens)
    if (slots) snapshot.status = slots
  }
}

/**
 * Probe the inference endpoint and assemble one monitor snapshot.
 *
 * Reads are serialized: the token counters are cumulative, so two overlapping
 * reads would each compare against the other's sample and the derived rates
 * would stop tracking the server. While a read is running the previous snapshot
 * is handed back instead of starting another.
 */
export async function readMonitor(source: MonitorSource): Promise<MonitorSnapshotDto> {
  if (inFlight) return lastSnapshot ?? inFlight

  inFlight = collect(source)
  try {
    lastSnapshot = await inFlight
    return lastSnapshot
  } finally {
    inFlight = null
  }
}

async function collect(source: MonitorSource): Promise<MonitorSnapshotDto> {
  const { baseUrl, model, contextWindow, maxTokens } = source.endpoint()

  const snapshot = skeleton(
    model,
    baseUrl,
    contextWindow,
    maxTokens,
    source.recentRequests(6),
    await readGpus()
  )

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

    const body = await response.text()

    // Engine JSON is checked first: it is a superset of what the tab shows.
    let json: Record<string, unknown> | null = null
    const trimmed = body.trimStart()
    if (trimmed.startsWith('{')) {
      try {
        json = asRecord(JSON.parse(body))
      } catch {
        json = null
      }
    }

    if (json && (json.live !== undefined || json.engine !== undefined)) {
      applyEngineJson(snapshot, json, maxTokens)
    } else {
      await applyPrometheus(snapshot, body, baseUrl, maxTokens)
    }
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
  if (snapshot.speed.history.length === 0) snapshot.speed.history = [...answerHistory]

  return snapshot
}
