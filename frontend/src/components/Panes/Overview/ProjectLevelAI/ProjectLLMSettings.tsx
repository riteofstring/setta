import { useCallback, useMemo, useState } from "react";
import { PasswordInput } from "components/Params/ParamUIs/PasswordInput";
import { mutateLLMConfig, setLLMApiKeyValue } from "state/actions/ai";
import { useAIStore } from "state/definitions";
import { useEditableOnSubmit } from "state/hooks/editableText";
import { KNOWN_LLM_MODEL_GROUPS } from "utils/constants";
import { LLMConfig } from "utils/generatedTypes";
import { createNewId } from "utils/idNameCreation";
import { useHydrateLLMState } from "./useHydrateLLMState";

export function ProjectLLMSettings() {
  useHydrateLLMState();
  const {
    apiKeysInitialLoadComplete,
    configsInitialLoadComplete,
    allLLMConfigs,
  } = useAIStore((x) => ({
    apiKeysInitialLoadComplete: x.apiKeysInitialLoadComplete,
    configsInitialLoadComplete: x.allLLMConfigsInitialLoadComplete,
    allLLMConfigs: x.allLLMConfigs,
  }));

  const configEntries = useMemo(() => {
    if (!allLLMConfigs) {
      return [];
    }
    return Object.entries(allLLMConfigs.configs).sort(([, a], [, b]) => {
      const providerCompare = (a.provider ?? "").localeCompare(
        b.provider ?? "",
        "en",
        { sensitivity: "base" },
      );
      if (providerCompare !== 0) {
        return providerCompare;
      }
      return a.model.localeCompare(b.model, "en", { sensitivity: "base" });
    });
  }, [allLLMConfigs]);

  if (!apiKeysInitialLoadComplete || !configsInitialLoadComplete) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-setta-600 dark:text-setta-400">
        Loading LLM settings…
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto pb-[30dvh] text-setta-600 dark:text-setta-300">
      <div className="flex flex-col gap-3">
        {configEntries.length === 0 ? (
          <p className="text-xs text-setta-500 dark:text-setta-400">
            No LLM configs found. Add one below to get started.
          </p>
        ) : (
          configEntries.map(([configId, config]) => (
            <LLMConfigCard key={configId} configId={configId} config={config} />
          ))
        )}
      </div>
      <AddLLMConfigSection />
    </div>
  );
}

function LLMConfigCard({
  configId,
  config,
}: {
  configId: string;
  config: LLMConfig;
}) {
  const commitUpdate = useCallback(
    (updates: Partial<LLMConfig>) => {
      void mutateLLMConfig((curr) => {
        const existing = curr.configs[configId];
        if (!existing) {
          return curr;
        }
        return {
          configs: {
            ...curr.configs,
            [configId]: {
              ...existing,
              ...updates,
            },
          },
          default_config_id: curr.default_config_id,
        };
      });
    },
    [configId],
  );

  return (
    <div className="rounded-lg border border-setta-200/70 p-3 text-xs shadow-sm dark:border-setta-800/80 dark:bg-setta-900/40">
      <div className="mb-2 flex items-center justify-between text-sm font-semibold text-setta-700 dark:text-setta-200">
        <span>
          {config.model}
          {config.provider ? ` · ${config.provider}` : ""}
        </span>
        {config.temporary ? (
          <span className="rounded-full border border-yellow-300/60 px-2 py-0.5 text-[10px] uppercase tracking-wide text-yellow-700 dark:border-yellow-500/40 dark:text-yellow-300">
            Temporary
          </span>
        ) : null}
      </div>
      <div className="grid gap-3 @[38rem]:grid-cols-2">
        <EditableField
          label="Model"
          value={config.model}
          onCommit={(value) => {
            const trimmed = value.trim();
            if (trimmed) {
              commitUpdate({ model: trimmed });
            }
          }}
        />
        <EditableField
          label="Provider"
          value={config.provider ?? ""}
          allowEmpty
          onCommit={(value) => {
            const trimmed = value.trim();
            commitUpdate({ provider: trimmed || null });
          }}
        />
        <EditableField
          label="Base URL"
          value={config.base_url ?? ""}
          allowEmpty
          placeholder="https://example.com"
          onCommit={(value) => {
            const trimmed = value.trim();
            commitUpdate({ base_url: trimmed || null });
          }}
        />
        <EditableField
          label="API Key Env Var"
          value={config.api_key_env ?? ""}
          allowEmpty
          placeholder="SETTA_LLM_API_KEY"
          onCommit={(value) => {
            const trimmed = value.trim();
            commitUpdate({ api_key_env: trimmed || null });
          }}
        />
        <div className="flex flex-col gap-1 @[38rem]:col-span-2">
          <label className="text-[10px] font-semibold uppercase tracking-wide text-setta-400 dark:text-setta-500">
            API Key
          </label>
          <ApiKeyInput envVarName={config.api_key_env} />
        </div>
      </div>
    </div>
  );
}

function EditableField({
  label,
  value,
  onCommit,
  allowEmpty = false,
  placeholder,
}: {
  label: string;
  value: string;
  onCommit: (value: string) => void;
  allowEmpty?: boolean;
  placeholder?: string;
}) {
  const { inputValue, onChange, onBlur, onKeyDown } = useEditableOnSubmit(
    value ?? "",
    onCommit,
    async () => true,
    allowEmpty,
  );

  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-semibold uppercase tracking-wide text-setta-400 dark:text-setta-500">
        {label}
      </label>
      <input
        className="nodrag rounded-md border border-setta-300/70 bg-white px-2 py-1 text-xs text-setta-700 focus:border-blue-400 focus:outline-none dark:border-setta-700 dark:bg-setta-900 dark:text-setta-200"
        value={inputValue}
        onChange={onChange}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
      />
    </div>
  );
}

function ApiKeyInput({ envVarName }: { envVarName: string | null }) {
  const apiKeyValue = useAIStore((x) =>
    envVarName ? x.apiKeys[envVarName] ?? "" : "",
  );
  const disabled = !envVarName;
  const { inputValue, onChange, onBlur, onKeyDown } = useEditableOnSubmit(
    disabled ? "" : apiKeyValue,
    (value) => {
      if (!envVarName) {
        return;
      }
      void setLLMApiKeyValue(envVarName, value);
    },
    async () => true,
    true,
  );
  return (
    <PasswordInput
      className="nodrag flex w-full min-w-0 rounded-md border border-setta-300/70 bg-white px-2 py-1 font-mono text-xs text-setta-700 focus:border-blue-400 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-200"
      value={inputValue}
      onChange={onChange}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      isDisabled={disabled}
      placeholder={
        disabled ? "Set an env var name first" : "Enter or paste API key"
      }
      gridArea="single-cell-child"
    />
  );
}

function AddLLMConfigSection() {
  const [showForm, setShowForm] = useState(false);
  const [selectedModelKey, setSelectedModelKey] = useState("");
  const [envVarName, setEnvVarName] = useState("");
  const [apiKeyValue, setApiKeyValue] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const selectedModel = useMemo(() => {
    for (const group of KNOWN_LLM_MODEL_GROUPS) {
      for (const model of group.models) {
        const key = encodeModelKey(group.provider, model.id);
        if (key === selectedModelKey) {
          return {
            provider: group.provider,
            modelId: model.id,
            baseUrl: model.baseUrl ?? null,
            label: model.name,
          };
        }
      }
    }
    return null;
  }, [selectedModelKey]);

  const resetForm = useCallback(() => {
    setSelectedModelKey("");
    setEnvVarName("");
    setApiKeyValue("");
    setIsSaving(false);
  }, []);

  const onCreate = useCallback(async () => {
    if (!selectedModel) {
      return;
    }
    setIsSaving(true);
    const envName = envVarName.trim() || null;
    const newConfigId = createNewId();
    await mutateLLMConfig((curr) => ({
      configs: {
        ...curr.configs,
        [newConfigId]: {
          id: newConfigId,
          model: selectedModel.modelId,
          provider: selectedModel.provider,
          base_url: selectedModel.baseUrl,
          api_key_env: envName,
          other_params: null,
          temporary: false,
        },
      },
      default_config_id: curr.default_config_id,
    }));
    if (apiKeyValue.trim() && envName) {
      await setLLMApiKeyValue(envName, apiKeyValue.trim());
    }
    resetForm();
    setShowForm(false);
  }, [apiKeyValue, envVarName, resetForm, selectedModel]);

  return (
    <div className="rounded-lg border border-dashed border-setta-300/70 p-3 dark:border-setta-700">
      <button
        className="nodrag mb-3 inline-flex items-center gap-2 rounded-md border border-setta-300/70 px-3 py-1 text-xs font-semibold text-setta-700 transition-colors hover:bg-setta-100 dark:border-setta-700 dark:text-setta-200 dark:hover:bg-setta-800"
        onClick={() => {
          if (showForm) {
            resetForm();
          }
          setShowForm((prev) => !prev);
        }}
      >
        {showForm ? "Cancel" : "Add entry"}
      </button>
      {showForm ? (
        <div className="flex flex-col gap-3 text-xs text-setta-600 dark:text-setta-300">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold uppercase tracking-wide text-setta-400 dark:text-setta-500">
              Model
            </label>
            <select
              className="nodrag rounded-md border border-setta-300/70 bg-white px-2 py-1 text-xs text-setta-700 focus:border-blue-400 focus:outline-none dark:border-setta-700 dark:bg-setta-900 dark:text-setta-200"
              value={selectedModelKey}
              onChange={(event) => {
                const nextKey = event.target.value;
                setSelectedModelKey(nextKey);
                if (nextKey) {
                  const chosen = KNOWN_LLM_MODEL_GROUPS.flatMap((group) =>
                    group.models.map((model) => ({
                      key: encodeModelKey(group.provider, model.id),
                      provider: group.provider,
                      id: model.id,
                    })),
                  ).find((entry) => entry.key === nextKey);
                  if (chosen) {
                    setEnvVarName(
                      createDefaultEnvVarName(chosen.provider, chosen.id),
                    );
                    setApiKeyValue("");
                  }
                } else {
                  setEnvVarName("");
                  setApiKeyValue("");
                }
              }}
            >
              <option value="">Select a model</option>
              {KNOWN_LLM_MODEL_GROUPS.map((group) => (
                <optgroup key={group.provider} label={group.provider}>
                  {group.models.map((model) => (
                    <option
                      key={encodeModelKey(group.provider, model.id)}
                      value={encodeModelKey(group.provider, model.id)}
                    >
                      {model.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          {selectedModel ? (
            <>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold uppercase tracking-wide text-setta-400 dark:text-setta-500">
                  API Key Env Var
                </label>
                <input
                  className="nodrag rounded-md border border-setta-300/70 bg-white px-2 py-1 text-xs text-setta-700 focus:border-blue-400 focus:outline-none dark:border-setta-700 dark:bg-setta-900 dark:text-setta-200"
                  value={envVarName}
                  onChange={(event) => setEnvVarName(event.target.value)}
                  placeholder="SETTA_LLM_API_KEY"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold uppercase tracking-wide text-setta-400 dark:text-setta-500">
                  API Key (optional)
                </label>
                <PasswordInput
                  className="nodrag flex w-full min-w-0 rounded-md border border-setta-300/70 bg-white px-2 py-1 font-mono text-xs text-setta-700 focus:border-blue-400 focus:outline-none dark:border-setta-700 dark:bg-setta-900 dark:text-setta-200"
                  value={apiKeyValue}
                  onChange={(value: string) => setApiKeyValue(value)}
                  isDisabled={false}
                  gridArea="single-cell-child"
                  placeholder="Paste API key (we'll store it securely)"
                />
                <p className="text-[11px] text-setta-500 dark:text-setta-400">
                  Leave blank to reference an existing env var. If provided, the
                  key is stored in .env under the env var above.
                </p>
              </div>
              <button
                className="nodrag inline-flex items-center justify-center rounded-md bg-blue-600 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isSaving || !selectedModel}
                onClick={() => {
                  void onCreate();
                }}
              >
                {isSaving ? "Saving…" : "Save entry"}
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function encodeModelKey(provider: string, id: string) {
  return `${provider}::${id}`;
}

function createDefaultEnvVarName(provider: string, modelId: string) {
  const normalized = `${provider}_${modelId}`
    .replace(/[^a-zA-Z0-9]/g, "_")
    .toUpperCase();
  return `SETTA_${normalized}_API_KEY`;
}
