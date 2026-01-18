import { PasswordInput } from "components/Params/ParamUIs/PasswordInput";
import { useAIStore } from "state/definitions";
import { useEditableOnSubmit } from "state/hooks/editableText";
import { C } from "utils/c";
import { MODEL_GROUPS } from "utils/constants";
import { route_set_llm_api_keys } from "utils/generatedEndpoints";
import { useHydrateLLMState } from "./useHydrateLLMState";

const IsolatedInput = ({ apiKeyName }) => {
  const initialValue = useAIStore((x) => x.apiKeys[apiKeyName] ?? "");

  const onSetValue = (v) => {
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

export function ProjectLLMSettings() {
  useHydrateLLMState();
  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto pb-[30dvh] text-setta-600 dark:text-setta-400">
      {MODEL_GROUPS.map((group) => (
        <div
          key={group.group}
          className="mr-0.5 flex flex-col gap-2 rounded-lg p-3 text-xs transition-colors hover:bg-white/50 hover:dark:bg-setta-800/50"
        >
          <p className="text-base font-bold">{group.group}</p>

          <div className="flex flex-col gap-0.5">
            <label htmlFor={`api-key-${group.group}`}>API Key</label>
            <div className="single-cell-container grid min-h-[19px] grid-cols-[1fr,auto]">
              <IsolatedInput apiKeyName={C.LLM_API_KEY_NAMES[group.group]} />
              <span className="single-cell-child border-box col-span-2 self-end border-b border-setta-200/50 peer-focus-within/textinput:border-blue-400 dark:border-setta-600/30" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
