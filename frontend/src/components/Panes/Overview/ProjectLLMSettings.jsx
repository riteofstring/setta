import { PasswordInput } from "components/Params/ParamUIs/PasswordInput";
import { useEffect, useState } from "react";
import { useAI } from "state/hooks/aiChat";
import { MODEL_GROUPS } from "utils/constants";

const IsolatedInput = ({ modelId, providerName, initialValue, onChange }) => {
  const [value, setValue] = useState(initialValue || "");

  // Update value if initialValue changes
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
  const [apiKeys, setApiKeys] = useState();
  const { saveStatus, handleApiKeyChange } = useAI();

  const getApiKey = (modelId) => {
    const entry = apiKeys.find((key) => key.modelId === modelId);
    return entry ? entry.apiKey : "";
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto pb-[30dvh] text-setta-600 dark:text-setta-400">
      {saveStatus && (
        // TODO: this should be in the notifications area.
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
