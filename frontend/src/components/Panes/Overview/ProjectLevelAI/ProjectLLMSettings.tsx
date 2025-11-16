import { type ChangeEvent, useEffect, useMemo, useState } from "react";
import {
  MdAdd,
  MdCheckCircle,
  MdDelete,
  MdErrorOutline,
  MdHourglassTop,
  MdVisibility,
  MdVisibilityOff,
} from "react-icons/md";
import {
  loadLLMConfig,
  loadLLMPresets,
  saveLLMConfig,
  testLLMConfig,
} from "state/actions/ai";
import { useAIStore } from "state/definitions";
import { C } from "utils/c";
import {
  LLMConfigPayload,
  LLMConfigTestResultPayload,
  LLMGatewayTestResultPayload,
  LLMModelConfigPayload,
  LLMProviderConfigPayload,
  LLMProviderPresetPayload,
  LLMProviderTestResultPayload,
  createLLMConfigPayload,
  createLLMModelConfigPayload,
} from "utils/generatedTypes";
import { shallow } from "zustand/shallow";

type HeaderRow = { id: string; key: string; value: string };
type EditableProvider = Omit<LLMProviderConfigPayload, "extra_headers"> & {
  headerRows: HeaderRow[];
};
type EditableLLMConfig = Omit<LLMConfigPayload, "providers"> & {
  providers: EditableProvider[];
};

export function ProjectLLMSettings() {
  const { llmConfig, llmConfigLoaded, llmPresets, llmPresetsLoaded } = useAIStore(
    (x) => ({
      llmConfig: x.llmConfig,
      llmConfigLoaded: x.llmConfigLoaded,
      llmPresets: x.llmPresets,
      llmPresetsLoaded: x.llmPresetsLoaded,
    }),
    shallow,
  );

  const [editableConfig, setEditableConfig] =
    useState<EditableLLMConfig | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] =
    useState<LLMConfigTestResultPayload | null>(null);

  useEffect(() => {
    if (!llmConfigLoaded) {
      loadLLMConfig();
    }
  }, [llmConfigLoaded]);

  useEffect(() => {
    if (!llmPresetsLoaded) {
      loadLLMPresets();
    }
  }, [llmPresetsLoaded]);

  useEffect(() => {
    if (!llmConfigLoaded) {
      return;
    }
    const payload = llmConfig ?? createLLMConfigPayload({});
    setEditableConfig(payloadToEditable(payload));
    setIsDirty(false);
    setError(null);
    setSaving(false);
    setTesting(false);
    setTestResult(null);
  }, [llmConfigLoaded, llmConfig]);

  const configPath = `${C.SETTA_FILES_FOLDER}/llm_config.json`;
  const providerPresets = llmPresets?.providers ?? [];
  const providerPresetMap = useMemo(() => {
    const entries = new Map<string, LLMProviderPresetPayload>();
    for (const preset of providerPresets) {
      entries.set(preset.preset_id, preset);
      entries.set(preset.provider.provider_id, preset);
    }
    return entries;
  }, [providerPresets]);

  if (!llmConfigLoaded || !editableConfig) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-setta-500 dark:text-setta-400">
        Loading LLM configuration...
      </div>
    );
  }

  const updateConfig = (
    updater: (curr: EditableLLMConfig) => EditableLLMConfig,
  ) => {
    let updated = false;
    setEditableConfig((curr) => {
      if (!curr) {
        return curr;
      }
      updated = true;
      return updater(curr);
    });
    if (updated) {
      setIsDirty(true);
      setError(null);
      setTestResult(null);
    }
  };

  const updateProvider = (index: number, provider: EditableProvider) => {
    updateConfig((curr) => {
      const providers = [...curr.providers];
      providers[index] = provider;
      return { ...curr, providers };
    });
  };

  const removeProvider = (index: number) => {
    updateConfig((curr) => ({
      ...curr,
      providers: curr.providers.filter((_, i) => i !== index),
    }));
  };

  const addProvider = () => {
    updateConfig((curr) => ({
      ...curr,
      providers: [
        ...curr.providers,
        createEmptyEditableProvider(curr.providers.length + 1),
      ],
    }));
  };

  const addProviderFromPreset = (preset: LLMProviderPresetPayload) => {
    updateConfig((curr) => ({
      ...curr,
      providers: [
        ...curr.providers,
        providerPayloadToEditable(preset.provider, {
          presetIdOverride: preset.preset_id,
          hydrateModelPresets: true,
        }),
      ],
    }));
  };

  const handleReset = () => {
    if (!llmConfigLoaded) {
      return;
    }
    const payload = llmConfig ?? createLLMConfigPayload({});
    setEditableConfig(payloadToEditable(payload));
    setIsDirty(false);
    setError(null);
    setTestResult(null);
  };

  const runValidation = async (payload: LLMConfigPayload) => {
    setTesting(true);
    setError(null);
    try {
      const result = await testLLMConfig(payload);
      setTestResult(result);
      const passed = didConfigTestPass(result);
      return { passed, result };
    } catch (exc) {
      console.error(exc);
      const message =
        exc instanceof Error
          ? exc.message
          : "Failed to test LLM configuration";
      setError(message);
      setTestResult(null);
      return { passed: false, result: null };
    } finally {
      setTesting(false);
    }
  };

  const handleTest = async () => {
    if (!editableConfig) {
      return;
    }
    const payload = editableToPayload(editableConfig);
    await runValidation(payload);
  };

  const handleSave = async () => {
    if (!editableConfig) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = editableToPayload(editableConfig);
      const validation = await runValidation(payload);
      if (!validation.passed) {
        setError("Validation failed. Fix the errors above before saving.");
        return;
      }
      const result = await saveLLMConfig(payload);
      if (!result.ok) {
        setError(result.error ?? "Failed to save LLM configuration");
      } else {
        setIsDirty(false);
      }
    } catch (exc) {
      console.error(exc);
      setError("Failed to save LLM configuration");
    } finally {
      setSaving(false);
    }
  };

  const providers = editableConfig.providers;
  const disableSave = saving || testing || !isDirty;
  const providerTestMap = useMemo(() => {
    if (!testResult) {
      return new Map<string, LLMProviderTestResultPayload>();
    }
    return new Map(
      testResult.providers.map((provider) => [provider.provider_id, provider]),
    );
  }, [testResult]);
  const gatewayTestResult = testResult?.gateway ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto pb-[30dvh] text-setta-600 dark:text-setta-400">
      <div className="rounded-lg border border-setta-200/60 p-4 text-xs dark:border-setta-700/60">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-setta-700 dark:text-setta-100">
            Gateway
          </p>
          <TestStatusBadge
            label="Gateway"
            result={gatewayTestResult}
            testing={testing}
          />
        </div>
        <label className="mt-3 flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-setta-500 dark:text-setta-400">
          Gateway URL
          <input
            className="rounded-md border border-setta-200/60 bg-transparent px-2 py-1 text-sm text-setta-700 outline-none focus-visible:ring-2 dark:border-setta-700 dark:text-setta-100"
            value={editableConfig.gateway_url}
            onChange={(e) =>
              updateConfig((curr) => ({
                ...curr,
                gateway_url: e.target.value,
              }))
            }
            placeholder="http://127.0.0.1:8787"
          />
        </label>
        <p className="mt-2 text-[11px] leading-relaxed text-setta-500 dark:text-setta-400">
          Changes are persisted to{" "}
          <code className="font-mono text-[11px]">{configPath}</code>. Saving
          immediately rewrites that JSON file and broadcasts the update so the
          chat UI refreshes without reloading the app.
        </p>
        {gatewayTestResult && !gatewayTestResult.ok ? (
          <div className="mt-2 rounded-md border border-red-200/70 bg-red-50 p-2 text-[11px] text-red-700 dark:border-red-700/60 dark:bg-red-900/30 dark:text-red-200">
            {gatewayTestResult.error ?? "Gateway validation failed."}
          </div>
        ) : null}
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-setta-700 dark:text-setta-100">
              Providers
            </p>
            <p className="text-[11px] text-setta-500 dark:text-setta-400">
              Configure provider slugs, API keys, optional base URLs/regions,
              and which models should appear in the chat dropdown.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {llmPresetsLoaded ? (
              providerPresets.length > 0 ? (
                <ProviderPresetPicker
                  presets={providerPresets}
                  onSelect={addProviderFromPreset}
                />
              ) : (
                <span className="text-[11px] text-setta-500 dark:text-setta-400">
                  No presets yet
                </span>
              )
            ) : (
              <span className="text-[11px] text-setta-500 dark:text-setta-400">
                Loading presets...
              </span>
            )}
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md border border-dashed border-setta-400 px-2 py-1 text-xs font-semibold text-setta-600 transition-colors hover:bg-setta-100 dark:border-setta-600 dark:text-setta-300 dark:hover:bg-setta-800"
              onClick={addProvider}
            >
              <MdAdd size={14} />
              Add provider
            </button>
          </div>
        </div>

        {providers.length === 0 ? (
          <div className="rounded-lg border border-dashed border-setta-300/70 p-4 text-xs dark:border-setta-600">
            No providers configured yet. Add one to begin wiring models through
            the Portkey gateway.
          </div>
        ) : (
          providers.map((provider, index) => (
            <ProviderEditor
              key={`${provider.provider_id || "provider"}-${index}`}
              provider={provider}
              onChange={(next) => updateProvider(index, next)}
              onRemove={() => removeProvider(index)}
              preset={
                provider.preset_id
                  ? providerPresetMap.get(provider.preset_id) ?? null
                  : null
              }
              testResult={providerTestMap.get(provider.provider_id) ?? null}
              testing={testing}
            />
          ))
        )}
      </section>

      <div className="flex flex-col gap-2 border-t border-setta-200/70 pt-3 dark:border-setta-700">
        {error ? (
          <p className="text-[11px] text-red-600 dark:text-red-400">{error}</p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:bg-setta-300 dark:disabled:bg-setta-700"
            onClick={handleSave}
            disabled={disableSave}
          >
            {saving ? "Saving..." : "Save changes"}
          </button>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-md border border-setta-300 px-4 py-2 text-sm font-semibold text-setta-600 transition hover:bg-setta-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-setta-600 dark:text-setta-300 dark:hover:bg-setta-800"
            onClick={handleTest}
            disabled={saving || testing}
          >
            {testing ? "Testing..." : "Test configuration"}
          </button>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-md border border-setta-300 px-4 py-2 text-sm font-semibold text-setta-600 transition hover:bg-setta-100 dark:border-setta-600 dark:text-setta-300 dark:hover:bg-setta-800"
            onClick={handleReset}
            disabled={saving || !isDirty}
          >
            Reset
          </button>
          {isDirty ? (
            <span className="self-center text-[11px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
              Unsaved changes
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

type ProviderEditorProps = {
  provider: EditableProvider;
  onChange: (provider: EditableProvider) => void;
  onRemove: () => void;
  preset: LLMProviderPresetPayload | null;
  testResult: LLMProviderTestResultPayload | null;
  testing: boolean;
};

function ProviderEditor({
  provider,
  onChange,
  onRemove,
  preset,
  testResult,
  testing,
}: ProviderEditorProps) {
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const presetModels =
    preset?.provider.models.filter(
      (model) =>
        !provider.models.some(
          (existing) => existing.model_id === model.model_id,
        ),
    ) ?? [];
  const presetModelLookup = useMemo(() => {
    if (!preset) {
      return null;
    }
    return new Map(
      preset.provider.models.map((model) => [model.model_id, model]),
    );
  }, [preset]);

  const updateProvider = (partial: Partial<EditableProvider>) => {
    onChange({ ...provider, ...partial });
  };

  const updateModelAt = (index: number, model: LLMModelConfigPayload) => {
    const nextModels = provider.models.map((existing, i) =>
      i === index ? model : existing,
    );
    let nextDefault = provider.default_model_id;
    const prevModel = provider.models[index];
    if (prevModel && prevModel.model_id === nextDefault) {
      nextDefault = model.model_id;
    }
    if (
      nextDefault &&
      !nextModels.some((item) => item.model_id === nextDefault)
    ) {
      nextDefault = nextModels[0]?.model_id ?? null;
    }
    updateProvider({
      models: nextModels,
      default_model_id: nextDefault,
    });
  };

  const removeModelAt = (index: number) => {
    const nextModels = provider.models.filter((_, i) => i !== index);
    const nextDefault =
      provider.default_model_id &&
      nextModels.some((model) => model.model_id === provider.default_model_id)
        ? provider.default_model_id
        : nextModels[0]?.model_id ?? null;
    updateProvider({ models: nextModels, default_model_id: nextDefault });
  };

  const addModel = () => {
    const suffix = provider.models.length + 1;
    const newModel = createLLMModelConfigPayload({
      display_name: `Model ${suffix}`,
      model_id: `${provider.provider_id || "model"}-${suffix}`,
    });
    updateProvider({ models: [...provider.models, newModel] });
  };

  const handlePresetModelSelect = (model: LLMModelConfigPayload) => {
    const newModel = createLLMModelConfigPayload({
      ...model,
      preset_id: model.preset_id ?? model.model_id,
    });
    const nextModels = [...provider.models, newModel];
    const nextDefault = provider.default_model_id ?? newModel.model_id;
    updateProvider({ models: nextModels, default_model_id: nextDefault });
  };

  const updateHeaderRow = (rowId: string, partial: Partial<HeaderRow>) => {
    updateProvider({
      headerRows: provider.headerRows.map((row) =>
        row.id === rowId ? { ...row, ...partial } : row,
      ),
    });
  };

  const removeHeaderRow = (rowId: string) => {
    updateProvider({
      headerRows: provider.headerRows.filter((row) => row.id !== rowId),
    });
  };

  const addHeaderRow = () => {
    updateProvider({
      headerRows: [...provider.headerRows, createEmptyHeaderRow()],
    });
  };

  return (
    <div className="rounded-lg border border-setta-200/70 p-4 text-xs shadow-sm dark:border-setta-700">
      <div className="flex flex-col gap-3">
        <div className="flex justify-between gap-3">
          <div className="flex flex-1 flex-col gap-2">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-setta-500 dark:text-setta-400">
              Display Name
              <input
                className="mt-1 rounded-md border border-setta-200/60 bg-transparent px-2 py-1 text-sm text-setta-700 outline-none focus-visible:ring-2 dark:border-setta-700 dark:text-setta-100"
                value={provider.display_name}
                onChange={(e) =>
                  updateProvider({ display_name: e.target.value })
                }
                placeholder="Acme OpenAI"
              />
            </label>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-setta-500 dark:text-setta-400">
              Provider Slug
              <input
                className="mt-1 rounded-md border border-setta-200/60 bg-transparent px-2 py-1 font-mono text-[12px] text-setta-700 outline-none focus-visible:ring-2 dark:border-setta-700 dark:text-setta-100"
                value={provider.provider_id}
                onChange={(e) =>
                  updateProvider({ provider_id: e.target.value })
                }
                placeholder="openai"
              />
            </label>
          </div>
          <div className="flex flex-col items-end gap-2">
            <TestStatusBadge
              label="Provider"
              result={testResult}
              testing={testing}
            />
            <button
              type="button"
              className="h-8 w-8 shrink-0 rounded-full border border-setta-300 text-setta-400 transition hover:border-red-400 hover:text-red-600 dark:border-setta-700 dark:text-setta-500 dark:hover:border-red-500 dark:hover:text-red-400"
              onClick={onRemove}
              aria-label="Remove provider"
            >
              <MdDelete className="mx-auto mt-1.5" size={16} />
            </button>
          </div>
        </div>

        <ProviderPresetMeta preset={preset} />

        <div className="grid gap-3 @[32rem]:grid-cols-2">
          <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-setta-500 dark:text-setta-400">
            Base URL (optional)
            <input
              className="rounded-md border border-setta-200/60 bg-transparent px-2 py-1 text-sm text-setta-700 outline-none focus-visible:ring-2 dark:border-setta-700 dark:text-setta-100"
              value={provider.base_url ?? ""}
              onChange={(e) =>
                updateProvider({
                  base_url: e.target.value ? e.target.value : null,
                })
              }
              placeholder="https://gateway.example.com"
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-setta-500 dark:text-setta-400">
            Default Model
            <select
              className="rounded-md border border-setta-200/60 bg-transparent px-2 py-1 text-sm text-setta-700 outline-none focus-visible:ring-2 dark:border-setta-700 dark:text-setta-100"
              value={provider.default_model_id ?? ""}
              onChange={(e) =>
                updateProvider({
                  default_model_id: e.target.value || null,
                })
              }
              disabled={provider.models.length === 0}
            >
              <option value="">No default</option>
              {provider.models.map((model) => (
                <option value={model.model_id} key={model.model_id}>
                  {model.display_name || model.model_id}
                </option>
              ))}
            </select>
          </label>
        </div>

        {testResult && !testResult.ok ? (
          <div className="rounded-md border border-red-200/70 bg-red-50 p-2 text-[11px] text-red-700 dark:border-red-700/60 dark:bg-red-900/30 dark:text-red-200">
            <p className="font-semibold">Validation errors</p>
            <ul className="ml-4 list-disc">
              {testResult.errors.length > 0 ? (
                testResult.errors.map((err, idx) => (
                  <li key={`${err.code ?? "error"}-${idx}`}>{err.message}</li>
                ))
              ) : (
                <li>Unknown validation failure.</li>
              )}
            </ul>
          </div>
        ) : null}

        <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-setta-500 dark:text-setta-400">
          Provider API Key
          <div className="flex gap-2">
            <input
              className="grow rounded-md border border-setta-200/60 bg-transparent px-2 py-1 font-mono text-[12px] text-setta-700 outline-none focus-visible:ring-2 dark:border-setta-700 dark:text-setta-100"
              type={apiKeyVisible ? "text" : "password"}
              value={provider.api_key}
              onChange={(e) => updateProvider({ api_key: e.target.value })}
              autoComplete="off"
              placeholder="sk-..."
            />
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-md border border-setta-300 px-2 text-[11px] font-semibold uppercase tracking-wide text-setta-500 dark:border-setta-600 dark:text-setta-300"
              onClick={() => setApiKeyVisible((curr) => !curr)}
            >
              {apiKeyVisible ? <MdVisibilityOff size={14} /> : <MdVisibility size={14} />}
            </button>
          </div>
        </label>

        <div className="flex flex-col gap-2 rounded-md border border-dashed border-setta-300/70 p-3 dark:border-setta-600/70">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-setta-600 dark:text-setta-200">
              Extra headers (optional)
            </p>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md border border-setta-300 px-2 py-0.5 text-[11px] font-semibold text-setta-600 transition hover:bg-setta-100 dark:border-setta-600 dark:text-setta-300 dark:hover:bg-setta-800"
              onClick={addHeaderRow}
            >
              <MdAdd size={12} />
              Add header
            </button>
          </div>
          {provider.headerRows.length === 0 ? (
            <p className="text-[11px] text-setta-500 dark:text-setta-400">
              Add custom headers like <code>portkey-region</code> whenever your
              gateway routing requires them.
            </p>
          ) : (
            provider.headerRows.map((row) => (
              <div key={row.id} className="flex gap-2">
                <input
                  className="w-40 rounded-md border border-setta-200/60 bg-transparent px-2 py-1 font-mono text-[12px] text-setta-700 outline-none focus-visible:ring-2 dark:border-setta-700 dark:text-setta-100"
                  value={row.key}
                  onChange={(e) =>
                    updateHeaderRow(row.id, { key: e.target.value })
                  }
                  placeholder="header-name"
                />
                <input
                  className="grow rounded-md border border-setta-200/60 bg-transparent px-2 py-1 font-mono text-[12px] text-setta-700 outline-none focus-visible:ring-2 dark:border-setta-700 dark:text-setta-100"
                  value={row.value}
                  onChange={(e) =>
                    updateHeaderRow(row.id, { value: e.target.value })
                  }
                  placeholder="header-value"
                />
                <button
                  type="button"
                  className="h-8 w-8 shrink-0 rounded-md border border-setta-300 text-setta-400 transition hover:border-red-400 hover:text-red-500 dark:border-setta-600 dark:text-setta-500 dark:hover:border-red-500 dark:hover:text-red-400"
                  onClick={() => removeHeaderRow(row.id)}
                  aria-label="Remove header"
                >
                  <MdDelete className="mx-auto mt-1.5" size={14} />
                </button>
              </div>
            ))
          )}
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold text-setta-600 dark:text-setta-200">
              Models
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {presetModels.length > 0 ? (
                <ModelPresetPicker
                  models={presetModels}
                  onSelect={handlePresetModelSelect}
                />
              ) : null}
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-md border border-setta-300 px-2 py-0.5 text-[11px] font-semibold text-setta-600 transition hover:bg-setta-100 dark:border-setta-600 dark:text-setta-300 dark:hover:bg-setta-800"
                onClick={addModel}
              >
                <MdAdd size={12} />
                Add model
              </button>
            </div>
          </div>
          {provider.models.length === 0 ? (
            <p className="text-[11px] text-setta-500 dark:text-setta-400">
              Add at least one model so the chat UI can present it in the
              dropdown.
            </p>
          ) : (
            provider.models.map((model, index) => (
              <ModelEditor
                key={`${model.model_id || "model"}-${index}`}
                model={model}
                onChange={(nextModel) => updateModelAt(index, nextModel)}
                onRemove={() => removeModelAt(index)}
                presetModel={
                  model.preset_id && presetModelLookup
                    ? presetModelLookup.get(model.preset_id) ?? null
                    : null
                }
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

type ProviderPresetPickerProps = {
  presets: LLMProviderPresetPayload[];
  onSelect: (preset: LLMProviderPresetPayload) => void;
};

function ProviderPresetPicker({ presets, onSelect }: ProviderPresetPickerProps) {
  const [selection, setSelection] = useState("");

  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const presetId = event.target.value;
    if (!presetId) {
      return;
    }
    const preset = presets.find((item) => item.preset_id === presetId);
    setSelection("");
    if (preset) {
      onSelect(preset);
    }
  };

  return (
    <select
      className="rounded-md border border-setta-300 bg-transparent px-2 py-1 text-xs font-semibold text-setta-600 outline-none focus-visible:ring-2 dark:border-setta-600 dark:text-setta-300"
      value={selection}
      onChange={handleChange}
    >
      <option value="">Add provider preset...</option>
      {presets.map((preset) => (
        <option value={preset.preset_id} key={preset.preset_id}>
          {preset.label}
        </option>
      ))}
    </select>
  );
}

type ModelPresetPickerProps = {
  models: LLMModelConfigPayload[];
  onSelect: (model: LLMModelConfigPayload) => void;
};

function ModelPresetPicker({ models, onSelect }: ModelPresetPickerProps) {
  const [selection, setSelection] = useState("");

  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const modelId = event.target.value;
    if (!modelId) {
      return;
    }
    const model = models.find((item) => item.model_id === modelId);
    setSelection("");
    if (model) {
      onSelect(model);
    }
  };

  return (
    <select
      className="rounded-md border border-setta-300 bg-transparent px-2 py-1 text-[11px] font-semibold text-setta-600 outline-none focus-visible:ring-2 dark:border-setta-600 dark:text-setta-300"
      value={selection}
      onChange={handleChange}
    >
      <option value="">Add preset model...</option>
      {models.map((model) => (
        <option value={model.model_id} key={model.model_id}>
          {model.display_name || model.model_id}
        </option>
      ))}
    </select>
  );
}

type ModelEditorProps = {
  model: LLMModelConfigPayload;
  onChange: (model: LLMModelConfigPayload) => void;
  onRemove: () => void;
  presetModel: LLMModelConfigPayload | null;
};

function ModelEditor({
  model,
  onChange,
  onRemove,
  presetModel,
}: ModelEditorProps) {
  return (
    <div className="rounded-md border border-setta-200/70 p-3 dark:border-setta-700/70">
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <div className="flex items-start justify-between gap-2">
            <label className="flex-1 text-[11px] font-semibold uppercase tracking-wide text-setta-500 dark:text-setta-400">
              Display Name
              <input
                className="mt-1 rounded-md border border-setta-200/60 bg-transparent px-2 py-1 text-sm text-setta-700 outline-none focus-visible:ring-2 dark:border-setta-700 dark:text-setta-100"
                value={model.display_name}
                onChange={(e) =>
                  onChange({
                    ...model,
                    display_name: e.target.value,
                  })
                }
                placeholder="GPT-4 Turbo"
              />
            </label>
            <ModelPresetMeta presetModel={presetModel} />
          </div>
        </div>
        <button
          type="button"
          className="h-8 w-8 shrink-0 rounded-full border border-setta-300 text-setta-400 transition hover:border-red-400 hover:text-red-500 dark:border-setta-600 dark:text-setta-500 dark:hover:border-red-500 dark:hover:text-red-400"
          onClick={onRemove}
          aria-label="Remove model"
        >
          <MdDelete className="mx-auto mt-1.5" size={14} />
        </button>
      </div>
      <label className="mt-3 flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-setta-500 dark:text-setta-400">
        Model ID
        <input
          className="rounded-md border border-setta-200/60 bg-transparent px-2 py-1 font-mono text-[12px] text-setta-700 outline-none focus-visible:ring-2 dark:border-setta-700 dark:text-setta-100"
          value={model.model_id}
          onChange={(e) =>
            onChange({
              ...model,
              model_id: e.target.value,
            })
          }
          placeholder="gpt-4o"
        />
      </label>
      <label className="mt-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-setta-500 dark:text-setta-400">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-setta-400 text-blue-600 focus:ring-blue-500 dark:border-setta-600"
          checked={model.supports_reasoning}
          onChange={(e) =>
            onChange({
              ...model,
              supports_reasoning: e.target.checked,
            })
          }
        />
        Supports reasoning
      </label>
    </div>
  );
}

type ProviderPresetMetaProps = {
  preset: LLMProviderPresetPayload | null;
};

function ProviderPresetMeta({ preset }: ProviderPresetMetaProps) {
  if (!preset) {
    return (
      <div className="rounded-md border border-dashed border-setta-300/60 bg-setta-50/40 p-2 text-[11px] font-semibold uppercase tracking-wide text-setta-500 dark:border-setta-600/60 dark:bg-setta-900/20 dark:text-setta-400">
        Custom provider
      </div>
    );
  }
  return (
    <div className="rounded-md border border-blue-200/70 bg-blue-50 p-2 text-[11px] text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-200">
      <p className="font-semibold uppercase tracking-wide">
        Preset · {preset.label}
      </p>
      {preset.description ? (
        <p className="mt-1 text-[10px] font-normal normal-case text-blue-600 dark:text-blue-200/80">
          {preset.description}
        </p>
      ) : null}
    </div>
  );
}

type ModelPresetMetaProps = {
  presetModel: LLMModelConfigPayload | null;
};

function ModelPresetMeta({ presetModel }: ModelPresetMetaProps) {
  const baseClass =
    "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide";
  if (!presetModel) {
    return (
      <span className={`${baseClass} border border-dashed border-setta-400 text-setta-500 dark:border-setta-600 dark:text-setta-400`}>
        Custom model
      </span>
    );
  }
  const label = presetModel.display_name || presetModel.model_id;
  return (
    <span className={`${baseClass} border border-blue-200 text-blue-700 dark:border-blue-900/70 dark:text-blue-200`}>
      Preset · {label}
    </span>
  );
}

function createEmptyEditableProvider(counter: number): EditableProvider {
  return {
    provider_id: `provider-${counter}`,
    display_name: "New provider",
    preset_id: null,
    api_key: "",
    base_url: null,
    default_model_id: null,
    models: [],
    headerRows: [],
  };
}

function createHeaderRowId() {
  return `hdr-${Math.random().toString(36).slice(2, 10)}`;
}

function createEmptyHeaderRow(): HeaderRow {
  return { id: createHeaderRowId(), key: "", value: "" };
}

type ProviderPayloadToEditableOptions = {
  presetIdOverride?: string | null;
  hydrateModelPresets?: boolean;
};

function payloadToEditable(payload: LLMConfigPayload): EditableLLMConfig {
  return {
    gateway_url: payload.gateway_url,
    default_project_config_id: payload.default_project_config_id,
    project_configs: payload.project_configs,
    providers: payload.providers.map((provider) =>
      providerPayloadToEditable(provider),
    ),
  };
}

function providerPayloadToEditable(
  provider: LLMProviderConfigPayload,
  options: ProviderPayloadToEditableOptions = {},
): EditableProvider {
  const presetId =
    options.presetIdOverride !== undefined
      ? options.presetIdOverride
      : provider.preset_id;
  const hydrateModelPresets = Boolean(options.hydrateModelPresets);

  return {
    provider_id: provider.provider_id,
    display_name: provider.display_name,
    preset_id: presetId ?? null,
    api_key: provider.api_key,
    base_url: provider.base_url,
    default_model_id: provider.default_model_id,
    models: provider.models.map((model) => ({
      ...model,
      preset_id:
        model.preset_id ?? (hydrateModelPresets ? model.model_id : null),
    })),
    headerRows: Object.entries(provider.extra_headers ?? {}).map(
      ([key, value]) => ({
        id: createHeaderRowId(),
        key,
        value,
      }),
    ),
  };
}

function editableToPayload(config: EditableLLMConfig): LLMConfigPayload {
  return {
    gateway_url: config.gateway_url,
    default_project_config_id: config.default_project_config_id,
    project_configs: config.project_configs,
    providers: config.providers.map((provider) => {
      const headerEntries = provider.headerRows
        .map((row) => ({
          key: row.key.trim(),
          value: row.value.trim(),
        }))
        .filter((row) => row.key && row.value);
      const extraHeaders =
        headerEntries.length > 0
          ? headerEntries.reduce((acc, row) => {
              acc[row.key] = row.value;
              return acc;
            }, {} as Record<string, string>)
          : null;
      const validModelIds = new Set(
        provider.models.map((model) => model.model_id),
      );
      const defaultModelId =
        provider.default_model_id && validModelIds.has(provider.default_model_id)
          ? provider.default_model_id
          : provider.models[0]?.model_id ?? null;

      return {
        provider_id: provider.provider_id,
        display_name: provider.display_name,
        preset_id: provider.preset_id,
        api_key: provider.api_key,
        base_url: provider.base_url,
        default_model_id: defaultModelId,
        extra_headers: extraHeaders,
        models: provider.models,
      };
    }),
  };
}

type TestStatusBadgeProps = {
  label: string;
  result:
    | LLMGatewayTestResultPayload
    | LLMProviderTestResultPayload
    | null;
  testing: boolean;
};

function TestStatusBadge({ label, result, testing }: TestStatusBadgeProps) {
  const base = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide";
  if (testing) {
    return (
      <span className={`${base} text-blue-600 dark:text-blue-400`}>
        <MdHourglassTop size={12} />
        Testing...
      </span>
    );
  }
  if (!result) {
    return (
      <span className={`${base} text-setta-400`}>
        <MdHourglassTop size={12} />
        Not tested
      </span>
    );
  }
  if (result.ok) {
    return (
      <span className={`${base} text-green-600 dark:text-green-400`}>
        <MdCheckCircle size={12} />
        {label} OK
      </span>
    );
  }
  return (
    <span className={`${base} text-red-600 dark:text-red-400`}>
      <MdErrorOutline size={12} />
      {label} failed
    </span>
  );
}

function didConfigTestPass(result: LLMConfigTestResultPayload): boolean {
  if (!result.gateway.ok) {
    return false;
  }
  return result.providers.every((provider) => provider.ok);
}
