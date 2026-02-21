import { PasswordInput } from "components/Params/ParamUIs/PasswordInput";
import { useState } from "react";
import { useAIStore } from "state/definitions";
import { useEditableOnSubmit } from "state/hooks/editableText";
import { route_set_llm_api_keys } from "utils/generatedEndpoints";
import { APIKeys, AllLLMConfigs, LLMConfig } from "utils/generatedTypes";
import { useHydrateLLMState } from "./useHydrateLLMState";

type IsolatedInputProps = {
  apiKeyName: string;
};

const IsolatedInput = ({ apiKeyName }: IsolatedInputProps) => {
  const initialValue = useAIStore((x) => x.apiKeys[apiKeyName] ?? "");

  const onSetValue = (v: string) => {
    const currentApiKeys = useAIStore.getState().apiKeys;
    if (v.length === 0) {
      const nextApiKeys = { ...currentApiKeys };
      delete nextApiKeys[apiKeyName];
      useAIStore.setState({ apiKeys: nextApiKeys });
      void route_set_llm_api_keys({ apiKeys: { [apiKeyName]: "" } });
      return;
    }
    const nextApiKeys = { ...currentApiKeys };
    nextApiKeys[apiKeyName] = v;
    useAIStore.setState({ apiKeys: nextApiKeys });
    void route_set_llm_api_keys({ apiKeys: { [apiKeyName]: v } });
  };

  const { inputValue, onChange, onBlur, onKeyDown } = useEditableOnSubmit(
    initialValue,
    onSetValue,
    () => true,
    true,
  );

  return (
    <PasswordInput
      className="nodrag single-cell-child peer/textinput flex w-full min-w-0 max-w-[calc(100%_-_1.1rem)] self-center justify-self-start font-mono text-xs text-[rgb(3,_47,_98);] dark:text-[rgb(165,_214,_255)]"
      value={inputValue}
      onChange={onChange}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      isDisabled={false}
      gridArea="single-cell-child"
    />
  );
};

type ProjectLLMSettingsProps = {
  className?: string;
};

export function ProjectLLMSettings({ className }: ProjectLLMSettingsProps) {
  useHydrateLLMState();
  const { allLLMConfigs, apiKeys } = useAIStore((state) => ({
    allLLMConfigs: state.allLLMConfigs,
    apiKeys: state.apiKeys,
  }));
  const [newApiKeyName, setNewApiKeyName] = useState("");
  const [newApiKeyValue, setNewApiKeyValue] = useState("");
  const [newApiKeyError, setNewApiKeyError] = useState<string | null>(null);
  const apiKeyEntries = buildApiKeyEntries(allLLMConfigs, apiKeys);
  const wrapperClassName = className
    ? `setta-pane-scroll flex min-h-0 flex-col gap-4 text-setta-600 dark:text-setta-400 ${className}`
    : "setta-pane-scroll flex min-h-0 flex-col gap-4 text-setta-600 dark:text-setta-400";

  const persistApiKeys = (nextApiKeys: APIKeys, patch: APIKeys) => {
    useAIStore.setState({ apiKeys: nextApiKeys });
    void route_set_llm_api_keys({ apiKeys: patch });
  };

  const handleAddApiKey = () => {
    const envKey = newApiKeyName.trim();
    if (!envKey) {
      setNewApiKeyError("Key is required.");
      return;
    }
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(envKey)) {
      setNewApiKeyError(
        "Key must be a valid env var name (letters, numbers, underscores; cannot start with a number).",
      );
      return;
    }
    if (!newApiKeyValue) {
      setNewApiKeyError("Value is required.");
      return;
    }
    const nextApiKeys = { ...apiKeys, [envKey]: newApiKeyValue };
    persistApiKeys(nextApiKeys, { [envKey]: newApiKeyValue });
    setNewApiKeyName("");
    setNewApiKeyValue("");
    setNewApiKeyError(null);
  };

  const handleClearApiKey = (envKey: string) => {
    const nextApiKeys = { ...apiKeys };
    delete nextApiKeys[envKey];
    persistApiKeys(nextApiKeys, { [envKey]: "" });
  };

  return (
    <div className={wrapperClassName}>
      <div className="mr-0.5 flex flex-col gap-2 rounded-lg border border-setta-200/70 bg-white/50 p-3 text-xs dark:border-setta-800/70 dark:bg-setta-900/30">
        <p className="text-base font-bold">Add API Key</p>
        <p className="text-[11px] text-setta-500 dark:text-setta-400">
          Add any key/value pair. These are stored in your Setta env config.
        </p>
        <div className="grid gap-2 @container @[30rem]:grid-cols-[1fr,1fr,auto]">
          <div className="flex flex-col gap-0.5">
            <label
              htmlFor="project-llm-settings-new-api-key-name"
              className="text-[11px]"
            >
              Key
            </label>
            <input
              id="project-llm-settings-new-api-key-name"
              data-testid="project-llm-settings-new-api-key-name"
              className="h-8 rounded-md border border-setta-200 bg-white px-2 font-mono text-xs text-setta-700 focus:border-blue-500 focus:outline-none dark:border-setta-700 dark:bg-setta-900 dark:text-setta-200"
              placeholder="OPENAI_API_KEY"
              value={newApiKeyName}
              onChange={(event) => {
                setNewApiKeyName(event.target.value);
                if (newApiKeyError) {
                  setNewApiKeyError(null);
                }
              }}
            />
          </div>
          <div className="flex flex-col gap-0.5">
            <label
              htmlFor="project-llm-settings-new-api-key-value"
              className="text-[11px]"
            >
              Value
            </label>
            <PasswordInput
              id="project-llm-settings-new-api-key-value"
              className="h-8 rounded-md border border-setta-200 bg-white px-2 font-mono text-xs text-setta-700 focus:border-blue-500 focus:outline-none dark:border-setta-700 dark:bg-setta-900 dark:text-setta-200"
              value={newApiKeyValue}
              onChange={(nextValue: string) => {
                setNewApiKeyValue(nextValue);
                if (newApiKeyError) {
                  setNewApiKeyError(null);
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleAddApiKey();
                }
              }}
              isDisabled={false}
            />
          </div>
          <button
            type="button"
            data-testid="project-llm-settings-add-api-key"
            className="h-8 self-end rounded-md bg-blue-600 px-3 text-xs font-semibold text-white transition-colors hover:bg-blue-500"
            onClick={handleAddApiKey}
          >
            Add
          </button>
        </div>
        {newApiKeyError ? (
          <p className="text-[11px] text-red-600 dark:text-red-400">
            {newApiKeyError}
          </p>
        ) : null}
      </div>
      {apiKeyEntries.length === 0 ? (
        <div className="rounded-md border border-dashed border-setta-200/70 px-3 py-4 text-xs text-setta-500 dark:border-setta-800 dark:text-setta-400">
          No API keys configured yet.
        </div>
      ) : (
        apiKeyEntries.map((entry) => (
          <div
            key={entry.envKey}
            className="mr-0.5 flex flex-col gap-2 rounded-lg p-3 text-xs transition-colors hover:bg-white/50 hover:dark:bg-setta-800/50"
          >
            <p className="text-base font-bold">{entry.envKey}</p>
            {entry.configLabels.length > 0 ? (
              <p className="text-[11px] text-setta-500 dark:text-setta-400">
                Used by: {entry.configLabels.join(", ")}
              </p>
            ) : null}
            <div className="flex flex-col gap-0.5">
              <label htmlFor={`api-key-${entry.envKey}`}>
                API Key
                {apiKeys[entry.envKey] ? " (set)" : ""}
              </label>
              <div className="single-cell-container grid min-h-[19px] grid-cols-[1fr,auto,auto] gap-2">
                <IsolatedInput apiKeyName={entry.envKey} />
                <button
                  type="button"
                  className="h-7 rounded-md border border-setta-200 px-2 text-[11px] font-semibold text-setta-500 transition-colors hover:bg-setta-100 hover:text-setta-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
                  disabled={!apiKeys[entry.envKey]}
                  onClick={() => handleClearApiKey(entry.envKey)}
                >
                  Clear
                </button>
                <span className="single-cell-child border-box col-span-2 self-end border-b border-setta-200/50 peer-focus-within/textinput:border-blue-400 dark:border-setta-600/30" />
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

type ApiKeyEntry = {
  envKey: string;
  configLabels: string[];
};

export function buildApiKeyEntries(
  allLLMConfigs: AllLLMConfigs | null,
  apiKeys: APIKeys,
): ApiKeyEntry[] {
  const entriesByKey = new Map<string, ApiKeyEntry>();
  if (allLLMConfigs && allLLMConfigs.configs) {
    for (const [configId, config] of Object.entries(allLLMConfigs.configs)) {
      const typedConfig = config as LLMConfig;
      const apiKeyEnv = typedConfig.api_key_env;
      if (!apiKeyEnv || typeof apiKeyEnv !== "string") {
        continue;
      }
      const label =
        typeof typedConfig.provider === "string"
          ? `${configId} (${typedConfig.provider})`
          : configId;
      const existing = entriesByKey.get(apiKeyEnv);
      if (existing) {
        existing.configLabels.push(label);
      } else {
        entriesByKey.set(apiKeyEnv, {
          envKey: apiKeyEnv,
          configLabels: [label],
        });
      }
    }
  }

  for (const envKey of Object.keys(apiKeys)) {
    if (entriesByKey.has(envKey)) {
      continue;
    }
    entriesByKey.set(envKey, {
      envKey,
      configLabels: [],
    });
  }
  return Array.from(entriesByKey.values()).sort((a, b) =>
    a.envKey.localeCompare(b.envKey),
  );
}
