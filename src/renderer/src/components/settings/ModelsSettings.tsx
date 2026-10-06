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

  return (
    <section className="set-section">
      <h3>Models</h3>
      <p className="modal__hint">
        Definitions live in <span className="mono">{draft.path}</span>. Changes are saved
        automatically and applied to the running agent.
      </p>

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
                placeholder="http://127.0.0.1:8080/v1"
                onChange={(event) => updateProvider(providerIndex, { baseUrl: event.target.value })}
              />
            </label>
            <label>
              <span>API key</span>
              <input
                className="inp mono"
                value={provider.apiKey}
                placeholder="local"
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

          {provider.models.map((model, modelIndex) => (
            <div className="mrow" key={modelIndex}>
              <input
                className="inp mono"
                value={model.id}
                aria-label="Model id"
                placeholder="model id"
                onChange={(event) =>
                  updateModel(providerIndex, modelIndex, { id: event.target.value })
                }
              />
              <input
                className="inp"
                value={model.name}
                aria-label="Model name"
                placeholder="display name"
                onChange={(event) =>
                  updateModel(providerIndex, modelIndex, { name: event.target.value })
                }
              />
              <input
                className="inp num"
                type="number"
                min={0}
                value={model.contextWindow}
                aria-label="Context window"
                title="Context window (tokens)"
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
                aria-label="Max output tokens"
                title="Max output tokens"
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

      <button
        className="b sm"
        onClick={() =>
          update((next) => {
            next.providers.push(emptyProvider(nextProviderId(next.providers)))
          })
        }
      >
        ＋ Add provider
      </button>
    </section>
  )
}
