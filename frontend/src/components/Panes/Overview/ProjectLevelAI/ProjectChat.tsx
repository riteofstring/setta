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
import { PlanModeBadge } from "components/Chat/PlanModeBadge";
import type { AllItemsType } from "components/Utils/Combobox/ComboboxStateReducer";
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
import {
  createAgenticEdgeFromSections,
  deleteAgenticEdgesById,
} from "state/actions/agenticEdges";
import { updateEngineConfig } from "state/actions/ai";
import { useAIStore, useProjectState } from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import {
  AgenticEdgeKindEnum,
  EngineTypeEnum,
  SectionTypeEnum,
} from "utils/generatedTypes";
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
  const [thinking, setThinking] = useState(true);
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
    externalAgentConfigs,
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
      externalAgentConfigs: x.externalAgentConfigs,
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
  const externalAgentConfig = useMemo(() => {
    if (!selectedEngineConfig?.externalAgentConfigId) {
      return null;
    }
    return (
      externalAgentConfigs.find(
        (config) => config.id === selectedEngineConfig.externalAgentConfigId,
      ) ?? null
    );
  }, [externalAgentConfigs, selectedEngineConfig]);
  const showPlanModeBadge =
    engineType === EngineTypeEnum.external_agent &&
    externalAgentConfig?.toolType === "claude_code" &&
    externalAgentConfig.approvalPolicy === "plan";
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
              {showPlanModeBadge ? <PlanModeBadge /> : null}

              {engineType === EngineTypeEnum.setta_llm ||
              engineType === EngineTypeEnum.external_agent ? (
                <button
                  className={`nodrag relative inline-flex h-full cursor-pointer select-none items-center gap-1 rounded-md bg-transparent px-1 text-xs font-semibold ${thinking ? "text-blue-600 hover:text-blue-500 dark:hover:text-blue-500" : "text-setta-600 hover:text-setta-900 dark:text-setta-300 dark:hover:text-white"} transition-colors focus-visible:ring-2 active:!bg-transparent active:text-setta-500 dark:hover:bg-transparent active:dark:text-setta-300`}
                  aria-label="Thinking"
                  onClick={() => {
                    setThinking(!thinking);
                  }}
                >
                  <BiSolidBrain size={15} />
                  <span className="hidden @[33.5rem]:block">Thinking</span>
                </button>
              ) : null}

              {engineType === EngineTypeEnum.setta_llm ? (
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
              ) : null}
            </div>
          )}
        </nav>

        {viewHistory ? (
          <ProjectChatHistory chatId={chatId} setChatId={setChatId} />
        ) : (
          <>
            {externalStatusMessage ? (
              <div className="px-1 pb-2">
                <p className={`text-xs ${externalStatusClassName}`}>
                  {externalStatusMessage}
                </p>
              </div>
            ) : null}
            <ProjectChatContextLinks chatId={chatId} />
            <ProjectChatCore
              chatId={chatId}
              placeholderText={placeholderText}
              thinking={thinking}
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

function ProjectChatContextLinks({
  chatId,
}: {
  chatId: string | null | undefined;
}) {
  const { canEditStructure } = useShareCapabilities();
  const {
    sections,
    sectionVariants,
    sectionImpls,
    sectionVariantMap,
    agenticEdges,
  } = useProjectState(
    (state) => ({
      sections: state.sections,
      sectionVariants: state.sectionVariants,
      sectionImpls: state.sectionImpls,
      sectionVariantMap: state.projectConfig.sectionVariantMap,
      agenticEdges: state.projectConfig.agenticEdges,
    }),
    _.isEqual,
  );

  const sectionOptions = useMemo(() => {
    const options: Array<{ id: string; name: string }> = [];
    for (const [id, core] of Object.entries(sections)) {
      const variantId = sectionVariantMap[id];
      if (!variantId) {
        continue;
      }
      const variant = sectionVariants[variantId];
      if (!variant) {
        continue;
      }
      const impl = sectionImpls[variant.impl];
      if (!impl || impl.type === SectionTypeEnum.Chat) {
        continue;
      }
      const displayName = core.displayName?.trim();
      const name =
        displayName && displayName.length > 0 ? displayName : core.name || id;
      options.push({ id, name });
    }
    return _.sortBy(options, (entry) => entry.name.toLowerCase());
  }, [sectionImpls, sectionVariantMap, sectionVariants, sections]);

  const contextItems = useMemo<AllItemsType<string>>(() => {
    return [{ group: "Sections", items: sectionOptions }];
  }, [sectionOptions]);

  const contextEdges = useMemo(() => {
    if (typeof chatId !== "string") {
      return [];
    }
    return agenticEdges.filter(
      (edge) =>
        edge.kind === AgenticEdgeKindEnum.section_chat &&
        edge.targetSectionId === chatId,
    );
  }, [agenticEdges, chatId]);

  const contextOptionCount = contextItems[0]?.items.length ?? 0;
  const canEditLinks = canEditStructure && typeof chatId === "string";

  if (typeof chatId !== "string") {
    return null;
  }

  const handleAddContextSection = useCallback(
    (value: string | null) => {
      if (!value || typeof chatId !== "string" || !canEditLinks) {
        return;
      }
      createAgenticEdgeFromSections({
        sourceSectionId: value,
        targetSectionId: chatId,
        kind: AgenticEdgeKindEnum.section_chat,
      });
    },
    [canEditLinks, chatId],
  );

  const sectionLabelsById = useMemo(() => {
    const labels: Record<string, string> = {};
    for (const [id, core] of Object.entries(sections)) {
      const display = core.displayName?.trim();
      labels[id] = display && display.length > 0 ? display : core.name || id;
    }
    return labels;
  }, [sections]);

  return (
    <div className="mb-3 rounded-md border border-setta-200/70 bg-white/70 p-3 shadow-sm dark:border-setta-800 dark:bg-setta-900/40">
      <div className="flex flex-col gap-2">
        <IdNameCombobox
          allItems={contextItems}
          value={null}
          small={true}
          onSelectedItemChange={handleAddContextSection}
          placeholder={
            contextOptionCount > 0 ? "Add a section" : "No sections available"
          }
          outerDivClasses="justify-center"
          inputOuterClasses="!h-7"
          isDisabled={!canEditLinks || contextOptionCount === 0}
          selectedItemCanBeNull
          clearInputAfterSelection
        />
        {contextEdges.length === 0 ? (
          <p className="text-[11px] text-setta-500 dark:text-setta-500">
            No context links yet.
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            {contextEdges.map((edge) => (
              <div
                key={edge.id}
                className="flex items-center justify-between gap-2 rounded-md border border-setta-200/80 bg-white/80 px-2 py-1 text-[11px] text-setta-700 dark:border-setta-700/60 dark:bg-setta-900/70 dark:text-setta-200"
              >
                <span className="truncate">
                  {sectionLabelsById[edge.sourceSectionId] ??
                    edge.sourceSectionId}
                </span>
                <button
                  type="button"
                  className="text-[10px] font-semibold text-setta-500 hover:text-setta-800 dark:text-setta-400 dark:hover:text-setta-200"
                  onClick={() => deleteAgenticEdgesById([edge.id])}
                  disabled={!canEditLinks}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
