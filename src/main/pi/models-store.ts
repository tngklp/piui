/**
 * Read and write `<agentDir>/models.json`, the provider/model catalogue the pi
 * agent loads at startup.
 *
 * PiUI treats the file as the source of truth for the fields the settings UI
 * exposes, but preserves every other key (`compat`, unknown provider options,
 * future additions) so editing models here never destroys hand-written config.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { ModelDefDto, ModelsConfigDto, ProviderConfigDto } from '@shared/ipc'

/** Absolute path of the catalogue file for an agent directory. */
export function modelsConfigPath(agentDir: string): string {
  return join(agentDir, 'models.json')
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function normalizeModel(raw: unknown): ModelDefDto {
  const model = asRecord(raw)
  const cost = asRecord(model.cost)
  return {
    id: asString(model.id),
    name: asString(model.name, asString(model.id)),
    reasoning: asBoolean(model.reasoning, false),
    input: Array.isArray(model.input)
      ? model.input.filter((entry): entry is string => typeof entry === 'string')
      : ['text'],
    contextWindow: asNumber(model.contextWindow, 0),
    maxTokens: asNumber(model.maxTokens, 0),
    cost: {
      input: asNumber(cost.input, 0),
      output: asNumber(cost.output, 0),
      cacheRead: asNumber(cost.cacheRead, 0),
      cacheWrite: asNumber(cost.cacheWrite, 0)
    }
  }
}

function normalizeProvider(id: string, raw: unknown): ProviderConfigDto {
  const provider = asRecord(raw)
  const models = Array.isArray(provider.models) ? provider.models : []
  return {
    id,
    baseUrl: asString(provider.baseUrl),
    api: asString(provider.api, 'openai-completions'),
    apiKey: asString(provider.apiKey),
    models: models.map(normalizeModel).filter((model) => model.id.length > 0)
  }
}

async function readRaw(path: string): Promise<Record<string, unknown>> {
  try {
    return asRecord(JSON.parse(await readFile(path, 'utf8')))
  } catch {
    // A missing or malformed file means "no configured providers".
    return {}
  }
}

/** Read the catalogue, normalised for the renderer. */
export async function readModelsConfig(agentDir: string): Promise<ModelsConfigDto> {
  const path = modelsConfigPath(agentDir)
  const raw = await readRaw(path)
  const providers = asRecord(raw.providers)

  return {
    path,
    providers: Object.entries(providers)
      .map(([id, provider]) => normalizeProvider(id, provider))
      .filter((provider) => provider.id.length > 0)
  }
}

/** Merge the renderer's catalogue back into the file and return what was written. */
export async function writeModelsConfig(
  agentDir: string,
  config: ModelsConfigDto
): Promise<ModelsConfigDto> {
  const path = modelsConfigPath(agentDir)
  const raw = await readRaw(path)
  const existing = asRecord(raw.providers)

  const providers: Record<string, unknown> = {}
  for (const provider of config.providers) {
    const id = provider.id.trim()
    if (id.length === 0) continue
    providers[id] = {
      ...asRecord(existing[id]),
      baseUrl: provider.baseUrl,
      api: provider.api,
      apiKey: provider.apiKey,
      models: provider.models
        .filter((model) => model.id.trim().length > 0)
        .map((model) => ({ ...model, id: model.id.trim(), name: model.name || model.id.trim() }))
    }
  }

  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify({ ...raw, providers }, null, 2)}\n`, 'utf8')
  return readModelsConfig(agentDir)
}
