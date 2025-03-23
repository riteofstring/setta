export function AdvancedSettings({
  item,
  onUpdate,
  showAdvanced,
  setShowAdvanced,
}) {
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
