import { useEffect } from "react";
import { loadLLMConfig } from "state/actions/ai";
import { useAIStore } from "state/definitions";
import { C } from "utils/c";
import { shallow } from "zustand/shallow";

export function ProjectLLMSettings() {
  const { llmConfig, llmConfigLoaded } = useAIStore(
    (x) => ({
      llmConfig: x.llmConfig,
      llmConfigLoaded: x.llmConfigLoaded,
    }),
    shallow,
  );

  useEffect(() => {
    if (!llmConfigLoaded) {
      loadLLMConfig();
    }
  }, [llmConfigLoaded]);

  const configPath = `${C.SETTA_FILES_FOLDER}/llm_config.json`;

  if (!llmConfigLoaded) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-setta-500 dark:text-setta-400">
        Loading LLM configuration...
      </div>
    );
  }

  if (!llmConfig || llmConfig.providers.length === 0) {
    return (
      <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto pb-[30dvh] text-setta-600 dark:text-setta-400">
        <p className="text-sm">
          LLM settings now live in <code className="font-mono text-xs">{configPath}</code>.
          Add providers, models, and API keys to that JSON file to enable chat. The UI editor for this
          configuration is coming soon.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto pb-[30dvh] text-setta-600 dark:text-setta-400">
      <p className="text-xs leading-snug text-setta-500 dark:text-setta-400">
        Editing UI is still in progress. Update <code className="font-mono text-[11px]">{configPath}</code> manually to change providers.
      </p>

      <div className="flex flex-col gap-3">
        <div className="rounded-lg border border-setta-200/60 p-3 text-xs dark:border-setta-700/60">
          <p className="font-semibold text-setta-700 dark:text-setta-200">Gateway URL</p>
          <code className="mt-1 block truncate font-mono text-[11px] text-setta-500 dark:text-setta-400">
            {llmConfig.gateway_url}
          </code>
        </div>

        {llmConfig.providers.map((provider) => (
          <div
            key={provider.provider_id}
            className="mr-0.5 flex flex-col gap-3 rounded-lg border border-setta-200/60 p-3 text-xs transition-colors dark:border-setta-700/60"
          >
            <div className="flex flex-col gap-0.5">
              <p className="text-base font-bold text-setta-700 dark:text-white">
                {provider.display_name}
              </p>
              <p className="font-mono text-[11px] uppercase tracking-wide text-setta-500 dark:text-setta-400">
                {provider.provider_id}
              </p>
              {provider.base_url ? (
                <code className="font-mono text-[11px] text-setta-500 dark:text-setta-400">
                  {provider.base_url}
                </code>
              ) : null}
              <p className="text-[11px] text-setta-500 dark:text-setta-400">
                Default model: {provider.default_model_id ?? "Not set"}
              </p>
            </div>

            <div className="flex flex-col gap-2">
              {provider.models.length === 0 ? (
                <p className="text-[11px] text-setta-500 dark:text-setta-400">
                  No models configured for this provider.
                </p>
              ) : (
                provider.models.map((model) => (
                  <div
                    key={`${provider.provider_id}:${model.model_id}`}
                    className="rounded border border-dashed border-setta-200/70 p-2 dark:border-setta-600/70"
                  >
                    <p className="text-sm font-semibold text-setta-700 dark:text-setta-100">
                      {model.display_name}
                    </p>
                    <p className="font-mono text-[11px] text-setta-500 dark:text-setta-400">
                      {model.model_id}
                    </p>
                    {model.supports_reasoning ? (
                      <p className="text-[10px] uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                        Supports reasoning
                      </p>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
