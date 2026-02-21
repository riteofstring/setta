import * as Menubar from "@radix-ui/react-menubar";
import { FollowAIToggleButton } from "components/AppHeader/FollowAIToggleButton";
import { type ChatPermissionModeValue } from "components/Chat/chatComposerControls";
import {
  buildEngineGroups,
  getChatPlaceholderText,
  getExternalEngineIssueMessage,
  getExternalEngineStatus,
} from "components/Chat/engineUtils";
import {
  buildLLMConfigGroups,
  countLLMConfigs,
  pickDefaultConfigId,
} from "components/Chat/llmConfigUtils";
import { PlanModeBadge } from "components/Chat/PlanModeBadge";
import { shouldShowPlanModeBadge } from "components/Chat/planModeBadgeUtils";
import { isProviderDictationLikelySupported } from "components/Chat/providerDictationSupport";
import { StandardPopover } from "components/Utils/atoms/popover/standardpopover";
import type { AllItemsType } from "components/Utils/Combobox/ComboboxStateReducer";
import { IdNameCombobox } from "components/Utils/Combobox/IdNameCombobox";
import _ from "lodash";
import { Resizable } from "re-resizable";
import {
  SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { BiSolidBrain } from "react-icons/bi";
import { IoMdArrowRoundBack } from "react-icons/io";
import { IoSettingsOutline } from "react-icons/io5";
import { MdAdd } from "react-icons/md";
import { RiChatHistoryLine } from "react-icons/ri";
import { saveLLMConfig, updateEngineConfig } from "state/actions/ai";
import { addPersistentNotification } from "state/actions/notifications";
import { useAIStore, useLocalStorage } from "state/definitions";
import {
  AllLLMConfigs,
  EngineConfig,
  EngineTypeEnum,
  ExternalAgentConfig,
  ExternalAgentPreflightStatus,
  SettaNotificationTypeEnum,
} from "utils/generatedTypes";
import { clamp } from "utils/utils";
import {
  getDefaultProjectChatPermissionMode,
  ProjectChatCore,
} from "./ProjectChatCore";
import { ProjectChatHistory } from "./ProjectChatHistory";
import { ProjectChatSkillsMcpViewer } from "./ProjectChatSkillsMcpViewer";
import { useHydrateAgenticState } from "./useHydrateAgenticState";
import { useHydrateLLMState } from "./useHydrateLLMState";

type ProjectAISettingsPopoverProps = {
  engineGroups: ReturnType<typeof buildEngineGroups>;
  availableConfigGroups: ReturnType<typeof buildLLMConfigGroups>;
  selectedEngineId: string | null;
  selectedLLMConfigId: string | null;
  defaultLLMConfigId: string | null;
  engineType: EngineTypeEnum | null;
  noConfigsAvailable: boolean;
  dictationMode: ProjectDictationMode;
  providerDictationLikelySupported: boolean;
  onOpenSkillsMcpViewer: () => void;
  onEngineChange: (value: string | null) => void;
  onLLMConfigChange: (value: string | null) => void;
  onPinDefaultModel: () => void;
  onDictationModeChange: (value: ProjectDictationMode) => void;
};

type ProjectDictationMode = "auto" | "browser" | "provider";
const INLINE_THREADS_BREAKPOINT_PX = 760;
const INLINE_THREADS_MIN_WIDTH_PX = 220;
const INLINE_THREADS_DEFAULT_WIDTH_PX = 288;
const INLINE_THREADS_MAX_WIDTH_PX = 520;
const INLINE_THREADS_MIN_CHAT_WIDTH_PX = 420;
const INLINE_THREADS_WIDTH_STORAGE_KEY = "setta_project_ai_inline_threads_width";

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
    viewThreads,
    allLLMConfigs,
    llmConfigInitialLoadComplete,
    externalAgentHealth,
    externalAgentHealthInitialLoadComplete,
    externalAgentConfigs,
    engineConfigs,
    engineConfigsInitialLoadComplete,
    projectChatDictationMode,
    projectChatSelectedEngineId,
  } = useAIStore(
    (x) => ({
      apiKeys: x.apiKeys,
      apiKeysInitialLoadComplete: x.apiKeysInitialLoadComplete,
      viewThreads: x.viewThreads,
      allLLMConfigs: x.allLLMConfigs,
      llmConfigInitialLoadComplete: x.allLLMConfigsInitialLoadComplete,
      externalAgentHealth: x.externalAgentHealth,
      externalAgentHealthInitialLoadComplete:
        x.externalAgentHealthInitialLoadComplete,
      externalAgentConfigs: x.externalAgentConfigs,
      engineConfigs: x.engineConfigs,
      engineConfigsInitialLoadComplete: x.engineConfigsInitialLoadComplete,
      projectChatDictationMode: x.projectChatDictationMode,
      projectChatSelectedEngineId: x.projectChatSelectedEngineId,
    }),
    _.isEqual,
  );
  const overviewPaneWidth = useLocalStorage((state) => state.overviewWidth);
  const [inlineThreadsWidth, setInlineThreadsWidth] = useState(() => {
    if (typeof window === "undefined") {
      return INLINE_THREADS_DEFAULT_WIDTH_PX;
    }
    const stored = Number(window.localStorage.getItem(INLINE_THREADS_WIDTH_STORAGE_KEY));
    if (!Number.isFinite(stored)) {
      return INLINE_THREADS_DEFAULT_WIDTH_PX;
    }
    return stored;
  });

  const selectedEngineId = projectChatSelectedEngineId;
  const setSelectedEngineId = useCallback((value: string | null) => {
    useAIStore.setState({ projectChatSelectedEngineId: value });
  }, []);
  const [runtimePermissionMode, setRuntimePermissionMode] =
    useState<ChatPermissionModeValue>("minimal");
  const [viewSkillsMcpViewer, setViewSkillsMcpViewer] = useState(false);
  const notifiedExternalEngineIssueRef = useRef<string | null>(null);

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
  const selectedLLMConfig = useMemo(() => {
    if (!selectedLLMConfigId || !allLLMConfigs) {
      return null;
    }
    return allLLMConfigs.configs[selectedLLMConfigId] ?? null;
  }, [allLLMConfigs, selectedLLMConfigId]);
  const defaultLLMConfigId = allLLMConfigs?.default_config_id ?? null;
  const providerDictationLikelySupported = useMemo(
    () => isProviderDictationLikelySupported(selectedLLMConfig),
    [selectedLLMConfig],
  );
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
  const showPlanModeBadge = shouldShowPlanModeBadge({
    engineType,
    externalAgentToolType: externalAgentConfig?.toolType ?? null,
    approvalPolicy: externalAgentConfig?.approvalPolicy ?? null,
    permissionMode: runtimePermissionMode,
  });
  const activeModelForContextEstimate = useMemo(() => {
    if (engineType === EngineTypeEnum.setta_llm) {
      return selectedLLMConfig?.model ?? null;
    }
    if (engineType === EngineTypeEnum.external_agent) {
      return resolveExternalAgentModelForContext(externalAgentConfig);
    }
    return null;
  }, [engineType, externalAgentConfig, selectedLLMConfig?.model]);
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
  const externalEngineIssueMessage = useMemo(
    () => getExternalEngineIssueMessage(externalEngineStatus),
    [externalEngineStatus],
  );

  useEffect(() => {
    if (!externalEngineIssueMessage) {
      notifiedExternalEngineIssueRef.current = null;
      return;
    }
    if (notifiedExternalEngineIssueRef.current === externalEngineIssueMessage) {
      return;
    }
    notifiedExternalEngineIssueRef.current = externalEngineIssueMessage;
    addPersistentNotification(
      externalEngineIssueMessage,
      SettaNotificationTypeEnum.warning,
    );
  }, [externalEngineIssueMessage]);

  const handleEngineChange = useCallback(
    (value: string | null) => {
      const nextEngineId = value ?? null;
      if (nextEngineId === selectedEngineId) {
        return;
      }
      setSelectedEngineId(nextEngineId);
      setChatId(undefined);
      useAIStore.setState({ viewThreads: false });
      setViewSkillsMcpViewer(false);
    },
    [selectedEngineId, setChatId, setSelectedEngineId],
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
  const handlePinDefaultModel = useCallback(() => {
    if (!allLLMConfigs || !selectedLLMConfigId) {
      return;
    }
    if (allLLMConfigs.default_config_id === selectedLLMConfigId) {
      return;
    }
    void saveLLMConfig({
      ...allLLMConfigs,
      default_config_id: selectedLLMConfigId,
    });
  }, [allLLMConfigs, selectedLLMConfigId]);
  const handleDictationModeChange = useCallback(
    (value: ProjectDictationMode) => {
      useAIStore.setState({ projectChatDictationMode: value });
    },
    [],
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
    setSelectedEngineId,
  ]);
  useEffect(() => {
    setRuntimePermissionMode(getDefaultProjectChatPermissionMode(engineType));
  }, [engineType]);

  const showInlineThreads =
    viewThreads &&
    !viewSkillsMcpViewer &&
    overviewPaneWidth >= INLINE_THREADS_BREAKPOINT_PX;
  const inlineThreadsMaxWidth = useMemo(() => {
    const boundedMaxWidth = clamp(
      overviewPaneWidth - INLINE_THREADS_MIN_CHAT_WIDTH_PX,
      INLINE_THREADS_MIN_WIDTH_PX,
      INLINE_THREADS_MAX_WIDTH_PX,
    );
    return boundedMaxWidth;
  }, [overviewPaneWidth]);
  const resolvedInlineThreadsWidth = useMemo(() => {
    return clamp(
      inlineThreadsWidth,
      INLINE_THREADS_MIN_WIDTH_PX,
      inlineThreadsMaxWidth,
    );
  }, [inlineThreadsMaxWidth, inlineThreadsWidth]);
  const canResizeInlineThreads =
    inlineThreadsMaxWidth > INLINE_THREADS_MIN_WIDTH_PX;

  const updateInlineThreadsWidth = useCallback(
    (nextWidth: number) => {
      const resolvedWidth = clamp(
        nextWidth,
        INLINE_THREADS_MIN_WIDTH_PX,
        inlineThreadsMaxWidth,
      );
      setInlineThreadsWidth((current) => {
        if (current === resolvedWidth) {
          return current;
        }
        return resolvedWidth;
      });
    },
    [inlineThreadsMaxWidth],
  );

  useEffect(() => {
    if (inlineThreadsWidth === resolvedInlineThreadsWidth) {
      return;
    }
    setInlineThreadsWidth(resolvedInlineThreadsWidth);
  }, [inlineThreadsWidth, resolvedInlineThreadsWidth]);
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(
      INLINE_THREADS_WIDTH_STORAGE_KEY,
      String(inlineThreadsWidth),
    );
  }, [inlineThreadsWidth]);

  const isAuxView = viewSkillsMcpViewer || (viewThreads && !showInlineThreads);

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
                  viewThreads: false,
                });
                setViewSkillsMcpViewer(false);
              }}
            >
              <MdAdd size={15} />
              <span className="hidden @[31.25rem]:block">New</span>
            </button>
            <button
              className="nodrag relative inline-flex h-full cursor-pointer select-none items-center gap-1 rounded-md bg-transparent px-1 text-xs font-semibold text-setta-600 transition-colors hover:text-setta-900 focus-visible:ring-2 active:!bg-blue-100 dark:text-setta-300 dark:hover:bg-transparent dark:hover:text-white active:dark:!bg-transparent"
              onClick={() => {
                setViewSkillsMcpViewer(false);
                useAIStore.setState({ viewThreads: !viewThreads });
              }}
              aria-label="View Threads"
            >
              {viewThreads ? (
                <>
                  {showInlineThreads ? (
                    <RiChatHistoryLine size={15} />
                  ) : (
                    <IoMdArrowRoundBack />
                  )}
                  <span className="hidden @[31.25rem]:block">
                    {showInlineThreads ? "Hide Threads" : "Return to chat"}
                  </span>
                </>
              ) : (
                <>
                  <RiChatHistoryLine size={15} />
                  <span className="hidden @[31.25rem]:block">Threads</span>
                </>
              )}
            </button>
            {viewSkillsMcpViewer ? (
              <button
                className="nodrag relative inline-flex h-full cursor-pointer select-none items-center gap-1 rounded-md bg-transparent px-1 text-xs font-semibold text-setta-600 transition-colors hover:text-setta-900 focus-visible:ring-2 active:!bg-blue-100 dark:text-setta-300 dark:hover:bg-transparent dark:hover:text-white active:dark:!bg-transparent"
                onClick={() => {
                  setViewSkillsMcpViewer(false);
                }}
                aria-label="Return to chat"
              >
                <IoMdArrowRoundBack />
                <span className="hidden @[31.25rem]:block">Return to chat</span>
              </button>
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
                <span className="hidden @[31.25rem]:block">Thinking</span>
              </button>
            ) : null}
            {!isAuxView ? (
              <div className="ml-auto flex items-center">
                <ProjectAISettingsPopover
                  engineGroups={engineGroups}
                  availableConfigGroups={availableConfigGroups}
                  selectedEngineId={effectiveEngineId}
                  selectedLLMConfigId={selectedLLMConfigId}
                  defaultLLMConfigId={defaultLLMConfigId}
                  engineType={engineType}
                  noConfigsAvailable={noConfigsAvailable}
                  dictationMode={projectChatDictationMode}
                  providerDictationLikelySupported={
                    providerDictationLikelySupported
                  }
                  onOpenSkillsMcpViewer={() => {
                    useAIStore.setState({ viewThreads: false });
                    setViewSkillsMcpViewer(true);
                  }}
                  onEngineChange={handleEngineChange}
                  onLLMConfigChange={handleLLMConfigChange}
                  onPinDefaultModel={handlePinDefaultModel}
                  onDictationModeChange={handleDictationModeChange}
                />
              </div>
            ) : null}
          </div>
        </nav>

        {viewSkillsMcpViewer ? (
          <ProjectChatSkillsMcpViewer />
        ) : showInlineThreads ? (
          <div className="flex min-h-0 flex-1">
            <Resizable
              className="h-full shrink-0"
              size={{ width: resolvedInlineThreadsWidth, height: "100%" }}
              minWidth={INLINE_THREADS_MIN_WIDTH_PX}
              maxWidth={inlineThreadsMaxWidth}
              boundsByDirection
              enable={{
                top: false,
                right: canResizeInlineThreads,
                bottom: false,
                left: false,
                topRight: false,
                bottomRight: false,
                bottomLeft: false,
                topLeft: false,
              }}
              handleComponent={{
                right: (
                  <div
                    data-testid="project-chat-inline-threads-resize-handle"
                    className="h-full w-2 cursor-col-resize bg-transparent hover:bg-blue-500/20"
                  />
                ),
              }}
              onResize={(_event, _direction, elementRef) => {
                updateInlineThreadsWidth(elementRef.offsetWidth);
              }}
              onResizeStop={(_event, _direction, elementRef) => {
                updateInlineThreadsWidth(elementRef.offsetWidth);
              }}
            >
              <ProjectChatHistory
                chatId={chatId}
                setChatId={setChatId}
                runType={projectHistoryRunType}
                engineConfigId={effectiveEngineId}
                inline={true}
                closeOnSelect={false}
              />
            </Resizable>
            <div className="flex min-h-0 min-w-0 flex-1 flex-col pl-2">
              <ProjectChatCore
                chatId={chatId}
                placeholderText={placeholderText}
                thinking={thinking}
                engineConfigId={effectiveEngineId}
                engineType={engineType}
                hasLLMConfig={hasLLMConfig}
                externalEngineAvailable={externalEngineAvailable}
                noLLMConfigsAvailable={noConfigsAvailable}
                dictationMode={projectChatDictationMode}
                providerDictationLikelySupported={
                  providerDictationLikelySupported
                }
                contextEstimateModel={activeModelForContextEstimate}
                setChatId={setChatId}
                onPermissionModeChange={setRuntimePermissionMode}
              />
            </div>
          </div>
        ) : viewThreads ? (
          <ProjectChatHistory
            chatId={chatId}
            setChatId={setChatId}
            runType={projectHistoryRunType}
            engineConfigId={effectiveEngineId}
            closeOnSelect={true}
          />
        ) : (
          <>
            <ProjectChatCore
              chatId={chatId}
              placeholderText={placeholderText}
              thinking={thinking}
              engineConfigId={effectiveEngineId}
              engineType={engineType}
              hasLLMConfig={hasLLMConfig}
              externalEngineAvailable={externalEngineAvailable}
              noLLMConfigsAvailable={noConfigsAvailable}
              dictationMode={projectChatDictationMode}
              providerDictationLikelySupported={
                providerDictationLikelySupported
              }
              contextEstimateModel={activeModelForContextEstimate}
              setChatId={setChatId}
              onPermissionModeChange={setRuntimePermissionMode}
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

function resolveExternalAgentModelForContext(
  externalAgentConfig: ExternalAgentConfig | null,
): string | null {
  if (!externalAgentConfig) {
    return null;
  }
  const managed = externalAgentConfig.settingsManagedBlock;
  if (
    externalAgentConfig.toolType === "codex" &&
    managed?.codex?.model?.trim()
  ) {
    return managed.codex.model.trim();
  }
  if (
    externalAgentConfig.toolType === "opencode" &&
    managed?.opencode?.model?.trim()
  ) {
    return managed.opencode.model.trim();
  }
  return externalAgentConfig.defaultModel?.trim() ?? null;
}

function ProjectAISettingsPopover({
  engineGroups,
  availableConfigGroups,
  selectedEngineId,
  selectedLLMConfigId,
  defaultLLMConfigId,
  engineType,
  noConfigsAvailable,
  dictationMode,
  providerDictationLikelySupported,
  onOpenSkillsMcpViewer,
  onEngineChange,
  onLLMConfigChange,
  onPinDefaultModel,
  onDictationModeChange,
}: ProjectAISettingsPopoverProps) {
  const showLLMConfig = engineType === EngineTypeEnum.setta_llm;
  const llmPlaceholder = noConfigsAvailable
    ? "Add an LLM config or API key"
    : "Select an LLM";
  const llmBg = selectedLLMConfigId
    ? ""
    : "bg-red-500 hover:bg-red-800 hover:dark:bg-red-900 dark:bg-red-950 !placeholder-white !border-red-500";
  const providerModeAvailable = showLLMConfig;
  const autoFallsBackToBrowser =
    showLLMConfig && !providerDictationLikelySupported;
  const selectedModelPinnedAsDefault =
    selectedLLMConfigId !== null && selectedLLMConfigId === defaultLLMConfigId;
  const dictationModeOptions = useMemo<AllItemsType<ProjectDictationMode>>(
    () => [
      {
        group: "Microphone Source",
        items: [
          {
            id: "auto",
            name: "Auto (provider, then browser/OS)",
          },
          {
            id: "provider",
            name: providerModeAvailable
              ? "Always provider"
              : "Always provider (requires LLM engine)",
          },
          {
            id: "browser",
            name: "Always browser / OS",
          },
        ],
      },
    ],
    [providerModeAvailable],
  );
  const handleDictationModeOptionChange = useCallback(
    (value: ProjectDictationMode | null) => {
      if (!value) {
        return;
      }
      if (value === "provider" && !providerModeAvailable) {
        return;
      }
      onDictationModeChange(value);
    },
    [onDictationModeChange, providerModeAvailable],
  );

  return (
    <StandardPopover
      trigger={
        <button
          className="nodrag relative inline-flex h-full cursor-pointer select-none items-center gap-1 rounded-md bg-transparent px-1 text-xs font-semibold text-setta-600 transition-colors hover:text-setta-900 focus-visible:ring-2 active:!bg-blue-100 dark:text-setta-300 dark:hover:bg-transparent dark:hover:text-white active:dark:!bg-transparent"
          aria-label="Project AI Settings"
          type="button"
        >
          <IoSettingsOutline size={15} />
          <span className="hidden @[31.25rem]:block">Settings</span>
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
              <button
                type="button"
                onClick={onPinDefaultModel}
                disabled={!selectedLLMConfigId || selectedModelPinnedAsDefault}
                className="h-8 w-full rounded-md border border-setta-200 bg-white px-2 text-left text-[11px] font-semibold text-setta-600 transition-colors hover:bg-setta-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-200 dark:hover:bg-setta-800/70"
              >
                {selectedModelPinnedAsDefault
                  ? "Selected model is pinned as default"
                  : "Pin selected model as default"}
              </button>
            </div>
          ) : null}
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold text-setta-500 dark:text-setta-400">
              Tools
            </span>
            <button
              type="button"
              onClick={onOpenSkillsMcpViewer}
              className="h-8 w-full rounded-md border border-setta-200 bg-white px-2 text-left text-[11px] font-semibold text-setta-600 transition-colors hover:bg-setta-50 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-200 dark:hover:bg-setta-800/70"
            >
              Open Skills/MCP
            </button>
            <Menubar.Root className="contents">
              <FollowAIToggleButton
                labelMode="always"
                triggerClassName="nodrag relative inline-flex h-8 w-full select-none items-center gap-1 rounded-md border border-setta-200 bg-white px-2 text-[11px] font-semibold transition-colors hover:bg-setta-50 focus-visible:ring-2 dark:border-setta-700 dark:bg-setta-900 dark:hover:bg-setta-800/70"
              />
            </Menubar.Root>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold text-setta-500 dark:text-setta-400">
              Microphone Source
            </span>
            <IdNameCombobox
              allItems={dictationModeOptions}
              value={dictationMode}
              small={false}
              onSelectedItemChange={handleDictationModeOptionChange}
              placeholder="Microphone source"
              outerDivClasses="w-full"
              inputDivId="project-ai-microphone-source"
            />
            <p className="text-[10px] text-setta-500 dark:text-setta-400">
              Provider mode uses the current LLM Config.
            </p>
            {dictationMode === "auto" && autoFallsBackToBrowser ? (
              <p className="text-[10px] text-amber-700 dark:text-amber-300">
                Auto currently prefers browser/OS because the selected model
                does not appear transcription-capable.
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </StandardPopover>
  );
}
