import {
  buildEngineGroups,
  getChatPlaceholderText,
  getExternalEngineStatus,
} from "components/Chat/engineUtils";
import {
  buildLLMConfigGroups,
  countLLMConfigs,
  pickDefaultConfigId,
} from "components/Chat/llmConfigUtils";
import { IdNameCombobox } from "components/Utils/Combobox/IdNameCombobox";
import _ from "lodash";
import {
  SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { BiSolidBrain } from "react-icons/bi";
import { IoMdArrowRoundBack } from "react-icons/io";
import { MdAdd } from "react-icons/md";
import { RiChatHistoryLine } from "react-icons/ri";
import { updateEngineConfig } from "state/actions/ai";
import { useAIStore } from "state/definitions";
import { EngineTypeEnum } from "utils/generatedTypes";
import { ProjectChatCore } from "./ProjectChatCore";
import { ProjectChatHistory } from "./ProjectChatHistory";
import { useHydrateAgenticState } from "./useHydrateAgenticState";
import { useHydrateLLMState } from "./useHydrateLLMState";

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
    externalAgentHealth,
    externalAgentHealthInitialLoadComplete,
    engineConfigs,
    engineConfigsInitialLoadComplete,
  } = useAIStore(
    (x) => ({
      apiKeys: x.apiKeys,
      apiKeysInitialLoadComplete: x.apiKeysInitialLoadComplete,
      viewHistory: x.viewHistory,
      allLLMConfigs: x.allLLMConfigs,
      llmConfigInitialLoadComplete: x.allLLMConfigsInitialLoadComplete,
      externalAgentHealth: x.externalAgentHealth,
      externalAgentHealthInitialLoadComplete:
        x.externalAgentHealthInitialLoadComplete,
      engineConfigs: x.engineConfigs,
      engineConfigsInitialLoadComplete: x.engineConfigsInitialLoadComplete,
    }),
    _.isEqual,
  );

  const [selectedEngineId, setSelectedEngineId] = useState<string | null>(null);

  const availableConfigGroups = useMemo(
    () => buildLLMConfigGroups(allLLMConfigs, apiKeys),
    [apiKeys, allLLMConfigs],
  );
  const engineGroups = useMemo(
    () => buildEngineGroups(engineConfigs),
    [engineConfigs],
  );

  const availableConfigCount = countLLMConfigs(availableConfigGroups);
  const noConfigsAvailable = availableConfigCount === 0;
  const selectedEngineConfig = useMemo(() => {
    if (!selectedEngineId) {
      return null;
    }
    return (
      engineConfigs.find((config) => config.id === selectedEngineId) ?? null
    );
  }, [engineConfigs, selectedEngineId]);
  const engineType = selectedEngineConfig?.engineType ?? null;
  const selectedLLMConfigId = useMemo(() => {
    if (!selectedEngineConfig) {
      return null;
    }
    if (selectedEngineConfig.engineType !== EngineTypeEnum.setta_llm) {
      return null;
    }
    return (
      selectedEngineConfig.settaLlmConfigId ??
      pickDefaultConfigId(allLLMConfigs)
    );
  }, [allLLMConfigs, selectedEngineConfig]);
  const hasLLMConfig = Boolean(selectedLLMConfigId);
  const externalEngineStatus = useMemo(
    () =>
      getExternalEngineStatus(
        selectedEngineConfig,
        externalAgentHealth,
        externalAgentHealthInitialLoadComplete,
      ),
    [
      selectedEngineConfig,
      externalAgentHealth,
      externalAgentHealthInitialLoadComplete,
    ],
  );
  const externalEngineAvailable = externalEngineStatus
    ? externalEngineStatus.status === "available"
    : true;
  const placeholderText = getChatPlaceholderText({
    engineType,
    hasEngineConfig: Boolean(selectedEngineConfig),
    hasLLMConfig,
    noLLMConfigsAvailable: noConfigsAvailable,
  });
  const externalStatusMessage = useMemo(() => {
    if (!externalEngineStatus) {
      return null;
    }
    if (externalEngineStatus.status === "loading") {
      return "Checking external engine status...";
    }
    if (externalEngineStatus.status === "available") {
      return "External engine available";
    }
    if (externalEngineStatus.issues.length > 0) {
      return `External engine unavailable: ${externalEngineStatus.issues.join(
        "; ",
      )}`;
    }
    return "External engine unavailable";
  }, [externalEngineStatus]);
  const externalStatusClassName = useMemo(() => {
    if (!externalEngineStatus) {
      return "";
    }
    if (externalEngineStatus.status === "available") {
      return "text-emerald-600 dark:text-emerald-400";
    }
    if (externalEngineStatus.status === "loading") {
      return "text-setta-500 dark:text-setta-400";
    }
    return "text-red-600 dark:text-red-400";
  }, [externalEngineStatus]);

  const handleEngineChange = useCallback(
    (value: string | null) => {
      const nextEngineId = value ?? null;
      if (nextEngineId === selectedEngineId) {
        return;
      }
      setSelectedEngineId(nextEngineId);
      setChatId(undefined);
      useAIStore.setState({ viewHistory: false });
    },
    [selectedEngineId, setChatId],
  );

  const handleLLMConfigChange = useCallback(
    (value: string | null) => {
      if (!selectedEngineConfig) {
        return;
      }
      if (selectedEngineConfig.engineType !== EngineTypeEnum.setta_llm) {
        return;
      }
      const nextConfig = {
        ...selectedEngineConfig,
        settaLlmConfigId: value,
      };
      void updateEngineConfig({ config: nextConfig });
    },
    [selectedEngineConfig],
  );

  useEffect(() => {
    if (!engineConfigsInitialLoadComplete) {
      return;
    }
    if (engineConfigs.length === 0) {
      if (selectedEngineId !== null) {
        setSelectedEngineId(null);
      }
      return;
    }
    if (selectedEngineId === null) {
      setSelectedEngineId(engineConfigs[0].id);
      return;
    }
    const exists = engineConfigs.some(
      (config) => config.id === selectedEngineId,
    );
    if (!exists) {
      setSelectedEngineId(engineConfigs[0].id);
    }
  }, [engineConfigs, engineConfigsInitialLoadComplete, selectedEngineId]);

  return (
    apiKeysInitialLoadComplete &&
    llmConfigInitialLoadComplete &&
    engineConfigsInitialLoadComplete && (
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
                useAIStore.setState({ viewHistory: !viewHistory });
              }}
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
              <IdNameCombobox
                allItems={engineGroups}
                value={selectedEngineId}
                small={false}
                onSelectedItemChange={handleEngineChange}
                placeholder="Select an engine"
                outerDivClasses="@[17.5rem]:max-w-64 justify-center"
              />

              {engineType === EngineTypeEnum.setta_llm ? (
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
                    onSelectedItemChange={handleLLMConfigChange}
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
          <ProjectChatHistory setChatId={setChatId} />
        ) : (
          <>
            {externalStatusMessage ? (
              <div className="px-1 pb-2">
                <p className={`text-xs ${externalStatusClassName}`}>
                  {externalStatusMessage}
                </p>
              </div>
            ) : null}
            <ProjectChatCore
              chatId={chatId}
              placeholderText={placeholderText}
              deepThink={deepThink}
              engineConfigId={selectedEngineId}
              engineType={engineType}
              hasLLMConfig={hasLLMConfig}
              externalEngineAvailable={externalEngineAvailable}
              setChatId={setChatId}
            />
          </>
        )}
      </div>
    )
  );
}
