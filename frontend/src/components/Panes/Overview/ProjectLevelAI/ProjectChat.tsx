import * as Menubar from "@radix-ui/react-menubar";
import { FollowAIToggleButton } from "components/AppHeader/FollowAIToggleButton";
import { type ChatPermissionModeValue } from "components/Chat/chatComposerControls";
import { resolveProviderDictationAvailability } from "components/Chat/dictationMode";
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
import { SwitchInput } from "components/Params/ParamUIs/SwitchInput";
import { StandardPopover } from "components/Utils/atoms/popover/standardpopover";
import type { AllItemsType } from "components/Utils/Combobox/ComboboxStateReducer";
import { IdNameCombobox } from "components/Utils/Combobox/IdNameCombobox";
import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
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
import { IoMdArrowRoundBack } from "react-icons/io";
import { IoSettingsOutline } from "react-icons/io5";
import { MdAdd, MdChevronLeft, MdChevronRight } from "react-icons/md";
import { RiChatHistoryLine } from "react-icons/ri";
import { saveLLMConfig, updateEngineConfig } from "state/actions/ai";
import {
  buildChatHistoryEntries,
  type ChatHistoryCompatibility,
} from "state/actions/chatHistory";
import { addPersistentNotification } from "state/actions/notifications";
import { setProjectChatThreadGroupAssignment } from "state/actions/projectChatThreads";
import {
  useAIStore,
  useLocalStorage,
  useProjectState,
} from "state/definitions";
import {
  buildSearchableTextForMessage,
  matchesConversationSearchText,
  tokenizeConversationSearchQuery,
} from "utils/conversationSearch";
import {
  AllLLMConfigs,
  BaseChatMessageUnion,
  ChatRoleEnum,
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
import {
  focusInputWithoutSelectionById,
  PROJECT_AI_ENGINE_COMBOBOX_INPUT_ID,
} from "./projectChatFocusUtils";
import { ProjectChatHistory } from "./ProjectChatHistory";
import { ProjectChatSkillsMcpViewer } from "./ProjectChatSkillsMcpViewer";
import { useHydrateAgenticState } from "./useHydrateAgenticState";
import { useHydrateLLMState } from "./useHydrateLLMState";

type ProjectAISettingsPopoverProps = {
  engineGroups: ReturnType<typeof buildEngineGroups>;
  transcriptionProfileGroups: AllItemsType<string>;
  availableConfigGroups: ReturnType<typeof buildLLMConfigGroups>;
  selectedEngineId: string | null;
  selectedLLMConfigId: string | null;
  selectedTranscriptionProfileId: string | null;
  defaultLLMConfigId: string | null;
  engineType: EngineTypeEnum | null;
  noConfigsAvailable: boolean;
  dictationMode: ProjectDictationMode;
  activityAccordionOpenByDefault: boolean;
  activityChildrenOpenByDefault: boolean;
  providerDictationLikelySupported: boolean;
  providerDictationUnavailableReason: string;
  onOpenSkillsMcpViewer: () => void;
  onEngineChange: (value: string | null) => void;
  onLLMConfigChange: (value: string | null) => void;
  onTranscriptionProfileChange: (value: string | null) => void;
  onPinDefaultModel: () => void;
  onDictationModeChange: (value: ProjectDictationMode) => void;
  onActivityAccordionOpenByDefaultChange: (value: boolean) => void;
  onActivityChildrenOpenByDefaultChange: (value: boolean) => void;
};

type ProjectDictationMode = "auto" | "browser" | "provider";
const INLINE_THREADS_BREAKPOINT_PX = 760;
const INLINE_THREADS_MIN_WIDTH_PX = 220;
const INLINE_THREADS_DEFAULT_WIDTH_PX = 288;
const INLINE_THREADS_MAX_WIDTH_PX = 520;
const INLINE_THREADS_MIN_CHAT_WIDTH_PX = 420;
const PROJECT_CHAT_CONTENT_SHELL_CLASS = "mx-auto w-full max-w-[72rem] px-2";
const INLINE_THREADS_WIDTH_STORAGE_KEY =
  "setta_project_ai_inline_threads_width";
type DraftProjectThreadState =
  | { phase: "none" }
  | { phase: "idle" }
  | { phase: "pending_chat_id" }
  | { phase: "awaiting_title"; chatId: string };

type ResolveProjectChatThreadVisibilityFromResizeInput = {
  isInitialRun: boolean;
  wasLargeEnoughForInlineThreads: boolean;
  isLargeEnoughForInlineThreads: boolean;
  viewThreads: boolean;
  explicitlyClosedAtLargeWidth: boolean;
};

type ResolveProjectChatEngineConfigIdForSelectedChatInput = {
  chatId: string | null | undefined;
  selectedEngineId: string | null;
  availableEngineConfigIds: Set<string>;
  chatEngineConfigByChatId: Map<string, string | null>;
};

export function resolveProjectChatThreadVisibilityFromResize({
  isInitialRun,
  wasLargeEnoughForInlineThreads,
  isLargeEnoughForInlineThreads,
  viewThreads,
  explicitlyClosedAtLargeWidth,
}: ResolveProjectChatThreadVisibilityFromResizeInput): boolean | null {
  if (isInitialRun) {
    if (!isLargeEnoughForInlineThreads) {
      if (!viewThreads) {
        return null;
      }
      return false;
    }
    if (viewThreads || explicitlyClosedAtLargeWidth) {
      return null;
    }
    return true;
  }
  if (wasLargeEnoughForInlineThreads === isLargeEnoughForInlineThreads) {
    return null;
  }
  if (!isLargeEnoughForInlineThreads) {
    if (!viewThreads) {
      return null;
    }
    return false;
  }
  if (viewThreads || explicitlyClosedAtLargeWidth) {
    return null;
  }
  return true;
}

export function resolveProjectChatEngineConfigIdForSelectedChat({
  chatId,
  selectedEngineId,
  availableEngineConfigIds,
  chatEngineConfigByChatId,
}: ResolveProjectChatEngineConfigIdForSelectedChatInput): string | null {
  const resolvedChatId = chatId?.trim() ?? "";
  if (!resolvedChatId) {
    return null;
  }
  const resolvedEngineConfigId = chatEngineConfigByChatId.get(resolvedChatId);
  if (!resolvedEngineConfigId) {
    return null;
  }
  if (!availableEngineConfigIds.has(resolvedEngineConfigId)) {
    return null;
  }
  if (resolvedEngineConfigId === selectedEngineId) {
    return null;
  }
  return resolvedEngineConfigId;
}

export function ProjectChat() {
  const chatId = useAIStore((state) => state.activeChatId);
  const agentRuns = useAIStore((state) => state.agentRuns);
  const projectConfigId = useProjectState((state) => state.projectConfig.id);
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
  const [draftThreadState, setDraftThreadState] =
    useState<DraftProjectThreadState>({
      phase: "none",
    });
  const [draftThreadTargetGroupId, setDraftThreadTargetGroupId] = useState<
    string | null
  >(null);
  const [thinking, setThinking] = useState(true);
  const [conversationFilterText, setConversationFilterText] = useState("");
  const [conversationSearchMatchIndex, setConversationSearchMatchIndex] =
    useState<number | null>(null);
  useHydrateLLMState();
  useHydrateAgenticState();
  const activeConversationMessages = useAIStore((state) => {
    if (chatId === null) {
      const pendingMessages = state.pendingChatDetails?.messages;
      if (Array.isArray(pendingMessages)) {
        return pendingMessages as Array<BaseChatMessageUnion>;
      }
      return [];
    }
    if (typeof chatId !== "string") {
      return [];
    }
    const activeMessages = state.chatDetails[chatId]?.messages;
    if (Array.isArray(activeMessages)) {
      return activeMessages as Array<BaseChatMessageUnion>;
    }
    return [];
  });

  const {
    apiKeys,
    apiKeysInitialLoadComplete,
    viewThreads,
    projectChatThreadsExplicitlyClosedAtLargeWidth,
    allLLMConfigs,
    llmConfigInitialLoadComplete,
    externalAgentHealth,
    externalAgentHealthInitialLoadComplete,
    externalAgentConfigs,
    engineConfigs,
    engineConfigsInitialLoadComplete,
    transcriptionProfiles,
    transcriptionProfilesInitialLoadComplete,
    projectChatDictationMode,
    projectChatTranscriptionProfileId,
    projectChatSelectedEngineId,
    projectChatActivityAccordionOpenByDefault,
    projectChatActivityChildrenOpenByDefault,
  } = useAIStore(
    (x) => ({
      apiKeys: x.apiKeys,
      apiKeysInitialLoadComplete: x.apiKeysInitialLoadComplete,
      viewThreads: x.viewThreads,
      projectChatThreadsExplicitlyClosedAtLargeWidth:
        x.projectChatThreadsExplicitlyClosedAtLargeWidth,
      allLLMConfigs: x.allLLMConfigs,
      llmConfigInitialLoadComplete: x.allLLMConfigsInitialLoadComplete,
      externalAgentHealth: x.externalAgentHealth,
      externalAgentHealthInitialLoadComplete:
        x.externalAgentHealthInitialLoadComplete,
      externalAgentConfigs: x.externalAgentConfigs,
      engineConfigs: x.engineConfigs,
      engineConfigsInitialLoadComplete: x.engineConfigsInitialLoadComplete,
      transcriptionProfiles: x.transcriptionProfiles,
      transcriptionProfilesInitialLoadComplete:
        x.transcriptionProfilesInitialLoadComplete,
      projectChatDictationMode: x.projectChatDictationMode,
      projectChatTranscriptionProfileId: x.projectChatTranscriptionProfileId,
      projectChatSelectedEngineId: x.projectChatSelectedEngineId,
      projectChatActivityAccordionOpenByDefault:
        x.projectChatActivityAccordionOpenByDefault,
      projectChatActivityChildrenOpenByDefault:
        x.projectChatActivityChildrenOpenByDefault,
    }),
    _.isEqual,
  );
  const overviewPaneWidth = useLocalStorage((state) => state.overviewWidth);
  const { threadAssignments, threadGroups } = useLocalStorage(
    (state) => ({
      threadAssignments:
        state.projectChatThreadAssignmentsByProjectConfigId[projectConfigId] ??
        {},
      threadGroups:
        state.projectChatThreadGroupsByProjectConfigId[projectConfigId] ?? [],
    }),
    _.isEqual,
  );
  const [inlineThreadsWidth, setInlineThreadsWidth] = useState(() => {
    if (typeof window === "undefined") {
      return INLINE_THREADS_DEFAULT_WIDTH_PX;
    }
    const stored = Number(
      window.localStorage.getItem(INLINE_THREADS_WIDTH_STORAGE_KEY),
    );
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
  const [selectedThreadGroupId, setSelectedThreadGroupId] = useState<
    string | null
  >(null);
  const [inlineThreadsHeaderPortalTarget, setInlineThreadsHeaderPortalTarget] =
    useState<HTMLDivElement | null>(null);
  const [viewSkillsMcpViewer, setViewSkillsMcpViewer] = useState(false);
  const notifiedExternalEngineIssueRef = useRef<string | null>(null);
  const inlineThreadsHeaderShellRef = useRef<HTMLDivElement | null>(null);
  const inlineThreadsResizableColumnRef = useRef<HTMLDivElement | null>(null);
  const hasInitializedInlineThreadsResizeSyncRef = useRef(false);
  const previousLargeEnoughForInlineThreadsRef = useRef(
    overviewPaneWidth >= INLINE_THREADS_BREAKPOINT_PX,
  );

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
  const transcriptionProfileGroups = useMemo<AllItemsType<string>>(
    () => [
      {
        group: "Transcription Profiles",
        items: transcriptionProfiles.map((profile) => ({
          id: profile.id,
          name: profile.name || profile.id,
        })),
      },
    ],
    [transcriptionProfiles],
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
  const selectedTranscriptionProfile = useMemo(() => {
    if (!projectChatTranscriptionProfileId) {
      return null;
    }
    return (
      transcriptionProfiles.find(
        (profile) => profile.id === projectChatTranscriptionProfileId,
      ) ?? null
    );
  }, [projectChatTranscriptionProfileId, transcriptionProfiles]);
  const { providerDictationAvailable, providerDictationUnavailableReason } =
    useMemo(
      () =>
        resolveProviderDictationAvailability({
          selectedTranscriptionProfile,
          allLLMConfigs,
          apiKeys,
        }),
      [allLLMConfigs, apiKeys, selectedTranscriptionProfile],
    );
  const defaultLLMConfigId = allLLMConfigs?.default_config_id ?? null;
  const providerDictationLikelySupported = providerDictationAvailable;
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
  const historyCompatibility = useMemo<ChatHistoryCompatibility | null>(() => {
    if (!projectHistoryRunType) {
      return null;
    }
    return {
      runType: projectHistoryRunType,
      engineConfigId: effectiveEngineId,
    };
  }, [effectiveEngineId, projectHistoryRunType]);
  const chatHistoryEntries = useMemo(
    () =>
      buildChatHistoryEntries(agentRuns, {
        unscopedOnly: true,
        compatibility: historyCompatibility,
      }),
    [agentRuns, historyCompatibility],
  );
  const chatHistoryEntriesById = useMemo(() => {
    const entriesById = new Map<string, (typeof chatHistoryEntries)[number]>();
    for (const entry of chatHistoryEntries) {
      entriesById.set(entry.chatId, entry);
    }
    return entriesById;
  }, [chatHistoryEntries]);
  const chatEngineConfigByChatId = useMemo(() => {
    const entries = buildChatHistoryEntries(agentRuns, {
      unscopedOnly: true,
      compatibility: null,
    });
    const nextByChatId = new Map<string, string | null>();
    for (const entry of entries) {
      nextByChatId.set(entry.chatId, entry.engineConfigId);
    }
    return nextByChatId;
  }, [agentRuns]);
  const availableEngineConfigIds = useMemo(
    () => new Set(engineConfigs.map((config) => config.id)),
    [engineConfigs],
  );
  const draftThreadHint = useMemo(() => {
    if (draftThreadState.phase === "none") {
      return null;
    }
    if (draftThreadState.phase === "awaiting_title") {
      return {
        chatId: draftThreadState.chatId,
        groupId: draftThreadTargetGroupId,
      };
    }
    return { chatId: null, groupId: draftThreadTargetGroupId };
  }, [draftThreadState, draftThreadTargetGroupId]);

  useEffect(() => {
    setDraftThreadState((current) => {
      if (current.phase === "none") {
        return current;
      }
      if (current.phase === "idle") {
        if (typeof chatId === "string") {
          return { phase: "none" };
        }
        return current;
      }
      if (current.phase === "pending_chat_id") {
        if (typeof chatId === "string") {
          return { phase: "awaiting_title", chatId };
        }
        if (chatId === undefined) {
          return { phase: "idle" };
        }
        return current;
      }
      if (typeof chatId === "string" && chatId !== current.chatId) {
        return { phase: "none" };
      }
      const historyEntry = chatHistoryEntriesById.get(current.chatId);
      if (historyEntry && historyEntry.nameSource !== null) {
        return { phase: "none" };
      }
      return current;
    });
  }, [chatHistoryEntriesById, chatId]);
  useEffect(() => {
    if (draftThreadState.phase !== "none") {
      return;
    }
    if (draftThreadTargetGroupId === null) {
      return;
    }
    setDraftThreadTargetGroupId(null);
  }, [draftThreadState.phase, draftThreadTargetGroupId]);

  useEffect(() => {
    if (typeof chatId !== "string" || chatId.trim() === "") {
      return;
    }
    setSelectedThreadGroupId(threadAssignments[chatId] ?? null);
  }, [chatId, threadAssignments]);
  useEffect(() => {
    const nextEngineConfigId = resolveProjectChatEngineConfigIdForSelectedChat({
      chatId,
      selectedEngineId,
      availableEngineConfigIds,
      chatEngineConfigByChatId,
    });
    if (!nextEngineConfigId) {
      return;
    }
    setSelectedEngineId(nextEngineConfigId);
  }, [
    availableEngineConfigIds,
    chatEngineConfigByChatId,
    chatId,
    selectedEngineId,
    setSelectedEngineId,
  ]);

  useEffect(() => {
    if (selectedThreadGroupId === null) {
      return;
    }
    const exists = threadGroups.some(
      (group) => group.id === selectedThreadGroupId,
    );
    if (!exists) {
      setSelectedThreadGroupId(null);
    }
  }, [selectedThreadGroupId, threadGroups]);

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
      setDraftThreadState({ phase: "none" });
      setDraftThreadTargetGroupId(null);
      setSelectedThreadGroupId(null);
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
  const handleTranscriptionProfileChange = useCallback(
    (value: string | null) => {
      useAIStore.setState({ projectChatTranscriptionProfileId: value });
    },
    [],
  );
  const handleDictationModeChange = useCallback(
    (value: ProjectDictationMode) => {
      useAIStore.setState({ projectChatDictationMode: value });
    },
    [],
  );
  const handleActivityAccordionOpenByDefaultChange = useCallback(
    (value: boolean) => {
      useAIStore.setState({
        projectChatActivityAccordionOpenByDefault: value,
      });
    },
    [],
  );
  const handleActivityChildrenOpenByDefaultChange = useCallback(
    (value: boolean) => {
      useAIStore.setState({
        projectChatActivityChildrenOpenByDefault: value,
      });
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
    if (!transcriptionProfilesInitialLoadComplete) {
      return;
    }
    if (!projectChatTranscriptionProfileId) {
      return;
    }
    const selectedProfile = transcriptionProfiles.find(
      (profile) => profile.id === projectChatTranscriptionProfileId,
    );
    if (!selectedProfile) {
      useAIStore.setState({ projectChatTranscriptionProfileId: null });
    }
  }, [
    projectChatTranscriptionProfileId,
    transcriptionProfiles,
    transcriptionProfilesInitialLoadComplete,
  ]);
  useEffect(() => {
    if (projectChatDictationMode !== "provider") {
      return;
    }
    if (providerDictationAvailable) {
      return;
    }
    useAIStore.setState({ projectChatDictationMode: "auto" });
  }, [projectChatDictationMode, providerDictationAvailable]);
  useEffect(() => {
    setRuntimePermissionMode(getDefaultProjectChatPermissionMode(engineType));
  }, [engineType]);

  useEffect(() => {
    const isLargeEnoughForInlineThreads =
      overviewPaneWidth >= INLINE_THREADS_BREAKPOINT_PX;
    const nextVisibility = resolveProjectChatThreadVisibilityFromResize({
      isInitialRun: !hasInitializedInlineThreadsResizeSyncRef.current,
      wasLargeEnoughForInlineThreads:
        previousLargeEnoughForInlineThreadsRef.current,
      isLargeEnoughForInlineThreads,
      viewThreads,
      explicitlyClosedAtLargeWidth:
        projectChatThreadsExplicitlyClosedAtLargeWidth,
    });
    previousLargeEnoughForInlineThreadsRef.current =
      isLargeEnoughForInlineThreads;
    hasInitializedInlineThreadsResizeSyncRef.current = true;
    if (nextVisibility === null || nextVisibility === viewThreads) {
      return;
    }
    useAIStore.setState({ viewThreads: nextVisibility });
  }, [
    overviewPaneWidth,
    projectChatThreadsExplicitlyClosedAtLargeWidth,
    viewThreads,
  ]);

  const showInlineThreads =
    viewThreads && overviewPaneWidth >= INLINE_THREADS_BREAKPOINT_PX;
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
  const syncInlineThreadsHeaderWidth = useCallback((nextWidth: number) => {
    const inlineThreadsHeaderShellNode = inlineThreadsHeaderShellRef.current;
    if (!inlineThreadsHeaderShellNode) {
      return;
    }
    inlineThreadsHeaderShellNode.style.width = `${Math.max(
      0,
      Math.round(nextWidth),
    )}px`;
  }, []);
  useEffect(() => {
    if (!showInlineThreads) {
      return;
    }
    syncInlineThreadsHeaderWidth(resolvedInlineThreadsWidth);
  }, [
    resolvedInlineThreadsWidth,
    showInlineThreads,
    syncInlineThreadsHeaderWidth,
  ]);
  useEffect(() => {
    if (!showInlineThreads || typeof ResizeObserver === "undefined") {
      return;
    }
    const inlineThreadsResizableColumnNode =
      inlineThreadsResizableColumnRef.current;
    if (!inlineThreadsResizableColumnNode) {
      return;
    }
    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      syncInlineThreadsHeaderWidth(entry.contentRect.width);
    });
    resizeObserver.observe(inlineThreadsResizableColumnNode);
    return () => {
      resizeObserver.disconnect();
    };
  }, [showInlineThreads, syncInlineThreadsHeaderWidth]);
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(
      INLINE_THREADS_WIDTH_STORAGE_KEY,
      String(inlineThreadsWidth),
    );
  }, [inlineThreadsWidth]);

  const showThreadsOnlyView =
    viewThreads && !showInlineThreads && !viewSkillsMcpViewer;
  const isAuxView = viewSkillsMcpViewer || showThreadsOnlyView;
  const showConversationFilter = !isAuxView;
  const normalizedConversationSearchTerms = useMemo(
    () => tokenizeConversationSearchQuery(conversationFilterText),
    [conversationFilterText],
  );
  const hasConversationSearchTerms =
    normalizedConversationSearchTerms.length > 0;
  const conversationSearchMatchMessageIds = useMemo(() => {
    if (!hasConversationSearchTerms) {
      return [];
    }
    return activeConversationMessages
      .filter(
        (message) =>
          message.role !== ChatRoleEnum.tool &&
          matchesConversationSearchText(
            buildSearchableTextForMessage(message),
            normalizedConversationSearchTerms,
          ),
      )
      .map((message) => message.id);
  }, [
    activeConversationMessages,
    hasConversationSearchTerms,
    normalizedConversationSearchTerms,
  ]);
  const conversationSearchMatchCount = conversationSearchMatchMessageIds.length;
  const conversationSearchQueryKey = useMemo(
    () => normalizedConversationSearchTerms.join("\u0000"),
    [normalizedConversationSearchTerms],
  );
  useEffect(() => {
    if (!hasConversationSearchTerms || conversationSearchMatchCount === 0) {
      setConversationSearchMatchIndex(null);
      return;
    }
    setConversationSearchMatchIndex(0);
  }, [
    conversationSearchMatchCount,
    conversationSearchQueryKey,
    hasConversationSearchTerms,
  ]);
  useEffect(() => {
    if (conversationSearchMatchCount === 0) {
      setConversationSearchMatchIndex(null);
      return;
    }
    setConversationSearchMatchIndex((current) => {
      if (current === null) {
        return 0;
      }
      if (current >= conversationSearchMatchCount) {
        return conversationSearchMatchCount - 1;
      }
      return current;
    });
  }, [conversationSearchMatchCount]);
  const activeConversationSearchMatchMessageId = useMemo(() => {
    if (conversationSearchMatchIndex === null) {
      return null;
    }
    return (
      conversationSearchMatchMessageIds[conversationSearchMatchIndex] ?? null
    );
  }, [conversationSearchMatchIndex, conversationSearchMatchMessageIds]);
  const conversationSearchCounterText =
    conversationSearchMatchCount > 0 && conversationSearchMatchIndex !== null
      ? `${conversationSearchMatchIndex + 1}/${conversationSearchMatchCount}`
      : `0/${conversationSearchMatchCount}`;
  const handleStepConversationSearch = useCallback(
    (direction: "previous" | "next") => {
      if (conversationSearchMatchCount === 0) {
        return;
      }
      setConversationSearchMatchIndex((current) => {
        const baseIndex = current ?? 0;
        if (direction === "next") {
          return (baseIndex + 1) % conversationSearchMatchCount;
        }
        return (
          (baseIndex - 1 + conversationSearchMatchCount) %
          conversationSearchMatchCount
        );
      });
    },
    [conversationSearchMatchCount],
  );
  const showReturnOnlyNav = viewSkillsMcpViewer || showThreadsOnlyView;
  const handleReturnToChat = useCallback(() => {
    if (viewSkillsMcpViewer) {
      setViewSkillsMcpViewer(false);
      return;
    }
    useAIStore.setState({ viewThreads: false });
  }, [viewSkillsMcpViewer]);
  const handleToggleThreads = useCallback(() => {
    setViewSkillsMcpViewer(false);
    const isLargeEnoughForInlineThreads =
      overviewPaneWidth >= INLINE_THREADS_BREAKPOINT_PX;
    useAIStore.setState((state) => {
      const nextViewThreads = !state.viewThreads;
      if (!isLargeEnoughForInlineThreads) {
        return { viewThreads: nextViewThreads };
      }
      return {
        viewThreads: nextViewThreads,
        projectChatThreadsExplicitlyClosedAtLargeWidth: !nextViewThreads,
      };
    });
  }, [overviewPaneWidth]);
  const handleNewChatClick = useCallback(() => {
    setChatId(undefined);
    setDraftThreadState({ phase: "idle" });
    setDraftThreadTargetGroupId(selectedThreadGroupId);
    if (!showInlineThreads) {
      useAIStore.setState({
        viewThreads: false,
      });
    }
    setViewSkillsMcpViewer(false);
  }, [selectedThreadGroupId, setChatId, showInlineThreads]);
  const handleNewChatInThreadGroup = useCallback(
    (groupId: string) => {
      setChatId(undefined);
      setDraftThreadState({ phase: "idle" });
      setDraftThreadTargetGroupId(groupId);
      setSelectedThreadGroupId(groupId);
      if (!showInlineThreads) {
        useAIStore.setState({
          viewThreads: false,
        });
      }
      setViewSkillsMcpViewer(false);
    },
    [setChatId, showInlineThreads],
  );
  const returnToChatTooltipHandlers = useMemo(
    () =>
      getFloatingBoxHandlers({
        title: "Return to chat",
        content: viewSkillsMcpViewer
          ? "Leave Skills/MCP and reopen chat."
          : "Close threads-only view and reopen chat.",
      }),
    [viewSkillsMcpViewer],
  );
  const newChatTooltipHandlers = useMemo(
    () =>
      getFloatingBoxHandlers({
        title: "New chat",
        content: "Start a new conversation in the selected group.",
      }),
    [],
  );
  const threadsTooltipHandlers = useMemo(() => {
    const showingInlineThreads = viewThreads && showInlineThreads;
    return getFloatingBoxHandlers({
      title: showingInlineThreads ? "Hide threads" : "Threads",
      content: showingInlineThreads
        ? "Collapse the threads list."
        : "Open the threads list.",
    });
  }, [showInlineThreads, viewThreads]);
  const handleDraftThreadStart = useCallback(() => {
    setDraftThreadState((current) => {
      if (current.phase === "none") {
        return current;
      }
      return { phase: "pending_chat_id" };
    });
  }, []);
  const handleInlineThreadsHeaderHostRef = useCallback(
    (node: HTMLDivElement | null) => {
      setInlineThreadsHeaderPortalTarget(node);
    },
    [],
  );
  const handleInlineThreadsHeaderShellRef = useCallback(
    (node: HTMLDivElement | null) => {
      inlineThreadsHeaderShellRef.current = node;
      if (!node) {
        return;
      }
      node.style.width = `${Math.round(resolvedInlineThreadsWidth)}px`;
    },
    [resolvedInlineThreadsWidth],
  );
  const handleInlineThreadsResizableColumnRef = useCallback(
    (node: HTMLDivElement | null) => {
      inlineThreadsResizableColumnRef.current = node;
    },
    [],
  );
  const handleDraftThreadSettled = useCallback(
    (nextChatId: string | null, succeeded: boolean) => {
      if (succeeded && nextChatId && draftThreadTargetGroupId) {
        setProjectChatThreadGroupAssignment(
          projectConfigId,
          nextChatId,
          draftThreadTargetGroupId,
        );
      }
      setDraftThreadState((current) => {
        if (current.phase === "none") {
          return current;
        }
        if (!succeeded || !nextChatId) {
          return { phase: "idle" };
        }
        return { phase: "awaiting_title", chatId: nextChatId };
      });
    },
    [draftThreadTargetGroupId, projectConfigId],
  );
  useEffect(() => {
    setConversationFilterText("");
  }, [chatId]);

  return (
    apiKeysInitialLoadComplete &&
    llmConfigInitialLoadComplete &&
    engineConfigsInitialLoadComplete && (
      <div className="flex h-full min-h-0 flex-col @container">
        <nav className="flex flex-col border-b border-setta-100 pb-2 dark:border-setta-800 [&_button]:cursor-pointer">
          <div className="flex w-full min-w-0 items-stretch">
            {showInlineThreads ? (
              <div
                ref={handleInlineThreadsHeaderShellRef}
                className="shrink-0 border-r border-setta-200 dark:border-setta-800"
                style={{ width: `${resolvedInlineThreadsWidth}px` }}
              >
                <div
                  ref={handleInlineThreadsHeaderHostRef}
                  className="h-full w-full min-w-0"
                  data-testid="project-chat-inline-threads-header-host"
                />
              </div>
            ) : null}
            <div
              className={`min-w-0 flex-1 @container ${showInlineThreads ? "pl-2" : ""}`}
            >
              <div className={PROJECT_CHAT_CONTENT_SHELL_CLASS}>
                <div className="mt-2 grid w-full min-w-0 items-center gap-2 [grid-template-columns:auto_auto] @[44rem]:[grid-template-columns:auto_minmax(0,1fr)_auto]">
                  <div className="flex min-w-0 items-center gap-2">
                    {showReturnOnlyNav ? (
                      <button
                        className="nodrag relative inline-flex h-full cursor-pointer select-none items-center gap-1 rounded-md bg-transparent px-1 text-xs font-semibold text-setta-600 transition-colors hover:text-setta-900 focus-visible:ring-2 active:!bg-blue-100 dark:text-setta-300 dark:hover:bg-transparent dark:hover:text-white active:dark:!bg-transparent"
                        onClick={handleReturnToChat}
                        aria-label="Return to chat"
                        {...returnToChatTooltipHandlers}
                      >
                        <IoMdArrowRoundBack />
                        <span className="hidden @[31.25rem]:block">
                          Return to chat
                        </span>
                      </button>
                    ) : (
                      <>
                        <button
                          className="nodrag relative inline-flex h-full cursor-pointer select-none items-center gap-1 rounded-md bg-transparent px-1 text-xs font-semibold text-setta-600 transition-colors hover:text-setta-900 focus-visible:ring-2 active:!bg-blue-100 dark:text-setta-300 dark:hover:bg-transparent dark:hover:text-white active:dark:!bg-transparent"
                          aria-label="New Chat"
                          onClick={handleNewChatClick}
                          {...newChatTooltipHandlers}
                        >
                          <MdAdd size={15} />
                          <span className="hidden @[31.25rem]:block">New</span>
                        </button>
                        <button
                          className="nodrag relative inline-flex h-full cursor-pointer select-none items-center gap-1 rounded-md bg-transparent px-1 text-xs font-semibold text-setta-600 transition-colors hover:text-setta-900 focus-visible:ring-2 active:!bg-blue-100 dark:text-setta-300 dark:hover:bg-transparent dark:hover:text-white active:dark:!bg-transparent"
                          onClick={handleToggleThreads}
                          aria-label="View Threads"
                          {...threadsTooltipHandlers}
                        >
                          {viewThreads && showInlineThreads ? (
                            <>
                              <RiChatHistoryLine size={15} />
                              <span className="hidden @[31.25rem]:block">
                                Hide Threads
                              </span>
                            </>
                          ) : (
                            <>
                              <RiChatHistoryLine size={15} />
                              <span className="hidden @[31.25rem]:block">
                                Threads
                              </span>
                            </>
                          )}
                        </button>
                      </>
                    )}
                  </div>
                  {!isAuxView ? (
                    <div className="flex items-center justify-self-end @[44rem]:col-start-3">
                      {showPlanModeBadge ? <PlanModeBadge /> : null}
                      <ProjectAISettingsPopover
                        engineGroups={engineGroups}
                        transcriptionProfileGroups={transcriptionProfileGroups}
                        availableConfigGroups={availableConfigGroups}
                        selectedEngineId={effectiveEngineId}
                        selectedLLMConfigId={selectedLLMConfigId}
                        selectedTranscriptionProfileId={
                          projectChatTranscriptionProfileId
                        }
                        defaultLLMConfigId={defaultLLMConfigId}
                        engineType={engineType}
                        noConfigsAvailable={noConfigsAvailable}
                        dictationMode={projectChatDictationMode}
                        activityAccordionOpenByDefault={
                          projectChatActivityAccordionOpenByDefault
                        }
                        activityChildrenOpenByDefault={
                          projectChatActivityChildrenOpenByDefault
                        }
                        providerDictationLikelySupported={
                          providerDictationLikelySupported
                        }
                        providerDictationUnavailableReason={
                          providerDictationUnavailableReason
                        }
                        onOpenSkillsMcpViewer={() => {
                          setViewSkillsMcpViewer(true);
                        }}
                        onEngineChange={handleEngineChange}
                        onLLMConfigChange={handleLLMConfigChange}
                        onTranscriptionProfileChange={
                          handleTranscriptionProfileChange
                        }
                        onPinDefaultModel={handlePinDefaultModel}
                        onDictationModeChange={handleDictationModeChange}
                        onActivityAccordionOpenByDefaultChange={
                          handleActivityAccordionOpenByDefaultChange
                        }
                        onActivityChildrenOpenByDefaultChange={
                          handleActivityChildrenOpenByDefaultChange
                        }
                      />
                    </div>
                  ) : null}
                  {showConversationFilter ? (
                    <search
                      className="nodrag relative col-span-2 row-start-2 flex min-w-0 items-center @[44rem]:col-span-1 @[44rem]:col-start-2 @[44rem]:row-start-1 @[44rem]:min-w-[11rem]"
                      data-testid="project-chat-conversation-filter"
                    >
                      <span className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 pl-1">
                        <i className="gg-sort-az !scale-[0.68] text-setta-300 dark:text-setta-600" />
                      </span>
                      <input
                        type="text"
                        aria-label="Search in conversation"
                        data-testid="project-chat-conversation-filter-input"
                        value={conversationFilterText}
                        onChange={(event) => {
                          setConversationFilterText(event.target.value);
                        }}
                        onKeyDown={(event) => {
                          if (event.key !== "Escape") {
                            return;
                          }
                          event.currentTarget.blur();
                        }}
                        placeholder="Search in conversation"
                        className={`w-full min-w-0 flex-1 cursor-text truncate border-solid border-transparent bg-transparent py-1 pl-5 text-xs text-setta-700 placeholder-setta-400 outline-0 [border-width:0_0_1px_0] focus-visible:border-blue-300 dark:text-setta-300 dark:placeholder-setta-600 ${
                          hasConversationSearchTerms ? "pr-16" : "pr-2"
                        }`}
                      />
                      {hasConversationSearchTerms ? (
                        <div className="absolute right-0.5 top-1/2 inline-flex -translate-y-1/2 items-center gap-0.5">
                          <span className="min-w-[34px] px-0.5 text-center text-[10px] text-setta-400 dark:text-setta-500">
                            {conversationSearchCounterText}
                          </span>
                          <button
                            type="button"
                            aria-label="Previous conversation match"
                            className="inline-flex h-4 w-4 items-center justify-center rounded-sm text-[10px] text-setta-500 transition-colors hover:bg-setta-100 hover:text-setta-700 disabled:cursor-not-allowed disabled:opacity-30 dark:text-setta-300 dark:hover:bg-setta-800 dark:hover:text-setta-100"
                            onClick={() =>
                              handleStepConversationSearch("previous")
                            }
                            disabled={conversationSearchMatchCount === 0}
                          >
                            <MdChevronLeft />
                          </button>
                          <button
                            type="button"
                            aria-label="Next conversation match"
                            className="inline-flex h-4 w-4 items-center justify-center rounded-sm text-[10px] text-setta-500 transition-colors hover:bg-setta-100 hover:text-setta-700 disabled:cursor-not-allowed disabled:opacity-30 dark:text-setta-300 dark:hover:bg-setta-800 dark:hover:text-setta-100"
                            onClick={() => handleStepConversationSearch("next")}
                            disabled={conversationSearchMatchCount === 0}
                          >
                            <MdChevronRight />
                          </button>
                        </div>
                      ) : null}
                    </search>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </nav>

        {showInlineThreads ? (
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
                syncInlineThreadsHeaderWidth(elementRef.offsetWidth);
              }}
              onResizeStop={(_event, _direction, elementRef) => {
                syncInlineThreadsHeaderWidth(elementRef.offsetWidth);
                updateInlineThreadsWidth(elementRef.offsetWidth);
              }}
            >
              <div
                ref={handleInlineThreadsResizableColumnRef}
                className="h-full min-h-0"
              >
                <ProjectChatHistory
                  chatId={chatId}
                  setChatId={setChatId}
                  runType={projectHistoryRunType}
                  engineConfigId={effectiveEngineId}
                  inline={true}
                  closeOnSelect={false}
                  draftThread={draftThreadHint}
                  selectedGroupId={selectedThreadGroupId}
                  onSelectedGroupChange={setSelectedThreadGroupId}
                  onStartNewThreadInGroup={handleNewChatInThreadGroup}
                  headerPortalTarget={inlineThreadsHeaderPortalTarget}
                />
              </div>
            </Resizable>
            <div className="flex min-h-0 min-w-0 flex-1 flex-col pl-2">
              {viewSkillsMcpViewer ? (
                <div
                  className={`${PROJECT_CHAT_CONTENT_SHELL_CLASS} flex min-h-0 flex-1 flex-col`}
                  data-chat-width-shell="true"
                >
                  <ProjectChatSkillsMcpViewer
                    chatId={chatId}
                    engineConfigId={effectiveEngineId}
                    engineType={engineType}
                    externalAgentToolType={
                      externalAgentConfig?.toolType ?? null
                    }
                  />
                </div>
              ) : (
                <ProjectChatCore
                  chatId={chatId}
                  placeholderText={placeholderText}
                  conversationFilterText={conversationFilterText}
                  thinking={thinking}
                  engineConfigId={effectiveEngineId}
                  engineType={engineType}
                  hasLLMConfig={hasLLMConfig}
                  externalEngineAvailable={externalEngineAvailable}
                  noLLMConfigsAvailable={noConfigsAvailable}
                  transcriptionProfileId={projectChatTranscriptionProfileId}
                  dictationMode={projectChatDictationMode}
                  providerDictationAvailable={providerDictationAvailable}
                  providerDictationLikelySupported={
                    providerDictationLikelySupported
                  }
                  contextEstimateModel={activeModelForContextEstimate}
                  setChatId={setChatId}
                  onDraftThreadStart={handleDraftThreadStart}
                  onDraftThreadSettled={handleDraftThreadSettled}
                  onThinkingChange={setThinking}
                  onPermissionModeChange={setRuntimePermissionMode}
                  activeConversationSearchMatchMessageId={
                    activeConversationSearchMatchMessageId
                  }
                />
              )}
            </div>
          </div>
        ) : viewSkillsMcpViewer ? (
          <div
            className={`${PROJECT_CHAT_CONTENT_SHELL_CLASS} flex min-h-0 flex-1 flex-col`}
            data-chat-width-shell="true"
          >
            <ProjectChatSkillsMcpViewer
              chatId={chatId}
              engineConfigId={effectiveEngineId}
              engineType={engineType}
              externalAgentToolType={externalAgentConfig?.toolType ?? null}
            />
          </div>
        ) : viewThreads ? (
          <ProjectChatHistory
            chatId={chatId}
            setChatId={setChatId}
            runType={projectHistoryRunType}
            engineConfigId={effectiveEngineId}
            closeOnSelect={true}
            draftThread={draftThreadHint}
            selectedGroupId={selectedThreadGroupId}
            onSelectedGroupChange={setSelectedThreadGroupId}
            onStartNewThreadInGroup={handleNewChatInThreadGroup}
          />
        ) : (
          <>
            <ProjectChatCore
              chatId={chatId}
              placeholderText={placeholderText}
              conversationFilterText={conversationFilterText}
              thinking={thinking}
              engineConfigId={effectiveEngineId}
              engineType={engineType}
              hasLLMConfig={hasLLMConfig}
              externalEngineAvailable={externalEngineAvailable}
              noLLMConfigsAvailable={noConfigsAvailable}
              transcriptionProfileId={projectChatTranscriptionProfileId}
              dictationMode={projectChatDictationMode}
              providerDictationAvailable={providerDictationAvailable}
              providerDictationLikelySupported={
                providerDictationLikelySupported
              }
              contextEstimateModel={activeModelForContextEstimate}
              setChatId={setChatId}
              onDraftThreadStart={handleDraftThreadStart}
              onDraftThreadSettled={handleDraftThreadSettled}
              onThinkingChange={setThinking}
              onPermissionModeChange={setRuntimePermissionMode}
              activeConversationSearchMatchMessageId={
                activeConversationSearchMatchMessageId
              }
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
  transcriptionProfileGroups,
  availableConfigGroups,
  selectedEngineId,
  selectedLLMConfigId,
  selectedTranscriptionProfileId,
  defaultLLMConfigId,
  engineType,
  noConfigsAvailable,
  dictationMode,
  activityAccordionOpenByDefault,
  activityChildrenOpenByDefault,
  providerDictationLikelySupported,
  providerDictationUnavailableReason,
  onOpenSkillsMcpViewer,
  onEngineChange,
  onLLMConfigChange,
  onTranscriptionProfileChange,
  onPinDefaultModel,
  onDictationModeChange,
  onActivityAccordionOpenByDefaultChange,
  onActivityChildrenOpenByDefaultChange,
}: ProjectAISettingsPopoverProps) {
  const showLLMConfig = engineType === EngineTypeEnum.setta_llm;
  const llmPlaceholder = noConfigsAvailable
    ? "Add an LLM config or API key"
    : "Select an LLM";
  const llmBg = selectedLLMConfigId
    ? ""
    : "bg-red-500 hover:bg-red-800 hover:dark:bg-red-900 dark:bg-red-950 !placeholder-white !border-red-500";
  const providerModeAvailable = providerDictationLikelySupported;
  const autoFallsBackToBrowser =
    dictationMode === "auto" && !providerDictationLikelySupported;
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
              : "Always provider (requires transcription profile)",
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
  const handleSettingsPopoverOpenAutoFocus = useCallback((event: Event) => {
    event.preventDefault();
    requestAnimationFrame(() => {
      focusInputWithoutSelectionById(PROJECT_AI_ENGINE_COMBOBOX_INPUT_ID);
    });
  }, []);
  const settingsTooltipHandlers = useMemo(
    () =>
      getFloatingBoxHandlers({
        title: "Project AI settings",
        content: "Configure engine, model, microphone source, and tools.",
      }),
    [],
  );
  const pinDefaultModelTooltipHandlers = useMemo(() => {
    if (selectedModelPinnedAsDefault) {
      return getFloatingBoxHandlers({
        title: "Default model",
        content: "This model is already pinned as default.",
      });
    }
    if (!selectedLLMConfigId) {
      return getFloatingBoxHandlers({
        title: "Default model",
        content: "Select a model before pinning a default.",
      });
    }
    return getFloatingBoxHandlers({
      title: "Default model",
      content: "Pin the selected model as the default for new chats.",
    });
  }, [selectedLLMConfigId, selectedModelPinnedAsDefault]);
  const openSkillsMcpTooltipHandlers = useMemo(
    () =>
      getFloatingBoxHandlers({
        title: "Open Skills/MCP",
        content: "Open the Skills and MCP browser.",
      }),
    [],
  );

  return (
    <StandardPopover
      trigger={
        <button
          className="nodrag relative inline-flex h-full cursor-pointer select-none items-center gap-1 rounded-md bg-transparent px-1 text-xs font-semibold text-setta-600 transition-colors hover:text-setta-900 focus-visible:ring-2 active:!bg-blue-100 dark:text-setta-300 dark:hover:bg-transparent dark:hover:text-white active:dark:!bg-transparent"
          aria-label="Project AI Settings"
          type="button"
          {...settingsTooltipHandlers}
        >
          <IoSettingsOutline size={15} />
          <span className="hidden @[31.25rem]:block">Settings</span>
        </button>
      }
      contentClasses="z-50 w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-setta-200/80 bg-white/95 p-3 shadow-xl backdrop-blur relative overflow-visible dark:border-setta-700/70 dark:bg-setta-900/95 data-[state=open]:animate-fade-in"
      arrowClasses="fill-white/95 stroke-[1px] stroke-setta-200/80 dark:fill-setta-900/95 dark:stroke-setta-700/70"
      contentProps={{ onOpenAutoFocus: handleSettingsPopoverOpenAutoFocus }}
    >
      <div className="flex flex-col gap-2 [&_button:disabled]:cursor-not-allowed [&_button]:cursor-pointer">
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
              inputDivId={PROJECT_AI_ENGINE_COMBOBOX_INPUT_ID}
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold text-setta-500 dark:text-setta-400">
              Transcription Profile
            </span>
            <IdNameCombobox
              allItems={transcriptionProfileGroups}
              value={selectedTranscriptionProfileId}
              small={false}
              onSelectedItemChange={onTranscriptionProfileChange}
              placeholder="Select a transcription profile"
              outerDivClasses="w-full"
              selectedItemCanBeNull
            />
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
              Provider mode uses the selected transcription profile.
            </p>
            {!providerModeAvailable ? (
              <p className="text-[10px] text-amber-700 dark:text-amber-300">
                {providerDictationUnavailableReason}
              </p>
            ) : null}
            {autoFallsBackToBrowser ? (
              <p className="text-[10px] text-amber-700 dark:text-amber-300">
                Auto currently prefers browser/OS because provider dictation is
                unavailable.
              </p>
            ) : null}
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
                {...pinDefaultModelTooltipHandlers}
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
            <div className="grid w-full min-w-0 grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onOpenSkillsMcpViewer}
                className="box-border h-8 w-full min-w-0 rounded-md border border-setta-200 bg-white px-2 text-center text-[11px] font-semibold text-setta-600 transition-colors hover:bg-setta-50 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-200 dark:hover:bg-setta-800/70"
                {...openSkillsMcpTooltipHandlers}
              >
                Open Skills/MCP
              </button>
              <Menubar.Root className="w-full min-w-0">
                <FollowAIToggleButton
                  labelMode="always"
                  triggerClassName="nodrag relative inline-flex box-border h-8 w-full min-w-0 select-none items-center justify-center gap-1 rounded-md border border-setta-200 bg-white px-2 text-[11px] font-semibold transition-colors hover:bg-setta-50 focus-visible:ring-2 dark:border-setta-700 dark:bg-setta-900 dark:hover:bg-setta-800/70"
                />
              </Menubar.Root>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold text-setta-500 dark:text-setta-400">
              Activity
            </span>
            <label className="flex w-full items-center justify-between gap-2 rounded-md border border-setta-200 bg-white px-2 py-1.5 text-[11px] text-setta-600 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-200">
              <span>Open activity accordions by default</span>
              <SwitchInput
                value={activityAccordionOpenByDefault}
                onChange={onActivityAccordionOpenByDefaultChange}
              />
            </label>
            <label className="flex w-full items-center justify-between gap-2 rounded-md border border-setta-200 bg-white px-2 py-1.5 text-[11px] text-setta-600 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-200">
              <span>Open child accordions by default</span>
              <SwitchInput
                value={activityChildrenOpenByDefault}
                onChange={onActivityChildrenOpenByDefaultChange}
              />
            </label>
          </div>
        </div>
      </div>
    </StandardPopover>
  );
}
