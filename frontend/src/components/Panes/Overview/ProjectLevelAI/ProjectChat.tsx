import {
  buildLLMConfigGroups,
  countLLMConfigs,
  pickDefaultConfigId,
} from "components/Chat/llmConfigUtils";
import { IdNameCombobox } from "components/Utils/Combobox/IdNameCombobox";
import _ from "lodash";
import { SetStateAction, useCallback, useMemo, useState } from "react";
import { BiSolidBrain } from "react-icons/bi";
import { IoMdArrowRoundBack } from "react-icons/io";
import { MdAdd } from "react-icons/md";
import { RiChatHistoryLine } from "react-icons/ri";
import { useAIStore } from "state/definitions";
import { useLocalValue } from "state/hooks/utils";
import { ProjectChatCore } from "./ProjectChatCore";
import { ProjectChatHistory } from "./ProjectChatHistory";
import { useHydrateAgenticState } from "./useHydrateAgenticState";
import { useHydrateLLMState } from "./useHydrateLLMState";

const CHAT_ENGINE_SETTA_ID = "setta-llm";

export function ProjectChat() {
  const chatId = useAIStore((state) => state.activeChatId);
  const setChatId = useCallback(
    (next: SetStateAction<string | null | undefined>) => {
      useAIStore.setState((state) => {
        const resolved =
          typeof next === "function" ? next(state.activeChatId) : next;
        return { activeChatId: resolved };
      });
    },
    [],
  );
  const [deepThink, setDeepThink] = useState(false);
  useHydrateLLMState();
  useHydrateAgenticState();

  const {
    apiKeys,
    apiKeysInitialLoadComplete,
    viewHistory,
    allLLMConfigs,
    llmConfigInitialLoadComplete,
    llmConfigId,
    externalAgentConfigs,
  } = useAIStore((x) => {
    const llmConfig =
      typeof chatId === "string" ? x.chatDetails[chatId]?.llmConfig : null;
    const llmConfigId = llmConfig?.id ?? pickDefaultConfigId(x.allLLMConfigs);

    return {
      apiKeys: x.apiKeys,
      apiKeysInitialLoadComplete: x.apiKeysInitialLoadComplete,
      viewHistory: x.viewHistory,
      allLLMConfigs: x.allLLMConfigs,
      llmConfigInitialLoadComplete: x.allLLMConfigsInitialLoadComplete,
      llmConfigId,
      externalAgentConfigs: x.externalAgentConfigs,
    };
  }, _.isEqual);

  const [selectedLLMConfigId, setSelectedLLMConfigId] =
    useLocalValue(llmConfigId);
  const [selectedEngineId, setSelectedEngineId] =
    useState<string>(CHAT_ENGINE_SETTA_ID);

  const availableConfigGroups = useMemo(
    () => buildLLMConfigGroups(allLLMConfigs, apiKeys),
    [apiKeys, allLLMConfigs],
  );
  const engineGroups = useMemo(() => {
    const externalItems = externalAgentConfigs.map((config) => {
      const toolLabel = config.toolType.replaceAll("_", " ");
      const baseLabel = config.name?.trim()
        ? config.name
        : `${toolLabel} (${config.runMode})`;
      return {
        id: config.id,
        name: baseLabel,
      };
    });
    return [
      {
        group: "Engine",
        items: [{ id: CHAT_ENGINE_SETTA_ID, name: "Setta LLM" }],
      },
      {
        group: "External Agents",
        items: externalItems,
      },
    ];
  }, [externalAgentConfigs]);

  const availableConfigCount = countLLMConfigs(availableConfigGroups);
  const noConfigsAvailable = availableConfigCount === 0;
  const externalAgentConfigId =
    selectedEngineId === CHAT_ENGINE_SETTA_ID ? null : selectedEngineId;
  const isExternalEngine = externalAgentConfigId !== null;
  let placeholderText = "Type a message...";
  if (!isExternalEngine) {
    if (noConfigsAvailable) {
      placeholderText = "Add API key!";
    } else if (!selectedLLMConfigId) {
      placeholderText = "Select an LLM";
    }
  } else if (!externalAgentConfigId) {
    placeholderText = "Select an external agent";
  }

  const handleEngineChange = useCallback(
    (value: string | null) => {
      const nextEngineId = value ?? CHAT_ENGINE_SETTA_ID;
      if (nextEngineId === selectedEngineId) {
        return;
      }
      setSelectedEngineId(nextEngineId);
      setChatId(undefined);
      useAIStore.setState({ viewHistory: false });
    },
    [selectedEngineId, setChatId],
  );

  return (
    apiKeysInitialLoadComplete &&
    llmConfigInitialLoadComplete && (
      <div className="flex h-full min-h-0 flex-col @container">
        <nav className="-mt-1.5 flex min-h-[50px] flex-col gap-2 border-b border-setta-100 pb-8 pt-2 @[17.5rem]:flex-row @[17.5rem]:items-center @[17.5rem]:pb-2 dark:border-setta-800">
          <div className="flex gap-2">
            <button
              className="nodrag relative inline-flex h-full cursor-pointer select-none items-center gap-1 rounded-md bg-transparent px-1 text-xs font-semibold text-setta-600 transition-colors hover:text-setta-900 focus-visible:ring-2 active:!bg-blue-100 dark:text-setta-300 dark:hover:bg-transparent dark:hover:text-white active:dark:!bg-transparent"
              aria-label="New Chat"
              onClick={() => {
                setChatId(undefined);
                useAIStore.setState({
                  viewHistory: false,
                });
              }}
            >
              <MdAdd size={15} />
              <span className="@[17.5rem]:hidden @sm:block">New</span>
            </button>
            <button
              className="nodrag relative inline-flex h-full cursor-pointer select-none items-center gap-1 rounded-md bg-transparent px-1 text-xs font-semibold text-setta-600 transition-colors hover:text-setta-900 focus-visible:ring-2 active:!bg-blue-100 dark:text-setta-300 dark:hover:bg-transparent dark:hover:text-white active:dark:!bg-transparent"
              onClick={() => {
                if (isExternalEngine) {
                  return;
                }
                useAIStore.setState({ viewHistory: !viewHistory });
              }}
              aria-label="View History"
              disabled={isExternalEngine}
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
              <IdNameCombobox
                allItems={engineGroups}
                value={selectedEngineId}
                small={false}
                onSelectedItemChange={handleEngineChange}
                placeholder="Select an engine"
                outerDivClasses="@[17.5rem]:max-w-64 justify-center"
              />

              {!isExternalEngine ? (
                <>
                  <button
                    className={`nodrag relative inline-flex h-full cursor-pointer select-none items-center gap-1 rounded-md bg-transparent px-1 text-xs font-semibold ${deepThink ? "text-blue-600 hover:text-blue-500 dark:hover:text-blue-500" : "text-setta-600 hover:text-setta-900 dark:text-setta-300 dark:hover:text-white"} transition-colors focus-visible:ring-2 active:!bg-transparent active:text-setta-500 dark:hover:bg-transparent active:dark:text-setta-300`}
                    aria-label="Extended Thinking"
                    onClick={() => {
                      setDeepThink(!deepThink);
                    }}
                  >
                    <BiSolidBrain size={15} />
                    <span className="hidden @[33.5rem]:block">
                      Deep Thinking
                    </span>
                  </button>

                  <IdNameCombobox
                    allItems={availableConfigGroups}
                    value={selectedLLMConfigId}
                    small={false}
                    onSelectedItemChange={setSelectedLLMConfigId}
                    placeholder={
                      noConfigsAvailable
                        ? "Add an LLM config or API key"
                        : "Select an LLM"
                    }
                    // TODO: should not use bg for all this. really should restructure IdNameCombobox to be more flexible.
                    bg={`${!selectedLLMConfigId ? "bg-red-500 hover:bg-red-800 hover:dark:bg-red-900 dark:bg-red-950 !placeholder-white !border-red-500" : ""}`}
                    outerDivClasses="@[17.5rem]:max-w-64 justify-center"
                  />
                </>
              ) : null}
            </div>
          )}
        </nav>

        {viewHistory ? (
          <ProjectChatHistory chatId={chatId} setChatId={setChatId} />
        ) : (
          <ProjectChatCore
            chatId={chatId}
            placeholderText={placeholderText}
            deepThink={deepThink}
            llmConfigId={selectedLLMConfigId}
            externalAgentConfigId={externalAgentConfigId}
            setChatId={setChatId}
          />
        )}
      </div>
    )
  );
}
