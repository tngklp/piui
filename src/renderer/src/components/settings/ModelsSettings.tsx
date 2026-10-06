import { useEffect, useRef, useState } from 'react'
import type { ModelDefDto, ModelsConfigDto, ProviderConfigDto } from '@shared/ipc'
import { usePiUi } from '../../store'
import { Select, type SelectOption } from '../Select'

/** Provider APIs the agent understands. */
const API_OPTIONS: SelectOption<string>[] = [
  { value: 'openai-completions', label: 'OpenAI completions' },
  { value: 'openai-responses', label: 'OpenAI responses' },
  { value: 'anthropic-messages', label: 'Anthropic messages' },
  { value: 'google-generative-ai', label: 'Google generative AI' },
  { value: 'google-vertex', label: 'Google Vertex' },
  { value: 'azure-openai-responses', label: 'Azure OpenAI responses' },
  { value: 'openai-codex-responses', label: 'OpenAI Codex responses' },
  { value: 'mistral-conversations', label: 'Mistral conversations' },
  { value: 'bedrock-converse-stream', label: 'Bedrock converse stream' },
  { value: 'pi-messages', label: 'pi messages' }
]

/** How long to wait after the last edit before writing `models.json`. */
const SAVE_DEBOUNCE_MS = 400

/**
 * Ready-made provider entries for hosted APIs.
 *
 * The ids match pi's own provider ids, so the entry overlays the built-in
 * provider: its model catalogue and streaming behaviour are kept and only the
 * credentials come from here. Models are left empty on purpose — the built-in
 * catalogue supplies them, and the user only has to paste a key.
 */
interface ProviderPreset {
  id: string
  label: string
  baseUrl: string
  api: string
}

const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'openai',
    label: 'ChatGPT (OpenAI)',
    baseUrl: 'https://api.openai.com/v1',
    api: 'openai-completions'
  },
  {
    id: 'anthropic',
    label: 'Claude (Anthropic)',
    baseUrl: 'https://api.anthropic.com/v1',
    api: 'anthropic-messages'
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    api: 'openai-completions'
  },
  {
    id: 'google',
    label: 'Gemini (Google)',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    api: 'google-generative-ai'
  },
  { id: 'xai', label: 'Grok (xAI)', baseUrl: 'https://api.x.ai/v1', api: 'openai-completions' },
  {
    id: 'mistral',
    label: 'Mistral',
    baseUrl: 'https://api.mistral.ai/v1',
    api: 'mistral-conversations'
  },
  {
    id: 'groq',
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    api: 'openai-completions'
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    api: 'openai-completions'
  }
]

/** Sentinel for the free-form entry. */
const CUSTOM_PRESET = ''

function emptyModel(): ModelDefDto {
  return {
    id: '',
    name: '',
    reasoning: false,
    input: ['text'],
    contextWindow: 32768,
    maxTokens: 8192,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
  }
}

function emptyProvider(id: string): ProviderConfigDto {
  return {
    id,
    baseUrl: 'http://127.0.0.1:8080/v1',
    api: 'openai-completions',
    apiKey: 'local',
    models: [emptyModel()]
  }
}

/** Provider entry for a hosted API preset, awaiting an API key. */
function presetProvider(preset: ProviderPreset, taken: ProviderConfigDto[]): ProviderConfigDto {
  // A second copy of the same preset gets a suffix so ids stay unique.
  const used = new Set(taken.map((provider) => provider.id))
  let id = preset.id
  let suffix = 2
  while (used.has(id)) {
    id = `${preset.id}-${suffix}`
    suffix += 1
  }

  return { id, baseUrl: preset.baseUrl, api: preset.api, apiKey: '', models: [] }
}

/** Pick a provider id that is not already taken. */
function nextProviderId(providers: ProviderConfigDto[]): string {
  let index = providers.length + 1
  while (providers.some((provider) => provider.id === `provider-${index}`)) index += 1
  return `provider-${index}`
}

/**
 * Provider and model catalogue editor.
 *
 * Edits are written to `<agentDir>/models.json` shortly after the last change
 * and the running agent reloads the catalogue, so a new model is selectable in
 * the composer without restarting PiUI.
 */
export function ModelsSettings() {
  const config = usePiUi((state) => state.modelsConfig)
  const save = usePiUi((state) => state.saveModelsConfig)

  const [draft, setDraft] = useState<ModelsConfigDto | null>(null)
  const [preset, setPreset] = useState<string>(CUSTOM_PRESET)
  const hydrated = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Seed once per dialog open so writes do not fight the user's typing.
  useEffect(() => {
    if (hydrated.current || !config) return
    hydrated.current = true
    setDraft(config)
  }, [config])

  useEffect(() => {
    if (!draft) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void save(draft), SAVE_DEBOUNCE_MS)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [draft, save])

  if (!draft) {
    return (
      <section className="set-section">
        <h3>Models</h3>
        <p className="modal__hint">Loading the model catalogue…</p>
      </section>
    )
  }

  const update = (mutate: (next: ModelsConfigDto) => void): void => {
    const next: ModelsConfigDto = {
      path: draft.path,
      providers: draft.providers.map((provider) => ({
        ...provider,
        models: provider.models.map((model) => ({ ...model }))
      }))
    }
    mutate(next)
    setDraft(next)
  }

  const updateProvider = (index: number, patch: Partial<ProviderConfigDto>): void =>
    update((next) => {
      next.providers[index] = { ...next.providers[index], ...patch }
    })

  const updateModel = (provider: number, model: number, patch: Partial<ModelDefDto>): void =>
    update((next) => {
      const models = next.providers[provider].models
      models[model] = { ...models[model], ...patch }
    })

  const providerApiOptions = (api: string): SelectOption<string>[] =>
    API_OPTIONS.some((option) => option.value === api)
      ? API_OPTIONS
      : [{ value: api, label: api }, ...API_OPTIONS]

  const presetOptions: SelectOption<string>[] = [
    { value: CUSTOM_PRESET, label: 'Custom provider' },
    ...PROVIDER_PRESETS.map((entry) => ({ value: entry.id, label: entry.label }))
  ]

  return (
    <section className="set-section">
      <h3>Models</h3>

      {draft.providers.map((provider, providerIndex) => (
        <div className="prov" key={providerIndex}>
          <div className="prov__hd">
            <input
              className="inp mono"
              value={provider.id}
              aria-label="Provider id"
              placeholder="provider id"
              onChange={(event) => updateProvider(providerIndex, { id: event.target.value })}
            />
            <span className="sp" />
            <button
              className="b sm bad"
              onClick={() =>
                update((next) => {
                  next.providers.splice(providerIndex, 1)
                })
              }
            >
              Remove provider
            </button>
          </div>

          <div className="prov__row">
            <label>
              <span>Base URL</span>
              <input
                className="inp mono"
                value={provider.baseUrl}
                aria-label="Base URL"
                onChange={(event) => updateProvider(providerIndex, { baseUrl: event.target.value })}
              />
            </label>
            <label>
              <span>API key</span>
              <input
                className="inp mono"
                value={provider.apiKey}
                aria-label="API key"
                onChange={(event) => updateProvider(providerIndex, { apiKey: event.target.value })}
              />
            </label>
            <label>
              <span>API</span>
              <Select
                value={provider.api}
                options={providerApiOptions(provider.api)}
                title="Provider API"
                block
                onChange={(api) => updateProvider(providerIndex, { api })}
              />
            </label>
          </div>

          <div className="models">
            {provider.models.length > 0 ? (
              <div className="mrow mrow--head" aria-hidden="true">
                <span>Model id</span>
                <span>Display name</span>
                <span>Context size</span>
                <span>Max output</span>
                <span />
                <span />
                <span />
              </div>
            ) : null}

            {provider.models.map((model, modelIndex) => (
              <div className="mrow" key={modelIndex}>
                <input
                  className="inp mono"
                  value={model.id}
                  aria-label="Model id"
                  onChange={(event) =>
                    updateModel(providerIndex, modelIndex, { id: event.target.value })
                  }
                />
                <input
                  className="inp"
                  value={model.name}
                  aria-label="Model display name"
                  onChange={(event) =>
                    updateModel(providerIndex, modelIndex, { name: event.target.value })
                  }
                />
                <input
                  className="inp num"
                  type="number"
                  min={0}
                  value={model.contextWindow}
                  aria-label="Context size in tokens"
                  title="Context size in tokens"
                  onChange={(event) =>
                    updateModel(providerIndex, modelIndex, {
                      contextWindow: Number(event.target.value) || 0
                    })
                  }
                />
                <input
                  className="inp num"
                  type="number"
                  min={0}
                  value={model.maxTokens}
                  aria-label="Max output size in tokens"
                  title="Max output size in tokens"
                  onChange={(event) =>
                    updateModel(providerIndex, modelIndex, {
                      maxTokens: Number(event.target.value) || 0
                    })
                  }
                />
                <label className="chk" title="The model supports reasoning effort">
                  <input
                    type="checkbox"
                    checked={model.reasoning}
                    onChange={(event) =>
                      updateModel(providerIndex, modelIndex, { reasoning: event.target.checked })
                    }
                  />
                  think
                </label>
                <label className="chk" title="The model accepts images">
                  <input
                    type="checkbox"
                    checked={model.input.includes('image')}
                    onChange={(event) =>
                      updateModel(providerIndex, modelIndex, {
                        input: event.target.checked ? ['text', 'image'] : ['text']
                      })
                    }
                  />
                  images
                </label>
                <button
                  className="ibtn"
                  title="Remove model"
                  aria-label="Remove model"
                  onClick={() =>
                    update((next) => {
                      next.providers[providerIndex].models.splice(modelIndex, 1)
                    })
                  }
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <button
            className="b sm"
            onClick={() =>
              update((next) => {
                next.providers[providerIndex].models.push(emptyModel())
              })
            }
          >
            ＋ Add model
          </button>
        </div>
      ))}

      <div className="addprov">
        <Select
          value={preset}
          options={presetOptions}
          onChange={setPreset}
          title="Provider preset"
          placeholder="Custom"
        />
        <button
          className="b sm"
          onClick={() =>
            update((next) => {
              const chosen = PROVIDER_PRESETS.find((entry) => entry.id === preset)
              next.providers.push(
                chosen
                  ? presetProvider(chosen, next.providers)
                  : emptyProvider(nextProviderId(next.providers))
              )
            })
          }
        >
          ＋ Add provider
        </button>
      </div>
    </section>
  )
}
