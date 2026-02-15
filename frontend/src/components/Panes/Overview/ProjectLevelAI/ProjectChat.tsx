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
import {
  SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { BiSolidBrain } from "react-icons/bi";
import { IoMdArrowRoundBack } from "react-icons/io";
import { IoSettingsOutline } from "react-icons/io5";
import { MdAdd, MdOutlineExtension } from "react-icons/md";
import { RiChatHistoryLine } from "react-icons/ri";
import { updateEngineConfig } from "state/actions/ai";
import { useAIStore } from "state/definitions";
import {
  AllLLMConfigs,
  EngineConfig,
  EngineTypeEnum,
  ExternalAgentPreflightStatus,
} from "utils/generatedTypes";
import { ProjectChatCore } from "./ProjectChatCore";
import { ProjectChatHistory } from "./ProjectChatHistory";
import { ProjectChatSkillsMcpViewer } from "./ProjectChatSkillsMcpViewer";
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
  const [viewSkillsMcpViewer, setViewSkillsMcpViewer] = useState(false);

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
      findPreferredEngineId({
        engineConfigs,
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
  const selectedEngineConfig = useMemo(() => {
    if (!selectedEngineId) {
      return null;
    }
    return (
      engineConfigs.find((config) => config.id === selectedEngineId) ?? null
    );
  }, [engineConfigs, selectedEngineId]);
  const effectiveEngineConfig = useMemo(() => {
    if (selectedEngineConfig) {
      return selectedEngineConfig;
    }
    if (preferredEngineId) {
      return (
        engineConfigs.find((config) => config.id === preferredEngineId) ?? null
      );
    }
    return engineConfigs[0] ?? null;
  }, [engineConfigs, preferredEngineId, selectedEngineConfig]);
  const effectiveEngineId = effectiveEngineConfig?.id ?? null;
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
  const projectHistoryRunType = useMemo(() => {
    if (engineType === EngineTypeEnum.external_agent) {
      return "external_agent";
    }
    if (engineType === EngineTypeEnum.setta_llm) {
      return "llm_chat";
    }
    return null;
  }, [engineType]);
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
      setViewSkillsMcpViewer(false);
    },
    [selectedEngineId, setChatId],
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
    const selectedConfig = selectedEngineId
      ? engineConfigs.find((config) => config.id === selectedEngineId) ?? null
      : null;
    const preferredId = preferredEngineId ?? engineConfigs[0].id;
    if (!selectedConfig) {
      setSelectedEngineId(preferredId);
      return;
    }
    if (
      preferredEngineId &&
      preferredEngineId !== selectedEngineId &&
      !isEngineUsable({
        config: selectedConfig,
        allLLMConfigs,
        availableConfigIds,
        externalAgentHealth,
        externalAgentHealthInitialLoadComplete,
      })
    ) {
      setSelectedEngineId(preferredEngineId);
    }
  }, [
    allLLMConfigs,
    availableConfigIds,
    engineConfigs,
    engineConfigsInitialLoadComplete,
    externalAgentHealth,
    externalAgentHealthInitialLoadComplete,
    preferredEngineId,
    selectedEngineId,
  ]);

  const isAuxView = viewHistory || viewSkillsMcpViewer;

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
                });
                setViewSkillsMcpViewer(false);
              }}
            >
              <MdAdd size={15} />
              <span className="hidden @[17.5rem]:block">New</span>
            </button>
            <button
              className="nodrag relative inline-flex h-full cursor-pointer select-none items-center gap-1 rounded-md bg-transparent px-1 text-xs font-semibold text-setta-600 transition-colors hover:text-setta-900 focus-visible:ring-2 active:!bg-blue-100 dark:text-setta-300 dark:hover:bg-transparent dark:hover:text-white active:dark:!bg-transparent"
              onClick={() => {
                setViewSkillsMcpViewer(false);
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
                  <span className="hidden @[17.5rem]:block">History</span>
                </>
              )}
            </button>
            <button
              className="nodrag relative inline-flex h-full cursor-pointer select-none items-center gap-1 rounded-md bg-transparent px-1 text-xs font-semibold text-setta-600 transition-colors hover:text-setta-900 focus-visible:ring-2 active:!bg-blue-100 dark:text-setta-300 dark:hover:bg-transparent dark:hover:text-white active:dark:!bg-transparent"
              onClick={() => {
                if (viewSkillsMcpViewer) {
                  setViewSkillsMcpViewer(false);
                  return;
                }
                useAIStore.setState({ viewHistory: false });
                setViewSkillsMcpViewer(true);
              }}
              aria-label="View Skills and MCP"
            >
              {viewSkillsMcpViewer ? (
                <>
                  <IoMdArrowRoundBack />
                  <span>Return to chat</span>
                </>
              ) : (
                <>
                  <MdOutlineExtension size={15} />
                  <span className="hidden @[17.5rem]:block">Skills/MCP</span>
                </>
              )}
            </button>
            {!isAuxView ? (
              <Menubar.Root className="contents">
                <FollowAIToggleButton />
              </Menubar.Root>
            ) : null}
            {!isAuxView && showPlanModeBadge ? <PlanModeBadge /> : null}
            {!isAuxView &&
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
            {!isAuxView ? (
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
          <ProjectChatHistory
            chatId={chatId}
            setChatId={setChatId}
            runType={projectHistoryRunType}
            engineConfigId={effectiveEngineId}
          />
        ) : viewSkillsMcpViewer ? (
          <ProjectChatSkillsMcpViewer />
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

function findPreferredEngineId({
  engineConfigs,
  allLLMConfigs,
  availableConfigIds,
  externalAgentHealth,
  externalAgentHealthInitialLoadComplete,
}: {
  engineConfigs: EngineConfig[];
  allLLMConfigs: AllLLMConfigs | null;
  availableConfigIds: Set<string>;
  externalAgentHealth: ExternalAgentPreflightStatus[];
  externalAgentHealthInitialLoadComplete: boolean;
}): string | null {
  for (const config of engineConfigs) {
    if (config.engineType !== EngineTypeEnum.setta_llm) {
      continue;
    }
    if (
      isEngineUsable({
        config,
        allLLMConfigs,
        availableConfigIds,
        externalAgentHealth,
        externalAgentHealthInitialLoadComplete,
      })
    ) {
      return config.id;
    }
  }
  for (const config of engineConfigs) {
    if (config.engineType !== EngineTypeEnum.external_agent) {
      continue;
    }
    if (
      isEngineUsable({
        config,
        allLLMConfigs,
        availableConfigIds,
        externalAgentHealth,
        externalAgentHealthInitialLoadComplete,
      })
    ) {
      return config.id;
    }
  }
  return engineConfigs[0]?.id ?? null;
}

function isEngineUsable({
  config,
  allLLMConfigs,
  availableConfigIds,
  externalAgentHealth,
  externalAgentHealthInitialLoadComplete,
}: {
  config: EngineConfig;
  allLLMConfigs: AllLLMConfigs | null;
  availableConfigIds: Set<string>;
  externalAgentHealth: ExternalAgentPreflightStatus[];
  externalAgentHealthInitialLoadComplete: boolean;
}): boolean {
  if (config.engineType === EngineTypeEnum.setta_llm) {
    const fallbackConfigId = pickDefaultConfigId(allLLMConfigs);
    const configId = config.settaLlmConfigId ?? fallbackConfigId;
    return Boolean(configId && availableConfigIds.has(configId));
  }
  if (config.engineType === EngineTypeEnum.external_agent) {
    if (!externalAgentHealthInitialLoadComplete) {
      return true;
    }
    const configId = config.externalAgentConfigId;
    const status = externalAgentHealth.find(
      (entry) => entry.configId === configId,
    );
    return Boolean(status?.available && status.supported);
  }
  return false;
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
