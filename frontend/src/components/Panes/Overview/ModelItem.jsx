import * as Collapsible from "@radix-ui/react-collapsible";
import { PasswordInput } from "components/Params/ParamUIs/PasswordInput";
import { IconButton } from "components/Utils/atoms/buttons/IconButton";
import { Toggle } from "components/Utils/atoms/toggles/Toggle";
import { IdNameCombobox } from "components/Utils/Combobox/IdNameCombobox";
import { useState } from "react";
import { IoChevronDown, IoChevronForward } from "react-icons/io5";

// Model definitions by provider
const MODEL_GROUPS = [
  {
    group: "OpenAI",
    items: [
      { id: "gpt-4o", name: "GPT-4o" },
      { id: "gpt-4-turbo", name: "GPT-4 Turbo" },
      { id: "gpt-4", name: "GPT-4" },
      { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo" },
    ],
  },
  {
    group: "Anthropic",
    items: [
      { id: "claude-3-opus-20240229", name: "Claude 3 Opus" },
      { id: "claude-3-sonnet-20240229", name: "Claude 3 Sonnet" },
      { id: "claude-3-haiku-20240307", name: "Claude 3 Haiku" },
      { id: "claude-3.5-sonnet-20240620", name: "Claude 3.5 Sonnet" },
      { id: "claude-3.7-sonnet-20240307", name: "Claude 3.7 Sonnet" },
    ],
  },
  {
    group: "Custom",
    items: [{ id: "custom", name: "Custom Model..." }],
  },
];

// Default API endpoints by provider
const DEFAULT_ENDPOINTS = {
  OpenAI: "https://api.openai.com/v1",
  Anthropic: "https://api.anthropic.com/v1",
};

function ModelItem({ item, onUpdate, onRemove }) {
  const [customModelInput, setCustomModelInput] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Handle model selection from dropdown
  const handleModelChange = (selectedModel) => {
    // If nothing is selected
    if (!selectedModel) return;

    const modelId = selectedModel.id;

    // Handle custom model selection
    if (modelId === "custom") {
      onUpdate("model", "custom");
      onUpdate("provider", "Custom");
      return;
    }

    // Find provider for the selected model
    let provider;
    for (const group of MODEL_GROUPS) {
      const foundModel = group.items.find((model) => model.id === modelId);
      if (foundModel) {
        provider = group.group;
        break;
      }
    }

    // Update model and provider
    onUpdate("model", modelId);
    onUpdate("provider", provider || "Custom");

    // Set default endpoint if available
    if (provider && DEFAULT_ENDPOINTS[provider]) {
      onUpdate("endpointUrl", DEFAULT_ENDPOINTS[provider]);
    }
  };

  // Handle custom model input
  const handleCustomModelInput = (e) => {
    setCustomModelInput(e.target.value);
  };

  // Submit custom model when user presses Enter
  const handleCustomModelKeyDown = (e) => {
    if (e.key === "Enter" && customModelInput.trim()) {
      e.preventDefault();
      onUpdate("model", customModelInput.trim());
      onUpdate("provider", "Custom");
      setCustomModelInput("");
    }
  };

  // Prevent form submission on enter key
  const handleKeyDown = (e) => {
    if (e.key === "Enter") e.preventDefault();
  };

  // Handle remove button click
  const handleRemove = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    onRemove(e);
  };

  return (
    <form
      className="mr-0.5 flex flex-col gap-2 rounded-lg p-3 text-xs transition-colors hover:bg-white/50 hover:dark:bg-setta-800/50"
      onSubmit={(e) => e.preventDefault()}
      onKeyDown={handleKeyDown}
    >
      <div className="flex items-center gap-2">
        <p className="-ml-2.5 w-full">
          {/* Direct use of IdNameCombobox for showing groups */}
          <IdNameCombobox
            allItems={MODEL_GROUPS}
            value={
              item.model
                ? { id: item.model, name: getModelDisplayName(item.model) }
                : null
            }
            onSelectedItemChange={handleModelChange}
            small={false}
            placeholder="Select an LLM model"
          />

          {/* Custom model input field */}
          {item.model === "custom" && (
            <input
              type="text"
              value={customModelInput}
              onChange={handleCustomModelInput}
              onKeyDown={handleCustomModelKeyDown}
              placeholder="Enter custom model name"
              className="mt-2 w-full border-solid border-x-transparent border-b-setta-200/50 border-t-transparent bg-transparent placeholder-setta-200 focus-visible:!border-b-blue-400 dark:border-b-setta-600/30 dark:placeholder-setta-600"
            />
          )}
        </p>
        <p>Local</p>
        <Toggle
          checked={item.isLocal}
          onClick={() => onUpdate("isLocal", !item.isLocal)}
        />
        <IconButton
          icon={<i className="gg-close !scale-75" />}
          color="text-setta-600 hover:text-white"
          bg="bg-transparent hover:bg-red-500"
          size="min-w-4 h-4"
          padding="p-1"
          twClasses=""
          onClick={handleRemove}
          type="button"
        />
      </div>

      {/* Provider label (if selected) */}
      {item.provider && item.model && item.model !== "custom" && (
        <div className="text-xs text-setta-500 dark:text-setta-400">
          Provider: {item.provider}
        </div>
      )}

      {/* Model path or API Key input */}
      {item.isLocal ? (
        <ModelPathInput item={item} onUpdate={onUpdate} />
      ) : (
        <ApiKeyInput item={item} onUpdate={onUpdate} />
      )}

      {/* Advanced settings collapsible section */}
      <AdvancedSettings
        item={item}
        onUpdate={onUpdate}
        showAdvanced={showAdvanced}
        setShowAdvanced={setShowAdvanced}
      />
    </form>
  );
}

// Helper function to get display name for a model ID
function getModelDisplayName(modelId) {
  if (!modelId) return "";

  // Search in model groups
  for (const group of MODEL_GROUPS) {
    const model = group.items.find((m) => m.id === modelId);
    if (model) return model.name;
  }

  // Return the ID itself for custom models
  return modelId;
}

// Component for model path input (when isLocal is true)
function ModelPathInput({ item, onUpdate }) {
  return (
    <p className="flex flex-col gap-0.5">
      <label htmlFor="Model Location">Path</label>
      <input
        className="border-solid border-x-transparent border-b-setta-200/50 border-t-transparent bg-transparent placeholder-setta-200 focus-visible:!border-b-blue-400 dark:border-b-setta-600/30 dark:placeholder-setta-600"
        name="Model Location"
        placeholder="path"
        value={item.localPath || ""}
        onChange={(e) => onUpdate("localPath", e.target.value)}
      />
    </p>
  );
}

// Component for API key input (when isLocal is false)
function ApiKeyInput({ item, onUpdate }) {
  return (
    <p className="flex flex-col gap-0.5">
      <label htmlFor="API Key">API Key</label>
      <div className="single-cell-container min-h-[19px]">
        <PasswordInput
          className="nodrag single-cell-child peer/textinput flex w-full min-w-0 max-w-[calc(100%_-_1.1rem)] self-center justify-self-start font-mono text-xs text-[rgb(3,_47,_98);] dark:text-[rgb(165,_214,_255)]"
          value={item.apiKey || ""}
          onChange={(value) => onUpdate("apiKey", value)}
          onEscape={() => {}}
          isDisabled={false}
          gridArea="single-cell-child"
        />
        <span className="single-cell-child border-box self-end border-b border-setta-200/50 peer-focus-within/textinput:border-blue-400 dark:border-setta-600/30" />
      </div>
    </p>
  );
}

// Component for advanced settings section
function AdvancedSettings({ item, onUpdate, showAdvanced, setShowAdvanced }) {
  return (
    <Collapsible.Root
      open={showAdvanced}
      onOpenChange={setShowAdvanced}
      className="mt-1"
    >
      <Collapsible.Trigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-1 text-left text-setta-500 hover:text-setta-700 dark:text-setta-400 dark:hover:text-setta-300"
        >
          {showAdvanced ? (
            <IoChevronDown className="h-4 w-4" />
          ) : (
            <IoChevronForward className="h-4 w-4" />
          )}
          <span>Advanced settings</span>
        </button>
      </Collapsible.Trigger>

      <Collapsible.Content>
        <div className="mt-2 flex flex-col gap-3 rounded-md bg-white/20 p-2 dark:bg-setta-800/20">
          {/* Custom endpoint URL */}
          {!item.isLocal && (
            <div className="flex flex-col gap-0.5">
              <label htmlFor="endpointUrl">API Endpoint URL</label>
              <input
                className="border-solid border-x-transparent border-b-setta-200/50 border-t-transparent bg-transparent placeholder-setta-200 focus-visible:!border-b-blue-400 dark:border-b-setta-600/30 dark:placeholder-setta-600"
                name="endpointUrl"
                placeholder="https://api.example.com/v1"
                value={item.endpointUrl || ""}
                onChange={(e) => onUpdate("endpointUrl", e.target.value)}
              />
            </div>
          )}

          {/* Organization ID (for OpenAI) */}
          {!item.isLocal && item.provider === "OpenAI" && (
            <div className="flex flex-col gap-0.5">
              <label htmlFor="organizationId">Organization ID (optional)</label>
              <input
                className="border-solid border-x-transparent border-b-setta-200/50 border-t-transparent bg-transparent placeholder-setta-200 focus-visible:!border-b-blue-400 dark:border-b-setta-600/30 dark:placeholder-setta-600"
                name="organizationId"
                placeholder="org-..."
                value={item.organizationId || ""}
                onChange={(e) => onUpdate("organizationId", e.target.value)}
              />
            </div>
          )}

          {/* Temperature slider */}
          <div className="flex flex-col gap-2">
            <div className="flex justify-between">
              <label htmlFor="temperature">Temperature</label>
              <span>{item.temperature || 0.7}</span>
            </div>
            <input
              type="range"
              className="w-full accent-blue-500"
              min="0"
              max="1"
              step="0.1"
              value={item.temperature || 0.7}
              onChange={(e) =>
                onUpdate("temperature", parseFloat(e.target.value))
              }
            />
          </div>

          {/* Max tokens */}
          <div className="flex flex-col gap-0.5">
            <label htmlFor="maxTokens">Max Tokens</label>
            <input
              type="number"
              name="maxTokens"
              placeholder="4096"
              value={item.maxTokens || ""}
              onChange={(e) =>
                onUpdate(
                  "maxTokens",
                  e.target.value ? parseInt(e.target.value) : "",
                )
              }
              className="border-solid border-x-transparent border-b-setta-200/50 border-t-transparent bg-transparent placeholder-setta-200 focus-visible:!border-b-blue-400 dark:border-b-setta-600/30 dark:placeholder-setta-600"
            />
          </div>

          {/* System prompt */}
          <div className="flex flex-col gap-0.5">
            <label htmlFor="systemPrompt">System Prompt</label>
            <textarea
              name="systemPrompt"
              placeholder="You are a helpful assistant..."
              value={item.systemPrompt || ""}
              onChange={(e) => onUpdate("systemPrompt", e.target.value)}
              rows={3}
              className="resize-vertical rounded-md border border-setta-200/50 bg-transparent p-1 placeholder-setta-200 focus-visible:!border-b-blue-400 dark:border-b-setta-600/30 dark:placeholder-setta-600"
            />
          </div>
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}

export default ModelItem;
