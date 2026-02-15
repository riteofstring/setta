import { PasswordInput } from "components/Params/ParamUIs/PasswordInput";
import { useAIStore } from "state/definitions";
import { useEditableOnSubmit } from "state/hooks/editableText";
import { route_set_llm_api_keys } from "utils/generatedEndpoints";
import { AllLLMConfigs, LLMConfig } from "utils/generatedTypes";
import { useHydrateLLMState } from "./useHydrateLLMState";

type IsolatedInputProps = {
  apiKeyName: string;
};

const IsolatedInput = ({ apiKeyName }: IsolatedInputProps) => {
  const initialValue = useAIStore((x) => x.apiKeys[apiKeyName] ?? "");

  const onSetValue = (v: string) => {
    useAIStore.setState((state) => ({
      apiKeys: { ...state.apiKeys, [apiKeyName]: v },
    }));

    const { apiKeys } = useAIStore.getState();
    route_set_llm_api_keys({ apiKeys });
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
  const apiKeyEntries = buildApiKeyEntries(allLLMConfigs);
  const wrapperClassName = className
    ? `flex min-h-0 flex-col gap-4 overflow-y-auto text-setta-600 dark:text-setta-400 ${className}`
    : "flex min-h-0 flex-col gap-4 overflow-y-auto text-setta-600 dark:text-setta-400";
  return (
    <div className={wrapperClassName}>
      {apiKeyEntries.length === 0 ? (
        <div className="rounded-md border border-dashed border-setta-200/70 px-3 py-4 text-xs text-setta-500 dark:border-setta-800 dark:text-setta-400">
          No API keys configured. Add `api_key_env` entries in
          `setta_files/llm_config.json` to surface inputs here.
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
              <div className="single-cell-container grid min-h-[19px] grid-cols-[1fr,auto]">
                <IsolatedInput apiKeyName={entry.envKey} />
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

function buildApiKeyEntries(
  allLLMConfigs: AllLLMConfigs | null,
): ApiKeyEntry[] {
  if (!allLLMConfigs || !allLLMConfigs.configs) {
    return [];
  }
  const entriesByKey = new Map<string, ApiKeyEntry>();
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
  return Array.from(entriesByKey.values()).sort((a, b) =>
    a.envKey.localeCompare(b.envKey),
  );
}
