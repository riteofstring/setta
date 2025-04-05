import { PasswordInput } from "components/Params/ParamUIs/PasswordInput";
import { useEffect, useState } from "react";
import { dbSetApiKeys } from "requests/ai";
import { localStorageFns } from "state/hooks/localStorage";
import { MODEL_GROUPS } from "utils/constants";

const IsolatedInput = ({ modelId, providerName, initialValue, onChange }) => {
  const [value, setValue] = useState(initialValue || "");

  // Update value if initialValue changes (e.g. when component remounts)
  useEffect(() => {
    setValue(initialValue || "");
  }, [initialValue]);

  const handleChange = (newValue) => {
    setValue(newValue);
    onChange(modelId, providerName, newValue);
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
  const [apiKeys, setApiKeys] = localStorageFns.apiKeys.hook();
  const [saveStatus, setSaveStatus] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const getApiKey = (modelId) => {
    const entry = apiKeys.find((key) => key.modelId === modelId);
    return entry ? entry.apiKey : "";
  };

  const handleApiKeyChange = async (modelId, providerName, value) => {
    let updatedKeys;

    if (!value || value.trim() === "") {
      updatedKeys = apiKeys.filter((key) => key.modelId !== modelId);
      setApiKeys(updatedKeys);
    } else {
      const existingIndex = apiKeys.findIndex((key) => key.modelId === modelId);

      if (existingIndex >= 0) {
        updatedKeys = [...apiKeys];
        updatedKeys[existingIndex] = {
          ...updatedKeys[existingIndex],
          apiKey: value,
        };
        setApiKeys(updatedKeys);
      } else {
        updatedKeys = [...apiKeys, { modelId, providerName, apiKey: value }];
        setApiKeys(updatedKeys);
      }
    }

    // Save API keys to .env file through backend
    try {
      // Prevent multiple concurrent save operations
      if (isSaving) return;

      setIsSaving(true);
      setSaveStatus("Saving...");

      await dbSetApiKeys(updatedKeys);
      setSaveStatus("Saved!");

      // Clear saved status after 3 seconds
      setTimeout(() => {
        setSaveStatus("");
      }, 3000);
    } catch (error) {
      console.error("Failed to update API keys on the server:", error);
      setSaveStatus("Error saving");

      // Clear error status after 3 seconds
      setTimeout(() => {
        setSaveStatus("");
      }, 3000);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto pb-[30dvh] text-setta-600 dark:text-setta-400">
      {saveStatus && (
        <div
          className={`text-center text-sm font-medium ${saveStatus === "Error saving" ? "text-red-500" : "text-green-500"}`}
        >
          {saveStatus}
        </div>
      )}

      {MODEL_GROUPS.map((group) => (
        <div
          key={group.group}
          className="mr-0.5 flex flex-col gap-2 rounded-lg p-3 text-xs transition-colors hover:bg-white/50 hover:dark:bg-setta-800/50"
        >
          <p className="text-base font-bold">{group.group}</p>

          <div className="flex flex-col gap-0.5">
            <label htmlFor={`api-key-${group.group}`}>API Key</label>
            <div className="single-cell-container grid min-h-[19px] grid-cols-[1fr,auto]">
              <IsolatedInput
                modelId={group.group.toLowerCase().replace(/\s+/g, "-")}
                providerName={group.group}
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
