import * as Menubar from "@radix-ui/react-menubar";
import { FollowAIToggleButton } from "components/AppHeader/FollowAIToggleButton";
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
import { StandardPopover } from "components/Utils/atoms/popover/standardpopover";
import { IdNameCombobox } from "components/Utils/Combobox/IdNameCombobox";
import _ from "lodash";
import { SetStateAction, useCallback, useMemo, useState } from "react";
import { BiSolidBrain } from "react-icons/bi";
import { IoMdArrowRoundBack } from "react-icons/io";
import { IoSettingsOutline } from "react-icons/io5";
import { MdAdd } from "react-icons/md";
import { RiChatHistoryLine, RiToolsLine } from "react-icons/ri";
import { updateEngineConfig } from "state/actions/ai";
import { useAIStore } from "state/definitions";
import { EngineTypeEnum } from "utils/generatedTypes";
import { ProjectChatCapabilities } from "./ProjectChatCapabilities";
import { ProjectChatCore } from "./ProjectChatCore";
import {
  findPreferredProjectChatEngineId,
  resolveEffectiveProjectChatEngineId,
} from "./projectChatEngineSelection";
import { ProjectChatHistory } from "./ProjectChatHistory";
import { useHydrateAgenticState } from "./useHydrateAgenticState";
import { useHydrateLLMState } from "./useHydrateLLMState";

type ProjectAISettingsPopoverProps = {
  engineGroups: ReturnType<typeof buildEngineGroups>;
  availableConfigGroups: ReturnType<typeof buildLLMConfigGroups>;
  selectedEngineId: string | null;
  selectedLLMConfigId: string | null;
  engineType: EngineTypeEnum | null;
  noConfigsAvailable: boolean;
  onEngineChange: (value: string | null) => void;
  onLLMConfigChange: (value: string | null) => void;
};

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
    viewCapabilities,
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
      viewCapabilities: x.viewCapabilities,
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

  const [manuallySelectedEngineId, setManuallySelectedEngineId] = useState<
    string | null
  >(null);

  const availableConfigGroups = useMemo(
    () => buildLLMConfigGroups(allLLMConfigs, apiKeys),
    [apiKeys, allLLMConfigs],
  );
  const availableConfigIds = useMemo(() => {
    const ids = new Set<string>();
    for (const group of availableConfigGroups) {
      for (const item of group.items) {
        ids.add(item.id);
      }
    }
    return ids;
  }, [availableConfigGroups]);
  const engineGroups = useMemo(
    () => buildEngineGroups(engineConfigs),
    [engineConfigs],
  );
  const preferredEngineId = useMemo(
    () =>
      findPreferredProjectChatEngineId(engineConfigs, {
        allLLMConfigs,
        availableConfigIds,
        externalAgentHealth,
        externalAgentHealthInitialLoadComplete,
      }),
    [
      allLLMConfigs,
      availableConfigIds,
      engineConfigs,
      externalAgentHealth,
      externalAgentHealthInitialLoadComplete,
    ],
  );

  const availableConfigCount = countLLMConfigs(availableConfigGroups);
  const noConfigsAvailable = availableConfigCount === 0;
  const effectiveEngineId = useMemo(
    () =>
      resolveEffectiveProjectChatEngineId(
        engineConfigs,
        preferredEngineId,
        manuallySelectedEngineId,
      ),
    [engineConfigs, preferredEngineId, manuallySelectedEngineId],
  );
  const selectedEngineConfig = useMemo(() => {
    if (!effectiveEngineId) {
      return null;
    }
    return (
      engineConfigs.find((config) => config.id === effectiveEngineId) ?? null
    );
  }, [effectiveEngineId, engineConfigs]);
  const effectiveEngineConfig = selectedEngineConfig;
  const engineType = effectiveEngineConfig?.engineType ?? null;
  const selectedLLMConfigId = useMemo(() => {
    if (!effectiveEngineConfig) {
      return null;
    }
    if (effectiveEngineConfig.engineType !== EngineTypeEnum.setta_llm) {
      return null;
    }
    return (
      effectiveEngineConfig.settaLlmConfigId ??
      pickDefaultConfigId(allLLMConfigs)
    );
  }, [allLLMConfigs, effectiveEngineConfig]);
  const hasLLMConfig = Boolean(
    selectedLLMConfigId && availableConfigIds.has(selectedLLMConfigId),
  );
  const externalEngineStatus = useMemo(
    () =>
      getExternalEngineStatus(
        effectiveEngineConfig,
        externalAgentHealth,
        externalAgentHealthInitialLoadComplete,
      ),
    [
      effectiveEngineConfig,
      externalAgentHealth,
      externalAgentHealthInitialLoadComplete,
    ],
  );
  const externalEngineAvailable = externalEngineStatus
    ? externalEngineStatus.status === "available"
    : true;
  const externalAgentConfig = useMemo(() => {
    if (!effectiveEngineConfig?.externalAgentConfigId) {
      return null;
    }
    return (
      externalAgentConfigs.find(
        (config) => config.id === effectiveEngineConfig.externalAgentConfigId,
      ) ?? null
    );
  }, [externalAgentConfigs, effectiveEngineConfig]);
  const showPlanModeBadge =
    engineType === EngineTypeEnum.external_agent &&
    externalAgentConfig?.toolType === "claude_code" &&
    externalAgentConfig.approvalPolicy === "plan";
  const placeholderText = getChatPlaceholderText({
    engineType,
    hasEngineConfig: Boolean(effectiveEngineConfig),
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
      if (nextEngineId === manuallySelectedEngineId) {
        return;
      }
      setManuallySelectedEngineId(nextEngineId);
      setChatId(undefined);
      useAIStore.setState({ viewHistory: false, viewCapabilities: false });
    },
    [manuallySelectedEngineId, setChatId],
  );

  const handleLLMConfigChange = useCallback(
    (value: string | null) => {
      if (!effectiveEngineConfig) {
        return;
      }
      if (effectiveEngineConfig.engineType !== EngineTypeEnum.setta_llm) {
        return;
      }
      const nextConfig = {
        ...effectiveEngineConfig,
        settaLlmConfigId: value,
      };
      void updateEngineConfig({ config: nextConfig });
    },
    [effectiveEngineConfig],
  );

  return (
    apiKeysInitialLoadComplete &&
    llmConfigInitialLoadComplete &&
    engineConfigsInitialLoadComplete && (
      <div className="flex h-full min-h-0 flex-col @container">
        <nav className="flex flex-col border-b border-setta-100 pb-2 dark:border-setta-800">
          <div className="mt-2 flex w-full flex-nowrap items-center gap-2 overflow-x-auto">
            <button
              className="nodrag relative inline-flex h-full cursor-pointer select-none items-center gap-1 rounded-md bg-transparent px-1 text-xs font-semibold text-setta-600 transition-colors hover:text-setta-900 focus-visible:ring-2 active:!bg-blue-100 dark:text-setta-300 dark:hover:bg-transparent dark:hover:text-white active:dark:!bg-transparent"
              aria-label="New Chat"
              onClick={() => {
                setChatId(undefined);
                useAIStore.setState({
                  viewHistory: false,
                  viewCapabilities: false,
                });
              }}
            >
              <MdAdd size={15} />
              <span className="hidden @[19.375rem]:block">New</span>
            </button>
            <button
              className="nodrag relative inline-flex h-full cursor-pointer select-none items-center gap-1 rounded-md bg-transparent px-1 text-xs font-semibold text-setta-600 transition-colors hover:text-setta-900 focus-visible:ring-2 active:!bg-blue-100 dark:text-setta-300 dark:hover:bg-transparent dark:hover:text-white active:dark:!bg-transparent"
              onClick={() => {
                useAIStore.setState({
                  viewHistory: !viewHistory,
                  viewCapabilities: false,
                });
              }}
              aria-label="View History"
            >
              {viewHistory ? (
                <>
                  <IoMdArrowRoundBack />
                  <span className="hidden @[19.375rem]:block">
                    Return to chat
                  </span>
                </>
              ) : (
                <>
                  <RiChatHistoryLine size={15} />
                  <span className="hidden @[19.375rem]:block">History</span>
                </>
              )}
            </button>
            <button
              className="nodrag relative inline-flex h-full cursor-pointer select-none items-center gap-1 rounded-md bg-transparent px-1 text-xs font-semibold text-setta-600 transition-colors hover:text-setta-900 focus-visible:ring-2 active:!bg-blue-100 dark:text-setta-300 dark:hover:bg-transparent dark:hover:text-white active:dark:!bg-transparent"
              onClick={() => {
                useAIStore.setState({
                  viewCapabilities: !viewCapabilities,
                  viewHistory: false,
                });
              }}
              aria-label="View Capabilities"
            >
              {viewCapabilities ? (
                <>
                  <IoMdArrowRoundBack />
                  <span className="hidden @[19.375rem]:block">
                    Return to chat
                  </span>
                </>
              ) : (
                <>
                  <RiToolsLine size={15} />
                  <span className="hidden @[19.375rem]:block">
                    Capabilities
                  </span>
                </>
              )}
            </button>
            {!viewHistory && !viewCapabilities ? (
              <Menubar.Root className="contents">
                <FollowAIToggleButton />
              </Menubar.Root>
            ) : null}
            {!viewHistory && !viewCapabilities && showPlanModeBadge ? (
              <PlanModeBadge />
            ) : null}
            {!viewHistory &&
            !viewCapabilities &&
            (engineType === EngineTypeEnum.setta_llm ||
              engineType === EngineTypeEnum.external_agent) ? (
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
            {!viewHistory && !viewCapabilities ? (
              <div className="ml-auto flex items-center">
                <ProjectAISettingsPopover
                  engineGroups={engineGroups}
                  availableConfigGroups={availableConfigGroups}
                  selectedEngineId={effectiveEngineId}
                  selectedLLMConfigId={selectedLLMConfigId}
                  engineType={engineType}
                  noConfigsAvailable={noConfigsAvailable}
                  onEngineChange={handleEngineChange}
                  onLLMConfigChange={handleLLMConfigChange}
                />
              </div>
            ) : null}
          </div>
        </nav>

        {viewHistory ? (
          <ProjectChatHistory chatId={chatId} setChatId={setChatId} />
        ) : viewCapabilities ? (
          <ProjectChatCapabilities chatId={chatId} />
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
              thinking={thinking}
              engineConfigId={effectiveEngineId}
              engineType={engineType}
              hasLLMConfig={hasLLMConfig}
              externalEngineAvailable={externalEngineAvailable}
              noLLMConfigsAvailable={noConfigsAvailable}
              setChatId={setChatId}
            />
          </>
        )}
      </div>
    )
  );
}

function ProjectAISettingsPopover({
  engineGroups,
  availableConfigGroups,
  selectedEngineId,
  selectedLLMConfigId,
  engineType,
  noConfigsAvailable,
  onEngineChange,
  onLLMConfigChange,
}: ProjectAISettingsPopoverProps) {
  const showLLMConfig = engineType === EngineTypeEnum.setta_llm;
  const llmPlaceholder = noConfigsAvailable
    ? "Add an LLM config or API key"
    : "Select an LLM";
  const llmBg = selectedLLMConfigId
    ? ""
    : "bg-red-500 hover:bg-red-800 hover:dark:bg-red-900 dark:bg-red-950 !placeholder-white !border-red-500";

  return (
    <StandardPopover
      trigger={
        <button
          className="nodrag relative inline-flex h-full cursor-pointer select-none items-center gap-1 rounded-md bg-transparent px-1 text-xs font-semibold text-setta-600 transition-colors hover:text-setta-900 focus-visible:ring-2 active:!bg-blue-100 dark:text-setta-300 dark:hover:bg-transparent dark:hover:text-white active:dark:!bg-transparent"
          aria-label="Project AI Settings"
          type="button"
        >
          <IoSettingsOutline size={15} />
          <span className="hidden @[33.5rem]:block">Settings</span>
        </button>
      }
      contentClasses="z-50 w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-setta-200/80 bg-white/95 p-3 shadow-xl backdrop-blur relative overflow-visible dark:border-setta-700/70 dark:bg-setta-900/95 data-[state=open]:animate-fade-in"
      arrowClasses="fill-white/95 stroke-[1px] stroke-setta-200/80 dark:fill-setta-900/95 dark:stroke-setta-700/70"
    >
      <div className="flex flex-col gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-setta-400 dark:text-setta-500">
          Project AI
        </p>
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold text-setta-500 dark:text-setta-400">
              Engine
            </span>
            <IdNameCombobox
              allItems={engineGroups}
              value={selectedEngineId}
              small={false}
              onSelectedItemChange={onEngineChange}
              placeholder="Select an engine"
              outerDivClasses="w-full"
            />
          </div>
          {showLLMConfig ? (
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold text-setta-500 dark:text-setta-400">
                LLM Config
              </span>
              <IdNameCombobox
                allItems={availableConfigGroups}
                value={selectedLLMConfigId}
                small={false}
                onSelectedItemChange={onLLMConfigChange}
                placeholder={llmPlaceholder}
                // TODO: should not use bg for all this. really should restructure IdNameCombobox to be more flexible.
                bg={llmBg}
                outerDivClasses="w-full"
              />
            </div>
          ) : null}
        </div>
      </div>
    </StandardPopover>
  );
}
