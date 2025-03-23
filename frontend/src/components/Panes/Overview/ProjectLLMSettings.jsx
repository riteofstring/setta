import { PasswordInput } from "components/Params/ParamUIs/PasswordInput";
import { useState } from "react";
import { localStorageFns } from "state/hooks/localStorage";
import { MODEL_GROUPS } from "utils/constants";

// Isolated functional component for each password field
const IsolatedInput = ({ modelId, modelName, initialValue, onChange }) => {
  // Each instance has its own state
  const [value, setValue] = useState(initialValue || "");

  // Handle change locally first, then propagate up
  const handleChange = (newValue) => {
    setValue(newValue);
    onChange(modelId, modelName, newValue);
  };

  return (
    <PasswordInput
      className="nodrag single-cell-child peer/textinput flex w-full min-w-0 max-w-[calc(100%_-_1.1rem)] self-center justify-self-start font-mono text-xs text-[rgb(3,_47,_98);] dark:text-[rgb(165,_214,_255)]"
      value={value}
      onChange={handleChange}
      onEscape={() => {}}
      isDisabled={false}
      gridArea="single-cell-child"
    />
  );
};

export function ProjectLLMSettings() {
  // Use your existing local storage hook
  const [apiKeys, setApiKeys] = localStorageFns.apiKeys.hook();

  // Get a specific API key
  const getApiKey = (modelId) => {
    const entry = apiKeys.find((key) => key.modelId === modelId);
    return entry ? entry.apiKey : "";
  };

  // Handle input change
  const handleApiKeyChange = (modelId, modelName, value) => {
    // If the value is empty, remove the entry completely
    if (!value || value.trim() === "") {
      const filteredKeys = apiKeys.filter((key) => key.modelId !== modelId);
      setApiKeys(filteredKeys);
      return;
    }

    const existingIndex = apiKeys.findIndex((key) => key.modelId === modelId);

    if (existingIndex >= 0) {
      // Update existing key
      const updatedKeys = [...apiKeys];
      updatedKeys[existingIndex] = {
        ...updatedKeys[existingIndex],
        apiKey: value,
      };
      setApiKeys(updatedKeys);
    } else {
      // Add new key
      setApiKeys([...apiKeys, { modelId, modelName, apiKey: value }]);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto pb-[30dvh] text-setta-600 dark:text-setta-400">
      {MODEL_GROUPS.map((group) => (
        <div
          key={group.group}
          className="mr-0.5 flex flex-col gap-2 rounded-lg p-3 text-xs transition-colors hover:bg-white/50 hover:dark:bg-setta-800/50"
        >
          <div className="flex items-center gap-2">
            <p className="-ml-2.5 mr-auto w-full min-w-0">{group.group}</p>
          </div>

          <div className="flex flex-col gap-0.5">
            <label htmlFor={`api-key-${group.group}`}>API Key</label>
            <div className="single-cell-container grid min-h-[19px] grid-cols-[1fr,auto]">
              <IsolatedInput
                modelId={group.group.toLowerCase().replace(/\s+/g, "-")}
                modelName={group.group}
                initialValue={getApiKey(
                  group.group.toLowerCase().replace(/\s+/g, "-"),
                )}
                onChange={handleApiKeyChange}
              />
              <span className="single-cell-child border-box col-span-2 self-end border-b border-setta-200/50 peer-focus-within/textinput:border-blue-400 dark:border-setta-600/30" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
