import * as Accordion from "@radix-ui/react-accordion";
import { PasswordInput } from "components/Params/ParamUIs/PasswordInput";
import { useState } from "react";
import { HiChevronDown } from "react-icons/hi2";
import { MdAdd } from "react-icons/md";
import { mutateAndSaveLLMApiKeys } from "state/actions/ai";
import { useAIStore } from "state/definitions";
import { useEditableOnSubmit } from "state/hooks/editableText";
import {
  AllConfigs,
  LLMAPIKeysSnapshot,
  LLMConfig,
} from "utils/generatedTypes";
import { useHydrateLLMState } from "./useHydrateLLMState";

type APIKeys = LLMAPIKeysSnapshot["apiKeys"];

const API_KEY_INPUT_CLASS_NAME =
  "box-border h-8 w-full rounded-md border border-solid border-setta-200 bg-white/80 px-2 text-xs text-setta-800 focus:!border-blue-500 focus:outline-0 focus:ring-0 disabled:cursor-not-allowed disabled:bg-setta-100 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-300";
const API_KEY_BUTTON_CLASS_NAME =
  "h-8 rounded-md border border-setta-200 bg-white px-3 text-xs font-semibold text-setta-600 transition-colors hover:bg-setta-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-200";

export function normalizeApiKeyMutationValue(value: string): string {
  return value.trim();
}

type IsolatedInputProps = {
  apiKeyName: string;
  inputId: string;
};

const IsolatedInput = ({ apiKeyName, inputId }: IsolatedInputProps) => {
  const initialValue = useAIStore((x) => x.apiKeys[apiKeyName] ?? "");

  const onSetValue = (v: string) => {
    const normalizedValue = normalizeApiKeyMutationValue(v);
    void mutateAndSaveLLMApiKeys((currentApiKeys) => {
      const nextApiKeys = { ...currentApiKeys };
      if (normalizedValue.length === 0) {
        delete nextApiKeys[apiKeyName];
        return nextApiKeys;
      }
      nextApiKeys[apiKeyName] = normalizedValue;
      return nextApiKeys;
    });
  };

  const { inputValue, onChange, onBlur, onKeyDown } = useEditableOnSubmit(
    initialValue,
    onSetValue,
    () => true,
    true,
  );

  return (
    <PasswordInput
      id={inputId}
      className={API_KEY_INPUT_CLASS_NAME}
      value={inputValue}
      onChange={onChange}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      isDisabled={false}
      gridArea=""
    />
  );
};

type ProjectLLMSettingsProps = {
  className?: string;
};

export function ProjectLLMSettings({ className }: ProjectLLMSettingsProps) {
  useHydrateLLMState();
  const { allLLMConfigs, apiKeys, apiKeysLoadError } = useAIStore((state) => ({
    allLLMConfigs: state.allLLMConfigs,
    apiKeys: state.apiKeys,
    apiKeysLoadError: state.apiKeysLoadError,
  }));
  const [newApiKeyName, setNewApiKeyName] = useState("OPENAI_API_KEY");
  const [newApiKeyValue, setNewApiKeyValue] = useState("");
  const [newApiKeyError, setNewApiKeyError] = useState<string | null>(null);
  const apiKeyEntries = buildApiKeyEntries(allLLMConfigs, apiKeys);
  const wrapperClassName = className
    ? `setta-pane-scroll flex min-h-0 flex-col gap-3 text-setta-600 dark:text-setta-400 ${className}`
    : "setta-pane-scroll flex min-h-0 flex-col gap-3 text-setta-600 dark:text-setta-400";

  const handleAddApiKey = () => {
    const envKey = newApiKeyName.trim();
    const normalizedValue = normalizeApiKeyMutationValue(newApiKeyValue);
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
    if (!normalizedValue) {
      setNewApiKeyError("Value is required.");
      return;
    }
    void mutateAndSaveLLMApiKeys((currentApiKeys: APIKeys) => ({
      ...currentApiKeys,
      [envKey]: normalizedValue,
    }));
    setNewApiKeyName("OPENAI_API_KEY");
    setNewApiKeyValue("");
    setNewApiKeyError(null);
  };

  const handleClearApiKey = (envKey: string) => {
    void mutateAndSaveLLMApiKeys((currentApiKeys: APIKeys) => {
      const nextApiKeys = { ...currentApiKeys };
      delete nextApiKeys[envKey];
      return nextApiKeys;
    });
  };

  return (
    <div className={wrapperClassName}>
      <div className="flex flex-col gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-setta-500 dark:text-setta-400">
          Add API Key
        </p>
        {apiKeysLoadError ? (
          <p className="text-[11px] text-red-600 dark:text-red-400">
            {apiKeysLoadError}
          </p>
        ) : null}
        <div className="grid gap-2 @container @[30rem]:grid-cols-[1fr,1fr,auto]">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="project-llm-settings-new-api-key-name"
              className="text-[11px] font-semibold uppercase tracking-wide text-setta-500 dark:text-setta-400"
            >
              Key
            </label>
            <input
              id="project-llm-settings-new-api-key-name"
              data-testid="project-llm-settings-new-api-key-name"
              className={`${API_KEY_INPUT_CLASS_NAME} font-mono`}
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
          <div className="flex flex-col gap-1">
            <label
              htmlFor="project-llm-settings-new-api-key-value"
              className="text-[11px] font-semibold uppercase tracking-wide text-setta-500 dark:text-setta-400"
            >
              Value
            </label>
            <PasswordInput
              id="project-llm-settings-new-api-key-value"
              className={`${API_KEY_INPUT_CLASS_NAME} font-mono`}
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
              gridArea=""
            />
          </div>
          <button
            type="button"
            data-testid="project-llm-settings-add-api-key"
            className={`${API_KEY_BUTTON_CLASS_NAME} inline-flex items-center justify-center gap-1.5 self-end`}
            onClick={handleAddApiKey}
          >
            <MdAdd size={14} aria-hidden="true" />
            <span className="text-center">Add</span>
          </button>
        </div>
        {newApiKeyError ? (
          <p className="text-[11px] text-red-600 dark:text-red-400">
            {newApiKeyError}
          </p>
        ) : null}
      </div>

      <hr className="border-setta-200/70 dark:border-setta-800/70" />

      {apiKeyEntries.length === 0 ? (
        <div className="rounded-md border border-dashed border-setta-200/70 px-3 py-4 text-xs text-setta-500 dark:border-setta-800 dark:text-setta-400">
          No API keys configured yet.
        </div>
      ) : (
        <Accordion.Root type="multiple" className="rounded-md">
          {apiKeyEntries.map((entry) => (
            <Accordion.Item
              key={entry.envKey}
              value={entry.envKey}
              className="border-b border-setta-200/70 last:border-b-0 dark:border-setta-800/70"
            >
              <Accordion.Header>
                <Accordion.Trigger className="group flex w-full cursor-pointer items-center justify-between gap-2 py-2 pl-1.5 pr-2.5 text-left transition-colors hover:bg-setta-100/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 dark:hover:bg-setta-850/60 [&[data-state=open]_.project-llm-settings-api-key-chevron]:rotate-180">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-setta-700 dark:text-setta-200">
                      {entry.envKey}
                    </span>
                    <span className="mt-0.5 block text-[10px] uppercase tracking-wide text-setta-500 dark:text-setta-400">
                      {apiKeys[entry.envKey] ? "Set" : "Unset"}
                    </span>
                  </span>
                  <span className="flex h-5 w-5 flex-none items-center justify-center">
                    <HiChevronDown
                      size={16}
                      className="project-llm-settings-api-key-chevron text-setta-400 transition-transform duration-150 dark:text-setta-500"
                    />
                  </span>
                </Accordion.Trigger>
              </Accordion.Header>
              <Accordion.Content className="data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down overflow-hidden">
                <div className="grid gap-2 px-1.5 pb-2">
                  {entry.configLabels.length > 0 ? (
                    <p className="text-[11px] text-setta-500 dark:text-setta-400">
                      Used by: {entry.configLabels.join(", ")}
                    </p>
                  ) : null}
                  <div className="grid gap-2 @container @[32rem]:grid-cols-[1fr,auto]">
                    <div className="flex flex-col gap-1">
                      <label
                        htmlFor={`api-key-${entry.envKey}`}
                        className="text-[11px] font-semibold uppercase tracking-wide text-setta-500 dark:text-setta-400"
                      >
                        API Key
                      </label>
                      <IsolatedInput
                        apiKeyName={entry.envKey}
                        inputId={`api-key-${entry.envKey}`}
                      />
                    </div>
                    <button
                      type="button"
                      className={`${API_KEY_BUTTON_CLASS_NAME} self-end`}
                      disabled={!apiKeys[entry.envKey]}
                      onClick={() => handleClearApiKey(entry.envKey)}
                    >
                      Clear
                    </button>
                  </div>
                </div>
              </Accordion.Content>
            </Accordion.Item>
          ))}
        </Accordion.Root>
      )}
    </div>
  );
}

type ApiKeyEntry = {
  envKey: string;
  configLabels: string[];
};

export function buildApiKeyEntries(
  allLLMConfigs: AllConfigs | null,
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
