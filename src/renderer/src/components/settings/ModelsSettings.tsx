import { useEffect, useMemo, useRef, useState } from 'react'
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
 * credentials come from here. Models are left empty on purpose — "Add model"
 * offers that provider's real catalogue.
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

/** A model offered by a provider's catalogue, plus whether it is already added. */
type CatalogState =
  | { status: 'loading' }
  | { status: 'ready'; models: ModelDefDto[] }
  | { status: 'error'; message: string }

/**
 * Provider and model catalogue editor.
 *
 * Edits are written to `<agentDir>/models.json` shortly after the last change
 * and the running agent reloads the catalogue, so a new model is selectable in
 * the composer without restarting PiUI.
 */
export function ModelsSettings() {
  const config = usePiUi((state) => state.modelsConfig)
  const modelsError = usePiUi((state) => state.modelsError)
  const save = usePiUi((state) => state.saveModelsConfig)

  const [draft, setDraft] = useState<ModelsConfigDto | null>(null)
  /** Provider indices whose API key is visible. */
  const [revealed, setRevealed] = useState<number[]>([])
  /** Provider index whose catalogue picker is open. */
  const [picker, setPicker] = useState<number | null>(null)
  /** Whether the "add provider" menu is open. */
  const [adding, setAdding] = useState(false)
  const [query, setQuery] = useState('')
  const [catalogs, setCatalogs] = useState<Record<string, CatalogState>>({})

  const hydrated = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const addRef = useRef<HTMLDivElement | null>(null)

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

  // Close the add-provider menu on an outside click or Escape.
  useEffect(() => {
    if (!adding) return

    const onPointerDown = (event: globalThis.PointerEvent): void => {
      if (!addRef.current?.contains(event.target as Node)) setAdding(false)
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setAdding(false)
    }

    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [adding])

  const pickerProvider = picker !== null ? draft?.providers[picker] : undefined

  // Load the chosen provider's catalogue the first time its picker opens.
  useEffect(() => {
    const id = pickerProvider?.id
    if (!id || catalogs[id] !== undefined) return

    setCatalogs((current) => ({ ...current, [id]: { status: 'loading' } }))
    window.piui
      .listProviderModels(id)
      .then((models) =>
        setCatalogs((current) => ({ ...current, [id]: { status: 'ready', models } }))
      )
      .catch((cause: unknown) =>
        setCatalogs((current) => ({
          ...current,
          [id]: { status: 'error', message: cause instanceof Error ? cause.message : String(cause) }
        }))
      )
  }, [pickerProvider?.id, catalogs])

  const catalogState = pickerProvider ? catalogs[pickerProvider.id] : undefined

  const matches = useMemo(() => {
    if (!pickerProvider || catalogState?.status !== 'ready') return []
    const taken = new Set(pickerProvider.models.map((model) => model.id))
    const needle = query.trim().toLowerCase()
    return catalogState.models
      .filter((model) => !taken.has(model.id))
      .filter(
        (model) =>
          needle.length === 0 ||
          model.id.toLowerCase().includes(needle) ||
          model.name.toLowerCase().includes(needle)
      )
      .slice(0, 60)
  }, [pickerProvider, catalogState, query])

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

  const toggleReveal = (index: number): void =>
    setRevealed((current) =>
      current.includes(index) ? current.filter((entry) => entry !== index) : [...current, index]
    )

  const openPicker = (index: number): void => {
    setPicker(index)
    setQuery('')
  }

  return (
    <section className="set-section">
      <h3>Models</h3>

      {modelsError ? (
        <p className="hint bad">
          This catalogue could not be loaded, so no model is selectable: {modelsError}
        </p>
      ) : null}

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
              <span className="secret">
                <input
                  className="inp mono"
                  type={revealed.includes(providerIndex) ? 'text' : 'password'}
                  value={provider.apiKey}
                  aria-label="API key"
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(event) =>
                    updateProvider(providerIndex, { apiKey: event.target.value })
                  }
                />
                <button
                  type="button"
                  className="secret__eye"
                  title={revealed.includes(providerIndex) ? 'Hide API key' : 'Show API key'}
                  aria-label={revealed.includes(providerIndex) ? 'Hide API key' : 'Show API key'}
                  aria-pressed={revealed.includes(providerIndex)}
                  onClick={() => toggleReveal(providerIndex)}
                >
                  {revealed.includes(providerIndex) ? (
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.4"
                    >
                      <path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z" />
                      <circle cx="8" cy="8" r="2" />
                    </svg>
                  ) : (
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.4"
                    >
                      <path d="M1.5 8S4 3.5 8 3.5c1.2 0 2.2.4 3.1 1M14.5 8S12 12.5 8 12.5c-1.2 0-2.2-.4-3.1-1" />
                      <path d="M2.5 2.5l11 11" />
                    </svg>
                  )}
                </button>
              </span>
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

          {picker === providerIndex ? (
            <div className="mpick">
              <div className="mpick__hd">
                <input
                  className="inp"
                  autoFocus
                  value={query}
                  placeholder={`Search ${provider.id} models`}
                  aria-label={`Search ${provider.id} models`}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') setPicker(null)
                  }}
                />
                <button className="b sm" onClick={() => setPicker(null)}>
                  Cancel
                </button>
              </div>

              {catalogState?.status === 'loading' ? (
                <p className="hint">Reading {provider.id}’s catalogue…</p>
              ) : null}
              {catalogState?.status === 'error' ? (
                <p className="hint bad">{catalogState.message}</p>
              ) : null}
              {catalogState?.status === 'ready' && catalogState.models.length === 0 ? (
                <p className="hint">
                  {provider.id} has no published catalogue, so models have to be declared by hand.
                </p>
              ) : null}

              <div className="mpick__list">
                {matches.map((model) => (
                  <button
                    key={model.id}
                    className="mpick__row"
                    onClick={() => {
                      update((next) => {
                        next.providers[providerIndex].models.push({ ...model })
                      })
                      setQuery('')
                    }}
                  >
                    <span className="mono mpick__id">{model.id}</span>
                    <span className="mpick__name">{model.name}</span>
                    <span className="sp" />
                    <span className="mpick__meta">
                      {model.contextWindow ? `${Math.round(model.contextWindow / 1024)}k ctx` : ''}
                    </span>
                  </button>
                ))}
                {catalogState?.status === 'ready' && matches.length === 0 ? (
                  <p className="hint">No matching models left to add.</p>
                ) : null}
              </div>

              <button
                className="b sm"
                onClick={() => {
                  update((next) => {
                    next.providers[providerIndex].models.push(emptyModel())
                  })
                  setPicker(null)
                }}
              >
                Add a blank model instead
              </button>
            </div>
          ) : (
            <button className="b sm" onClick={() => openPicker(providerIndex)}>
              ＋ Add model
            </button>
          )}
        </div>
      ))}

      <div className="addprov" ref={addRef}>
        <button
          type="button"
          className="b addprov__btn"
          aria-haspopup="menu"
          aria-expanded={adding}
          onClick={() => setAdding((wasOpen) => !wasOpen)}
        >
          ＋ Add provider
        </button>

        {adding ? (
          <div className="admenu" role="menu">
            {PROVIDER_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                role="menuitem"
                className="admenu__item"
                onClick={() => {
                  update((next) => {
                    next.providers.push(presetProvider(preset, next.providers))
                  })
                  setAdding(false)
                }}
              >
                <span>{preset.label}</span>
                <small>{preset.baseUrl}</small>
              </button>
            ))}

            <button
              type="button"
              role="menuitem"
              className="admenu__item"
              onClick={() => {
                update((next) => {
                  next.providers.push(emptyProvider(nextProviderId(next.providers)))
                })
                setAdding(false)
              }}
            >
              <span>Custom provider</span>
              <small>Local or self-hosted endpoint</small>
            </button>
          </div>
        ) : null}
      </div>
    </section>
  )
}
