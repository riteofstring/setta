import { IdNameCombobox } from "components/Utils/Combobox/IdNameCombobox";
import { useEffect, useMemo, useState } from "react";
import { BiSolidBrain } from "react-icons/bi";
import { IoMdArrowRoundBack } from "react-icons/io";
import { MdAdd } from "react-icons/md";
import { RiChatHistoryLine } from "react-icons/ri";
import {
  createNewLLMChat,
  getUUIDMappingForLLM,
  loadLLMConfig,
} from "state/actions/ai";
import { useAIStore } from "state/definitions";
import { C } from "utils/c";
import { shallow } from "zustand/shallow";
import { ProjectChatCore } from "./ProjectChatCore";
import { ProjectChatHistory } from "./ProjectChatHistory";

export function ProjectChat() {
  const { llmConfig, llmConfigLoaded, viewHistory, userSelectedLLM } =
    useAIStore(
      (x) => ({
        llmConfig: x.llmConfig,
        llmConfigLoaded: x.llmConfigLoaded,
        viewHistory: x.viewHistory,
        userSelectedLLM: x.userSelectedLLM,
      }),
      shallow,
    );

  useEffect(() => {
    getUUIDMappingForLLM();
  }, []);

  useEffect(() => {
    if (!llmConfigLoaded) {
      loadLLMConfig();
    }
  }, [llmConfigLoaded]);

  const [deepThink, setDeepThink] = useState(false);

  // Memoize filtered model groups
  const filteredModelGroups = useMemo(
    () =>
      (llmConfig?.providers ?? [])
        .map((provider) => ({
          group: provider.display_name,
          items: provider.models.map((model) => ({
            id: model.model_id,
            name: model.display_name,
          })),
        }))
        .filter((group) => group.items.length > 0),
    [llmConfig],
  );

  const noModelsAvailable = llmConfigLoaded && filteredModelGroups.length === 0;
  const configPath = `${C.SETTA_FILES_FOLDER}/llm_config.json`;
  const comboboxPlaceholder = !llmConfigLoaded
    ? "Loading LLM configuration..."
    : noModelsAvailable
      ? `Define models in ${configPath}`
      : "Select an LLM";

  return (
    <div className="flex h-full min-h-0 flex-col @container">
      <nav className="-mt-1.5 flex min-h-[50px] flex-col gap-2 border-b border-setta-100 pb-8 pt-2 @[17.5rem]:flex-row @[17.5rem]:items-center @[17.5rem]:pb-2 dark:border-setta-800">
        <div className="flex gap-2">
          <button
            className="nodrag relative inline-flex h-full cursor-pointer select-none items-center gap-1 rounded-md bg-transparent px-1 text-xs font-semibold text-setta-600 transition-colors hover:text-setta-900 focus-visible:ring-2 active:!bg-blue-100 dark:text-setta-300 dark:hover:bg-transparent dark:hover:text-white active:dark:!bg-transparent"
            aria-label="New Chat"
            onClick={createNewLLMChat}
          >
            <MdAdd size={15} />
            <span className="@[17.5rem]:hidden @sm:block">New</span>
          </button>
          <button
            className="nodrag relative inline-flex h-full cursor-pointer select-none items-center gap-1 rounded-md bg-transparent px-1 text-xs font-semibold text-setta-600 transition-colors hover:text-setta-900 focus-visible:ring-2 active:!bg-blue-100 dark:text-setta-300 dark:hover:bg-transparent dark:hover:text-white active:dark:!bg-transparent"
            onClick={() => useAIStore.setState({ viewHistory: !viewHistory })}
            aria-label="View History"
          >
            {viewHistory ? (
              <>
                <IoMdArrowRoundBack />
                <span>Return to chat</span>
              </>
            ) : (
              <>
                <RiChatHistoryLine size={15} />
                <span className="@[17.5rem]:hidden @sm:block">History</span>
              </>
            )}
          </button>
        </div>

        {viewHistory ? null : (
          <div className="ml-auto flex w-full items-center justify-end gap-2">
            <button
              className={`nodrag relative inline-flex h-full cursor-pointer select-none items-center gap-1 rounded-md bg-transparent px-1 text-xs font-semibold ${deepThink ? "text-blue-600 hover:text-blue-500 dark:hover:text-blue-500" : "text-setta-600 hover:text-setta-900 dark:text-setta-300 dark:hover:text-white"} transition-colors  focus-visible:ring-2 active:!bg-transparent active:text-setta-500 dark:hover:bg-transparent  active:dark:text-setta-300`}
              aria-label="Extended Thinking"
              onClick={() => {
                setDeepThink(!deepThink);
              }}
            >
              <BiSolidBrain size={15} />
              <span className="hidden @[33.5rem]:block">Deep Thinking</span>
            </button>

            <IdNameCombobox
              allItems={filteredModelGroups}
              value={userSelectedLLM}
              small={false}
              onSelectedItemChange={(model) =>
                useAIStore.setState({ userSelectedLLM: model })
              }
              placeholder={comboboxPlaceholder}
              // TODO: should not use bg for all this. really should restructure IdNameCombobox to be more flexible.
              bg={`${!userSelectedLLM ? "bg-red-500 hover:bg-red-800 hover:dark:bg-red-900 dark:bg-red-950 !placeholder-white !border-red-500" : ""}`}
              outerDivClasses="@[17.5rem]:max-w-64 justify-center"
              isDisabled={!llmConfigLoaded || noModelsAvailable}
            />
          </div>
        )}
      </nav>

      {viewHistory ? (
        <ProjectChatHistory />
      ) : (
        <ProjectChatCore
          placeholderText={
            !llmConfigLoaded
              ? "Loading LLM configuration..."
              : noModelsAvailable
                ? `Add at least one provider/model in ${configPath}`
                : !userSelectedLLM
                  ? "Select an LLM"
                  : "Type a message..."
          }
          deepThink={deepThink}
          userSelectedLLM={userSelectedLLM}
        />
      )}
    </div>
  );
}
