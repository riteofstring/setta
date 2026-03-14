import * as Menubar from "@radix-ui/react-menubar";
import { FollowAIToggleButton } from "components/AppHeader/FollowAIToggleButton";
import { type ChatPermissionModeValue } from "components/Chat/chatComposerControls";
import { resolveProviderDictationAvailability } from "components/Chat/dictationMode";
import { getProjectDictationModeOptionLabel } from "components/Chat/dictationPolicy";
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
import { buildOverviewProjectChatSurfaceId } from "components/ChatWindowing/projectChatSurfaceIds";
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
import {
  MdAdd,
  MdChevronLeft,
  MdChevronRight,
  MdOutlineSmartToy,
} from "react-icons/md";
import { RiChatHistoryLine } from "react-icons/ri";
import {
  getRunInputString,
  getRunLastUpdatedMs,
} from "state/actions/agentRunUtils";
import {
  saveLLMConfig,
  seedPendingChatDetails,
  updateEngineConfig,
} from "state/actions/ai";
import {
  buildChatHistoryEntries,
  buildChatProvenanceByChatId,
  resolveScopedChatProvenanceForChatId,
  type ChatHistoryCompatibility,
} from "state/actions/chatHistory";
import { addPersistentNotification } from "state/actions/notifications";
import { setProjectChatThreadGroupAssignment } from "state/actions/projectChatThreads";
import {
  useAIStore,
  useLocalStorage,
  useProjectState,
  type ProjectChatAuxView,
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
  ExternalAgentPreflightStatus,
  SettaNotificationTypeEnum,
} from "utils/generatedTypes";
import { getSafeLocalStorageAdapter } from "utils/safeLocalStorage";
import { clamp } from "utils/utils";
import { ProjectAISettings } from "./ProjectAISettings";
import {
  getDefaultProjectChatPermissionMode,
  ProjectChatCore,
  type ProjectChatBlockedErrorCode,
} from "./ProjectChatCore";
import {
  focusInputWithoutSelectionById,
  PROJECT_AI_ENGINE_COMBOBOX_INPUT_ID,
} from "./projectChatFocusUtils";
import { ProjectChatHistory } from "./ProjectChatHistory";
import { resolveProjectChatHydrationAuthority } from "./projectChatHydrationAuthority";
import { ProjectChatSkillsMcpViewer } from "./ProjectChatSkillsMcpViewer";
import { useHydrateAgenticState } from "./useHydrateAgenticState";
import { useHydrateLLMState } from "./useHydrateLLMState";

export { resolveProjectChatThreadBlockedErrorCodeForSelectedChat } from "./projectChatHydrationAuthority";

type ProjectAISettingsPopoverProps = {
  engineGroups: ReturnType<typeof buildEngineGroups>;
  transcriptionProfileGroups: AllItemsType<string>;
  availableConfigGroups: ReturnType<typeof buildLLMConfigGroups>;
  selectedEngineId: string | null;
  selectedLLMConfigId: string | null;
  llmSelectionUnavailableReason: string | null;
  selectedTranscriptionProfileId: string | null;
  defaultLLMConfigId: string | null;
  engineType: EngineTypeEnum | null;
  noConfigsAvailable: boolean;
  dictationMode: ProjectDictationMode;
  activityAccordionOpenByDefault: boolean;
  activityChildrenOpenByDefault: boolean;
  providerDictationLikelySupported: boolean;
  providerDictationUnavailableReason: string;
  onOpenSkillsView: () => void;
  onOpenMcpView: () => void;
  onOpenSlashCommandsView: () => void;
  onOpenProjectSettingsView: () => void;
  onEngineChange: (value: string | null) => void;
  onLLMConfigChange: (value: string | null) => void;
  onTranscriptionProfileChange: (value: string | null) => void;
  onPinDefaultModel: () => void;
  onDictationModeChange: (value: ProjectDictationMode) => void;
  onActivityAccordionOpenByDefaultChange: (value: boolean) => void;
  onActivityChildrenOpenByDefaultChange: (value: boolean) => void;
};

type ProjectDictationMode = "auto" | "browser" | "provider";
type ProjectChatAuxTabId = Exclude<ProjectChatAuxView, "none">;
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

type ResolveProjectChatSelectedEngineIdAfterEngineConfigsLoadInput = {
  engineConfigsInitialLoadComplete: boolean;
  engineConfigs: EngineConfig[];
  selectedEngineId: string | null;
  preferredEngineId: string | null;
};

type ResolveProjectChatSelectedLLMUnavailableReasonInput = {
  engineType: EngineTypeEnum | null;
  selectedLLMConfigId: string | null;
  allLLMConfigs: AllLLMConfigs | null;
  availableConfigIds: Set<string>;
};

type ProjectChatEngineSwitchContinuation = {
  sourceChatId: string;
  sourceEngineConfigId: string;
  targetEngineConfigId: string | null;
};

type ResolveProjectChatEngineSwitchContinuationOnEngineChangeInput = {
  chatId: string | null | undefined;
  nextEngineId: string | null;
  chatEngineConfigByChatId: Map<string, string | null>;
};

type ResolveProjectChatEngineSwitchContinuationAfterContextChangeInput = {
  continuation: ProjectChatEngineSwitchContinuation | null;
  chatId: string | null | undefined;
  selectedEngineId: string | null;
};

type ShouldProjectChatSkipEngineSyncForContinuationInput = {
  continuation: ProjectChatEngineSwitchContinuation | null;
  chatId: string | null | undefined;
};

type ResolveProjectChatAuxViewByProjectConfigIdUpdateInput = {
  projectChatAuxViewByProjectConfigId: Record<string, ProjectChatAuxView>;
  projectConfigId: string;
  nextAuxView: ProjectChatAuxView;
};

type ResolveProjectChatDraftMessageByProjectConfigIdUpdateInput = {
  draftMessageByProjectConfigId: Record<string, string>;
  projectConfigId: string;
  nextDraftMessage: string;
};

type ProjectChatProps = {
  surfaceId?: string;
  chatId?: string | null | undefined;
  setChatId?: (next: SetStateAction<string | null | undefined>) => void;
  onBlockedErrorCodeChange?: (
    errorCode: ProjectChatBlockedErrorCode | null,
  ) => void;
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

export function resolveProjectChatSelectedEngineIdAfterEngineConfigsLoad({
  engineConfigsInitialLoadComplete,
  engineConfigs,
  selectedEngineId,
  preferredEngineId,
}: ResolveProjectChatSelectedEngineIdAfterEngineConfigsLoadInput):
  | string
  | null {
  if (!engineConfigsInitialLoadComplete) {
    return selectedEngineId;
  }
  if (engineConfigs.length === 0) {
    return null;
  }
  if (
    selectedEngineId &&
    engineConfigs.some((config) => config.id === selectedEngineId)
  ) {
    return selectedEngineId;
  }
  return preferredEngineId ?? engineConfigs[0].id;
}

export function resolveProjectChatSelectedLLMUnavailableReason({
  engineType,
  selectedLLMConfigId,
  allLLMConfigs,
  availableConfigIds,
}: ResolveProjectChatSelectedLLMUnavailableReasonInput): string | null {
  if (engineType !== EngineTypeEnum.setta_llm) {
    return null;
  }
  if (!selectedLLMConfigId) {
    return null;
  }
  if (availableConfigIds.has(selectedLLMConfigId)) {
    return null;
  }
  const selectedConfig = allLLMConfigs?.configs[selectedLLMConfigId];
  if (!selectedConfig) {
    return "Selected model is unavailable.";
  }
  const requiredApiKeyEnv = selectedConfig.api_key_env?.trim() ?? "";
  if (requiredApiKeyEnv) {
    return `Selected model is unavailable. Missing API key: ${requiredApiKeyEnv}.`;
  }
  return "Selected model is unavailable.";
}

export function resolveProjectChatEngineSwitchContinuationOnEngineChange({
  chatId,
  nextEngineId,
  chatEngineConfigByChatId,
}: ResolveProjectChatEngineSwitchContinuationOnEngineChangeInput): ProjectChatEngineSwitchContinuation | null {
  const resolvedChatId = chatId?.trim() ?? "";
  if (!resolvedChatId) {
    return null;
  }
  const sourceEngineConfigId = chatEngineConfigByChatId.get(resolvedChatId);
  if (!sourceEngineConfigId) {
    return null;
  }
  if (sourceEngineConfigId === nextEngineId) {
    return null;
  }
  return {
    sourceChatId: resolvedChatId,
    sourceEngineConfigId,
    targetEngineConfigId: nextEngineId,
  };
}

export function resolveProjectChatEngineSwitchContinuationAfterContextChange({
  continuation,
  chatId,
  selectedEngineId,
}: ResolveProjectChatEngineSwitchContinuationAfterContextChangeInput): ProjectChatEngineSwitchContinuation | null {
  if (!continuation) {
    return null;
  }
  const resolvedChatId = chatId?.trim() ?? "";
  if (resolvedChatId !== continuation.sourceChatId) {
    return null;
  }
  if (selectedEngineId === continuation.sourceEngineConfigId) {
    return null;
  }
  return continuation;
}

export function shouldProjectChatSkipEngineSyncForContinuation({
  continuation,
  chatId,
}: ShouldProjectChatSkipEngineSyncForContinuationInput): boolean {
  if (!continuation) {
    return false;
  }
  const resolvedChatId = chatId?.trim() ?? "";
  return resolvedChatId !== "" && resolvedChatId === continuation.sourceChatId;
}

export function resolveProjectChatAuxViewByProjectConfigIdUpdate({
  projectChatAuxViewByProjectConfigId,
  projectConfigId,
  nextAuxView,
}: ResolveProjectChatAuxViewByProjectConfigIdUpdateInput): Record<
  string,
  ProjectChatAuxView
> | null {
  const currentAuxView =
    projectChatAuxViewByProjectConfigId[projectConfigId] ?? "none";
  if (currentAuxView === nextAuxView) {
    return null;
  }
  const nextByProjectConfigId = {
    ...projectChatAuxViewByProjectConfigId,
  };
  if (nextAuxView === "none") {
    delete nextByProjectConfigId[projectConfigId];
  } else {
    nextByProjectConfigId[projectConfigId] = nextAuxView;
  }
  return nextByProjectConfigId;
}

export function resolveProjectChatDraftMessageByProjectConfigIdUpdate({
  draftMessageByProjectConfigId,
  projectConfigId,
  nextDraftMessage,
}: ResolveProjectChatDraftMessageByProjectConfigIdUpdateInput): Record<
  string,
  string
> | null {
  const currentDraftMessage =
    draftMessageByProjectConfigId[projectConfigId] ?? "";
  if (currentDraftMessage === nextDraftMessage) {
    return null;
  }
  const nextByProjectConfigId = {
    ...draftMessageByProjectConfigId,
  };
  if (nextDraftMessage === "") {
    delete nextByProjectConfigId[projectConfigId];
  } else {
    nextByProjectConfigId[projectConfigId] = nextDraftMessage;
  }
  return nextByProjectConfigId;
}

export function setProjectChatAuxViewForActiveProject(
  nextAuxView: ProjectChatAuxView,
): void {
  useLocalStorage.setState((state) => {
    const activeProjectConfigId = useProjectState.getState().projectConfig.id;
    const nextByProjectConfigId =
      resolveProjectChatAuxViewByProjectConfigIdUpdate({
        projectChatAuxViewByProjectConfigId:
          state.projectChatAuxViewByProjectConfigId,
        projectConfigId: activeProjectConfigId,
        nextAuxView,
      });
    if (!nextByProjectConfigId) {
      return state;
    }
    return {
      projectChatAuxViewByProjectConfigId: nextByProjectConfigId,
    };
  });
}

function setProjectChatThreadVisibility(
  nextVisibility: SetStateAction<boolean>,
): void {
  useAIStore.setState((state) => {
    const resolvedNextVisibility =
      typeof nextVisibility === "function"
        ? nextVisibility(state.viewThreads)
        : nextVisibility;
    if (resolvedNextVisibility === state.viewThreads) {
      return state;
    }
    return {
      viewThreads: resolvedNextVisibility,
    };
  });
}

function setProjectChatThreadsClosedAtLargeWidthPreference(
  nextClosed: boolean,
): void {
  useAIStore.setState((state) => {
    if (state.projectChatThreadsExplicitlyClosedAtLargeWidth === nextClosed) {
      return state;
    }
    return {
      projectChatThreadsExplicitlyClosedAtLargeWidth: nextClosed,
    };
  });
}

export function ProjectChat({
  surfaceId,
  chatId: controlledChatId,
  setChatId: controlledSetChatId,
  onBlockedErrorCodeChange,
}: ProjectChatProps = {}) {
  const projectConfigId = useProjectState((state) => state.projectConfig.id);
  const resolvedSurfaceId =
    surfaceId ?? buildOverviewProjectChatSurfaceId(projectConfigId);
  return (
    <ProjectChatSurface
      key={resolvedSurfaceId}
      resolvedSurfaceId={resolvedSurfaceId}
      controlledChatId={controlledChatId}
      controlledSetChatId={controlledSetChatId}
      onBlockedErrorCodeChange={onBlockedErrorCodeChange}
    />
  );
}

function ProjectChatSurface({
  resolvedSurfaceId,
  controlledChatId,
  controlledSetChatId,
  onBlockedErrorCodeChange,
}: {
  resolvedSurfaceId: string;
  controlledChatId: string | null | undefined;
  controlledSetChatId?: (
    next: SetStateAction<string | null | undefined>,
  ) => void;
  onBlockedErrorCodeChange?: (
    errorCode: ProjectChatBlockedErrorCode | null,
  ) => void;
}) {
  const globalChatId = useAIStore((state) => state.activeChatId);
  const agentRuns = useAIStore((state) => state.agentRuns);
  const projectConfigId = useProjectState((state) => state.projectConfig.id);
  const setGlobalChatId = useCallback(
    (next: SetStateAction<string | null | undefined>) => {
      useAIStore.setState((state) => {
        const resolved =
          typeof next === "function" ? next(state.activeChatId) : next;
        return { activeChatId: resolved };
      });
    },
    [],
  );
  const chatId =
    controlledSetChatId !== undefined ? controlledChatId : globalChatId;
  const setChatId = controlledSetChatId ?? setGlobalChatId;
  const [draftThreadState, setDraftThreadState] =
    useState<DraftProjectThreadState>({
      phase: "none",
    });
  const [draftThreadTargetGroupId, setDraftThreadTargetGroupId] = useState<
    string | null
  >(null);
  const [thinking, setThinking] = useState(true);
  const [draftMessageByProjectConfigId, setDraftMessageByProjectConfigId] =
    useState<Record<string, string>>({});
  const [conversationFilterText, setConversationFilterText] = useState("");
  const [conversationSearchMatchIndex, setConversationSearchMatchIndex] =
    useState<number | null>(null);
  const [chatContainerNode, setChatContainerNode] =
    useState<HTMLDivElement | null>(null);
  const [chatContainerWidth, setChatContainerWidth] = useState<number | null>(
    null,
  );
  useHydrateLLMState();
  useHydrateAgenticState();
  const activeConversationMessages = useAIStore((state) => {
    if (chatId === null) {
      const pendingMessages =
        state.pendingChatDetailsBySurfaceId[resolvedSurfaceId]?.messages;
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
  const selectedChatWaitingForResponse = useAIStore((state) => {
    if (chatId === null) {
      return Boolean(
        state.pendingChatDetailsBySurfaceId[resolvedSurfaceId]
          ?.waitingForResponse,
      );
    }
    if (typeof chatId !== "string") {
      return false;
    }
    return Boolean(state.chatDetails[chatId]?.waitingForResponse);
  });

  const {
    apiKeys,
    apiKeysAuthoritative,
    apiKeysInitialLoadComplete,
    allLLMConfigs,
    llmConfigInitialLoadComplete,
    externalAgentHealth,
    externalAgentHealthInitialLoadComplete,
    externalAgentConfigs,
    engineConfigs,
    engineConfigsInitialLoadComplete,
    engineConfigsLoadError,
    transcriptionProfiles,
    transcriptionProfilesInitialLoadComplete,
    projectChatDictationMode,
    projectChatTranscriptionProfileId,
    projectChatActivityAccordionOpenByDefault,
    projectChatActivityChildrenOpenByDefault,
    agentRunsLoadError,
    agentRunsAuthorityState,
  } = useAIStore(
    (x) => ({
      apiKeys: x.apiKeys,
      apiKeysAuthoritative: x.apiKeysAuthoritative,
      apiKeysInitialLoadComplete: x.apiKeysInitialLoadComplete,
      allLLMConfigs: x.allLLMConfigs,
      llmConfigInitialLoadComplete: x.allLLMConfigsInitialLoadComplete,
      externalAgentHealth: x.externalAgentHealth,
      externalAgentHealthInitialLoadComplete:
        x.externalAgentHealthInitialLoadComplete,
      externalAgentConfigs: x.externalAgentConfigs,
      engineConfigs: x.engineConfigs,
      engineConfigsInitialLoadComplete: x.engineConfigsInitialLoadComplete,
      engineConfigsLoadError: x.engineConfigsLoadError,
      transcriptionProfiles: x.transcriptionProfiles,
      transcriptionProfilesInitialLoadComplete:
        x.transcriptionProfilesInitialLoadComplete,
      projectChatDictationMode: x.projectChatDictationMode,
      projectChatTranscriptionProfileId: x.projectChatTranscriptionProfileId,
      projectChatActivityAccordionOpenByDefault:
        x.projectChatActivityAccordionOpenByDefault,
      projectChatActivityChildrenOpenByDefault:
        x.projectChatActivityChildrenOpenByDefault,
      agentRunsLoadError: x.agentRunsLoadError,
      agentRunsAuthorityState: x.agentRunsAuthorityState,
    }),
    _.isEqual,
  );
  const overviewPaneWidth = useLocalStorage((state) => state.overviewWidth);
  const effectiveInlineThreadsViewportWidth =
    chatContainerWidth ?? overviewPaneWidth;
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
  const projectChatAuxView = useLocalStorage((state): ProjectChatAuxView => {
    return state.projectChatAuxViewByProjectConfigId[projectConfigId] ?? "none";
  });
  const viewThreads = useAIStore((state) => state.viewThreads);
  const projectChatThreadsExplicitlyClosedAtLargeWidth = useAIStore(
    (state) => state.projectChatThreadsExplicitlyClosedAtLargeWidth,
  );
  const defaultSelectedEngineId = useAIStore(
    (state) => state.projectChatSelectedEngineId,
  );
  const [selectedEngineId, setSelectedEngineId] = useState<string | null>(
    defaultSelectedEngineId,
  );
  const setProjectChatAuxView = useCallback(
    (nextAuxView: ProjectChatAuxView) => {
      setProjectChatAuxViewForActiveProject(nextAuxView);
    },
    [],
  );
  const setViewThreads = useCallback(
    (nextVisibility: SetStateAction<boolean>) => {
      setProjectChatThreadVisibility(nextVisibility);
    },
    [],
  );
  const setProjectChatThreadsExplicitlyClosedAtLargeWidth = useCallback(
    (nextClosed: boolean) => {
      setProjectChatThreadsClosedAtLargeWidthPreference(nextClosed);
    },
    [],
  );
  const draftMessage = draftMessageByProjectConfigId[projectConfigId] ?? "";
  const setDraftMessage = useCallback(
    (next: SetStateAction<string>) => {
      setDraftMessageByProjectConfigId((current) => {
        const currentDraftMessage = current[projectConfigId] ?? "";
        const nextDraftMessage =
          typeof next === "function" ? next(currentDraftMessage) : next;
        const nextByProjectConfigId =
          resolveProjectChatDraftMessageByProjectConfigIdUpdate({
            draftMessageByProjectConfigId: current,
            projectConfigId,
            nextDraftMessage,
          });
        return nextByProjectConfigId ?? current;
      });
    },
    [projectConfigId],
  );
  const inlineThreadsWidthStorage = useMemo(
    () => getSafeLocalStorageAdapter("project-chat-inline-threads"),
    [],
  );
  const [inlineThreadsWidth, setInlineThreadsWidth] = useState(() => {
    const stored = Number(
      inlineThreadsWidthStorage.getItem(INLINE_THREADS_WIDTH_STORAGE_KEY),
    );
    if (!Number.isFinite(stored)) {
      return INLINE_THREADS_DEFAULT_WIDTH_PX;
    }
    return stored;
  });

  const [runtimePermissionMode, setRuntimePermissionMode] =
    useState<ChatPermissionModeValue>("minimal");
  const [selectedThreadGroupId, setSelectedThreadGroupId] = useState<
    string | null
  >(null);
  const [inlineThreadsHeaderPortalTarget, setInlineThreadsHeaderPortalTarget] =
    useState<HTMLDivElement | null>(null);
  const [engineSwitchContinuation, setEngineSwitchContinuation] =
    useState<ProjectChatEngineSwitchContinuation | null>(null);
  const [
    draftThreadContinuationSourceChatId,
    setDraftThreadContinuationSourceChatId,
  ] = useState<string | null>(null);
  const notifiedExternalEngineIssueRef = useRef<string | null>(null);
  const inlineThreadsHeaderShellRef = useRef<HTMLDivElement | null>(null);
  const inlineThreadsResizableColumnRef = useRef<HTMLDivElement | null>(null);
  const hasInitializedInlineThreadsResizeSyncRef = useRef(false);
  const previousLargeEnoughForInlineThreadsRef = useRef(
    effectiveInlineThreadsViewportWidth >= INLINE_THREADS_BREAKPOINT_PX,
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
  const engineConfigById = useMemo(() => {
    const nextById = new Map<string, EngineConfig>();
    for (const config of engineConfigs) {
      nextById.set(config.id, config);
    }
    return nextById;
  }, [engineConfigs]);
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
          apiKeysAuthoritative,
        }),
      [
        allLLMConfigs,
        apiKeys,
        apiKeysAuthoritative,
        selectedTranscriptionProfile,
      ],
    );
  const defaultLLMConfigId = allLLMConfigs?.default_config_id ?? null;
  const providerDictationLikelySupported = providerDictationAvailable;
  const hasLLMConfig = Boolean(
    selectedLLMConfigId && availableConfigIds.has(selectedLLMConfigId),
  );
  const llmSelectionUnavailableReason = useMemo(
    () =>
      resolveProjectChatSelectedLLMUnavailableReason({
        engineType,
        selectedLLMConfigId,
        allLLMConfigs,
        availableConfigIds,
      }),
    [allLLMConfigs, availableConfigIds, engineType, selectedLLMConfigId],
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
  const engineSwitchContinuationBannerText = useMemo(() => {
    if (!engineSwitchContinuation) {
      return null;
    }
    const sourceEngineName =
      engineConfigById.get(engineSwitchContinuation.sourceEngineConfigId)
        ?.name ?? "the previous engine";
    const targetEngineName = engineSwitchContinuation.targetEngineConfigId
      ? engineConfigById.get(engineSwitchContinuation.targetEngineConfigId)
          ?.name ?? "the selected engine"
      : "the selected engine";
    return `Engine changed from ${sourceEngineName} to ${targetEngineName}. Continue in a new thread to keep engine provenance consistent.`;
  }, [engineConfigById, engineSwitchContinuation]);
  const requiresNewThreadForEngineSwitch = engineSwitchContinuation !== null;
  const newThreadContinuationRequiredReason = requiresNewThreadForEngineSwitch
    ? "Switching engines on an existing thread requires continuing in a new thread."
    : null;
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
        projectConfigId,
        unscopedOnly: true,
        compatibility: historyCompatibility,
      }),
    [agentRuns, historyCompatibility, projectConfigId],
  );
  const chatHistoryEntriesById = useMemo(() => {
    const entriesById = new Map<string, (typeof chatHistoryEntries)[number]>();
    for (const entry of chatHistoryEntries) {
      entriesById.set(entry.chatId, entry);
    }
    return entriesById;
  }, [chatHistoryEntries]);
  const chatProvenanceByChatIdMap = useMemo(
    () =>
      buildChatProvenanceByChatId(agentRuns, {
        projectConfigId,
        unscopedOnly: true,
      }),
    [agentRuns, projectConfigId],
  );
  const selectedScopedChatProvenance = useMemo(() => {
    if (typeof chatId !== "string") {
      return { status: "missing" } as const;
    }
    return resolveScopedChatProvenanceForChatId(agentRuns, {
      chatId,
      projectConfigId,
      unscopedOnly: true,
    });
  }, [agentRuns, chatId, projectConfigId]);
  const chatEngineConfigByChatId = useMemo(() => {
    const nextByChatId = new Map<string, string | null>();
    for (const [runChatId, provenance] of chatProvenanceByChatIdMap.entries()) {
      nextByChatId.set(runChatId, provenance.engineConfigId);
    }
    return nextByChatId;
  }, [chatProvenanceByChatIdMap]);
  const selectedChatHydrationAuthority = useMemo(
    () =>
      resolveProjectChatHydrationAuthority({
        chatId,
        selectedScopedChatProvenance,
        chatProvenanceAuthoritative: agentRunsAuthorityState === "ready",
        engineConfigById,
        engineConfigsAuthoritative:
          engineConfigsInitialLoadComplete && engineConfigsLoadError === null,
        selectedChatWaitingForResponse,
        engineType,
      }),
    [
      chatId,
      selectedScopedChatProvenance,
      agentRunsAuthorityState,
      engineConfigById,
      engineConfigsInitialLoadComplete,
      engineConfigsLoadError,
      selectedChatWaitingForResponse,
      engineType,
    ],
  );
  const selectedChatRunWatermark = useMemo(() => {
    if (typeof chatId !== "string") {
      return 0;
    }
    const normalizedChatId = chatId.trim();
    if (!normalizedChatId) {
      return 0;
    }
    let nextWatermark = 0;
    for (const run of agentRuns) {
      if (getRunInputString(run, "chatId") !== normalizedChatId) {
        continue;
      }
      nextWatermark = Math.max(nextWatermark, getRunLastUpdatedMs(run));
    }
    return nextWatermark;
  }, [agentRuns, chatId]);
  const selectedChatHydrationMetadataRevision = useMemo(() => {
    if (typeof chatId !== "string") {
      return "no-selected-chat";
    }
    const normalizedChatId = chatId.trim();
    if (!normalizedChatId) {
      return "no-selected-chat";
    }
    const selectedProvenance =
      chatProvenanceByChatIdMap.get(normalizedChatId) ?? null;
    const selectedProvenanceEngineConfigId =
      selectedProvenance?.engineConfigId ?? null;
    const selectedProvenanceEngineConfig = selectedProvenanceEngineConfigId
      ? engineConfigById.get(selectedProvenanceEngineConfigId) ?? null
      : null;
    const selectedEngineRevision = selectedProvenanceEngineConfig
      ? [
          selectedProvenanceEngineConfig.id,
          selectedProvenanceEngineConfig.engineType,
          selectedProvenanceEngineConfig.settaLlmConfigId ?? "",
          selectedProvenanceEngineConfig.externalAgentConfigId ?? "",
        ].join(":")
      : "missing_engine_config";
    return [
      selectedChatHydrationAuthority.status,
      selectedChatHydrationAuthority.hydrationRunType ?? "missing_run_type",
      selectedChatHydrationAuthority.blockedErrorCode ?? "not_blocked",
      selectedProvenanceEngineConfigId ?? "missing_engine_config_id",
      selectedEngineRevision,
      selectedChatRunWatermark,
      `runs_${agentRunsAuthorityState}`,
      agentRunsLoadError ?? "runs_ok",
      engineConfigsInitialLoadComplete ? "engines_ready" : "engines_loading",
      engineConfigsLoadError ?? "engines_ok",
    ].join("|");
  }, [
    agentRunsAuthorityState,
    agentRunsLoadError,
    chatId,
    chatProvenanceByChatIdMap,
    engineConfigById,
    engineConfigsInitialLoadComplete,
    engineConfigsLoadError,
    selectedChatHydrationAuthority.blockedErrorCode,
    selectedChatHydrationAuthority.hydrationRunType,
    selectedChatHydrationAuthority.status,
    selectedChatRunWatermark,
  ]);
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
    setEngineSwitchContinuation((current) =>
      resolveProjectChatEngineSwitchContinuationAfterContextChange({
        continuation: current,
        chatId,
        selectedEngineId: effectiveEngineId,
      }),
    );
  }, [chatId, effectiveEngineId]);
  useEffect(() => {
    if (
      shouldProjectChatSkipEngineSyncForContinuation({
        continuation: engineSwitchContinuation,
        chatId,
      })
    ) {
      return;
    }
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
    engineSwitchContinuation,
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
      const nextContinuation =
        resolveProjectChatEngineSwitchContinuationOnEngineChange({
          chatId,
          nextEngineId,
          chatEngineConfigByChatId,
        });
      setSelectedEngineId(nextEngineId);
      useAIStore.setState({ projectChatSelectedEngineId: nextEngineId });
      setProjectChatAuxView("none");
      setEngineSwitchContinuation(nextContinuation);
      if (nextContinuation) {
        return;
      }
      setChatId(undefined);
      setDraftThreadState({ phase: "none" });
      setDraftThreadTargetGroupId(null);
      setSelectedThreadGroupId(null);
    },
    [
      chatEngineConfigByChatId,
      chatId,
      selectedEngineId,
      setChatId,
      setProjectChatAuxView,
      setSelectedEngineId,
    ],
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
    const resolvedSelectedEngineId =
      resolveProjectChatSelectedEngineIdAfterEngineConfigsLoad({
        engineConfigsInitialLoadComplete,
        engineConfigs,
        selectedEngineId,
        preferredEngineId,
      });
    if (resolvedSelectedEngineId === selectedEngineId) {
      return;
    }
    setSelectedEngineId(resolvedSelectedEngineId);
  }, [
    engineConfigs,
    engineConfigsInitialLoadComplete,
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

  const handleChatContainerRef = useCallback((node: HTMLDivElement | null) => {
    setChatContainerNode(node);
  }, []);

  useEffect(() => {
    if (!chatContainerNode) {
      return;
    }

    const syncChatContainerWidth = (nextWidth: number) => {
      const roundedWidth = Math.max(0, Math.round(nextWidth));
      setChatContainerWidth((currentWidth) => {
        if (currentWidth === roundedWidth) {
          return currentWidth;
        }
        return roundedWidth;
      });
    };

    syncChatContainerWidth(chatContainerNode.getBoundingClientRect().width);

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const resizeObserver = new ResizeObserver((entries) => {
      const firstEntry = entries[0];
      if (!firstEntry) {
        return;
      }
      syncChatContainerWidth(firstEntry.contentRect.width);
    });
    resizeObserver.observe(chatContainerNode);

    return () => {
      resizeObserver.disconnect();
    };
  }, [chatContainerNode]);

  useEffect(() => {
    const isLargeEnoughForInlineThreads =
      effectiveInlineThreadsViewportWidth >= INLINE_THREADS_BREAKPOINT_PX;
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
    setViewThreads(nextVisibility);
  }, [
    effectiveInlineThreadsViewportWidth,
    projectChatThreadsExplicitlyClosedAtLargeWidth,
    viewThreads,
  ]);

  const showInlineThreads =
    viewThreads &&
    effectiveInlineThreadsViewportWidth >= INLINE_THREADS_BREAKPOINT_PX;
  const inlineThreadsMaxWidth = useMemo(() => {
    const boundedMaxWidth = clamp(
      effectiveInlineThreadsViewportWidth - INLINE_THREADS_MIN_CHAT_WIDTH_PX,
      INLINE_THREADS_MIN_WIDTH_PX,
      INLINE_THREADS_MAX_WIDTH_PX,
    );
    return boundedMaxWidth;
  }, [effectiveInlineThreadsViewportWidth]);
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
    inlineThreadsWidthStorage.setItem(
      INLINE_THREADS_WIDTH_STORAGE_KEY,
      String(inlineThreadsWidth),
    );
  }, [inlineThreadsWidth, inlineThreadsWidthStorage]);

  const showThreadsOnlyView =
    viewThreads && !showInlineThreads && projectChatAuxView === "none";
  const isAuxView = projectChatAuxView !== "none" || showThreadsOnlyView;
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
  const showReturnOnlyNav =
    projectChatAuxView !== "none" || showThreadsOnlyView;
  const handleReturnToChat = useCallback(() => {
    if (projectChatAuxView !== "none") {
      setProjectChatAuxView("none");
      return;
    }
    setViewThreads(false);
  }, [projectChatAuxView]);
  const handleToggleThreads = useCallback(() => {
    setProjectChatAuxView("none");
    const isLargeEnoughForInlineThreads =
      effectiveInlineThreadsViewportWidth >= INLINE_THREADS_BREAKPOINT_PX;
    setViewThreads((current) => {
      const nextViewThreads = !current;
      if (isLargeEnoughForInlineThreads) {
        setProjectChatThreadsExplicitlyClosedAtLargeWidth(!nextViewThreads);
      }
      return nextViewThreads;
    });
  }, [effectiveInlineThreadsViewportWidth]);
  const handleOpenProjectSettingsAuxView = useCallback(() => {
    setProjectChatAuxView("ai_settings");
  }, [setProjectChatAuxView]);
  const handleOpenSkillsAuxView = useCallback(() => {
    setProjectChatAuxView("skills");
  }, [setProjectChatAuxView]);
  const handleOpenMcpAuxView = useCallback(() => {
    setProjectChatAuxView("mcp");
  }, [setProjectChatAuxView]);
  const handleOpenSlashCommandsAuxView = useCallback(() => {
    setProjectChatAuxView("slash_commands");
  }, [setProjectChatAuxView]);
  const startNewChatDraft = useCallback(
    ({
      targetGroupId,
      clearContinuationSource,
    }: {
      targetGroupId: string | null;
      clearContinuationSource: boolean;
    }) => {
      setChatId(undefined);
      setDraftThreadState({ phase: "idle" });
      setDraftThreadTargetGroupId(targetGroupId);
      if (clearContinuationSource) {
        setDraftThreadContinuationSourceChatId(null);
      }
      setEngineSwitchContinuation(null);
      if (!showInlineThreads) {
        setViewThreads(false);
      }
      setProjectChatAuxView("none");
    },
    [setChatId, showInlineThreads],
  );
  const handleNewChatClick = useCallback(() => {
    startNewChatDraft({
      targetGroupId: selectedThreadGroupId,
      clearContinuationSource: true,
    });
  }, [selectedThreadGroupId, startNewChatDraft]);
  const handleNewChatStartForSubmit = useCallback(() => {
    startNewChatDraft({
      targetGroupId: selectedThreadGroupId,
      clearContinuationSource: false,
    });
  }, [selectedThreadGroupId, startNewChatDraft]);
  const handleNewChatInThreadGroup = useCallback(
    (groupId: string) => {
      startNewChatDraft({
        targetGroupId: groupId,
        clearContinuationSource: true,
      });
      setSelectedThreadGroupId(groupId);
    },
    [startNewChatDraft],
  );
  const handleContinueInNewThread = useCallback(() => {
    if (!engineSwitchContinuation) {
      return;
    }
    seedPendingChatDetails(activeConversationMessages, resolvedSurfaceId);
    setChatId(null);
    setDraftThreadState({ phase: "idle" });
    setDraftThreadTargetGroupId(selectedThreadGroupId);
    setDraftThreadContinuationSourceChatId(
      engineSwitchContinuation.sourceChatId,
    );
    setEngineSwitchContinuation(null);
    if (!showInlineThreads) {
      setViewThreads(false);
    }
    setProjectChatAuxView("none");
  }, [
    activeConversationMessages,
    engineSwitchContinuation,
    resolvedSurfaceId,
    selectedThreadGroupId,
    setChatId,
    showInlineThreads,
  ]);
  const returnToChatTooltipHandlers = useMemo(
    () =>
      getFloatingBoxHandlers({
        title: "Return to chat",
        content:
          projectChatAuxView === "skills"
            ? "Leave Skills and reopen chat."
            : projectChatAuxView === "mcp"
              ? "Leave MCP and reopen chat."
              : projectChatAuxView === "slash_commands"
                ? "Leave Slash Commands and reopen chat."
                : projectChatAuxView === "ai_settings"
                  ? "Leave AI Settings and reopen chat."
                  : "Close threads-only view and reopen chat.",
      }),
    [projectChatAuxView],
  );
  const showAuxTabs = projectChatAuxView !== "none";
  const auxTabs = useMemo<
    Array<{
      id: ProjectChatAuxTabId;
      label: string;
      testId: string;
      active: boolean;
      onClick: () => void;
    }>
  >(
    () => [
      {
        id: "skills",
        label: "Skills",
        testId: "project-chat-aux-tab-skills",
        active: projectChatAuxView === "skills",
        onClick: handleOpenSkillsAuxView,
      },
      {
        id: "mcp",
        label: "MCP",
        testId: "project-chat-aux-tab-mcp",
        active: projectChatAuxView === "mcp",
        onClick: handleOpenMcpAuxView,
      },
      {
        id: "slash_commands",
        label: "Slash Commands",
        testId: "project-chat-aux-tab-slash-commands",
        active: projectChatAuxView === "slash_commands",
        onClick: handleOpenSlashCommandsAuxView,
      },
      {
        id: "ai_settings",
        label: "AI Settings",
        testId: "project-chat-aux-tab-ai-settings",
        active: projectChatAuxView === "ai_settings",
        onClick: handleOpenProjectSettingsAuxView,
      },
    ],
    [
      handleOpenMcpAuxView,
      handleOpenProjectSettingsAuxView,
      handleOpenSkillsAuxView,
      handleOpenSlashCommandsAuxView,
      projectChatAuxView,
    ],
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
      if (succeeded && nextChatId) {
        setDraftThreadContinuationSourceChatId(null);
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
  useEffect(() => {
    if (
      draftThreadState.phase === "none" &&
      draftThreadContinuationSourceChatId !== null
    ) {
      setDraftThreadContinuationSourceChatId(null);
    }
  }, [draftThreadContinuationSourceChatId, draftThreadState.phase]);
  const auxViewContent =
    projectChatAuxView === "skills" ||
    projectChatAuxView === "mcp" ||
    projectChatAuxView === "slash_commands" ? (
      <ProjectChatSkillsMcpViewer
        projectConfigId={projectConfigId}
        chatId={chatId}
        engineConfigId={effectiveEngineId}
        engineType={engineType}
        externalAgentToolType={externalAgentConfig?.toolType ?? null}
        viewMode={projectChatAuxView}
      />
    ) : projectChatAuxView === "ai_settings" ? (
      <ProjectAISettings />
    ) : null;

  return (
    apiKeysInitialLoadComplete &&
    llmConfigInitialLoadComplete &&
    engineConfigsInitialLoadComplete && (
      <div
        ref={handleChatContainerRef}
        className="flex h-full min-h-0 min-w-0 flex-col overflow-x-hidden @container"
      >
        <nav className="flex flex-col border-b border-setta-100 dark:border-setta-800 [&_button]:cursor-pointer">
          <div className="flex w-full min-w-0 items-stretch">
            {showInlineThreads ? (
              <div
                ref={handleInlineThreadsHeaderShellRef}
                className="shrink-0 overflow-hidden border-r border-setta-200 pb-2 dark:border-setta-800"
                style={{ width: `${resolvedInlineThreadsWidth}px` }}
              >
                <div
                  ref={handleInlineThreadsHeaderHostRef}
                  className="h-full w-full min-w-0 @container"
                  data-testid="project-chat-inline-threads-header-host"
                />
              </div>
            ) : null}
            <div
              className={`min-w-0 flex-1 pb-2 @container ${showInlineThreads ? "pl-2" : ""}`}
            >
              <div className={PROJECT_CHAT_CONTENT_SHELL_CLASS}>
                <div className="mt-2 grid w-full min-w-0 items-center gap-2 [grid-template-columns:auto_auto] @[16.25rem]:[grid-template-columns:auto_minmax(0,1fr)_auto]">
                  <div className="flex min-w-0 items-center gap-2">
                    {showReturnOnlyNav ? (
                      <button
                        className="nodrag relative inline-flex h-full cursor-pointer select-none items-center gap-1 rounded-md bg-transparent px-1 text-xs font-semibold text-setta-600 transition-colors hover:text-setta-900 focus-visible:ring-2 active:!bg-blue-100 dark:text-setta-300 dark:hover:bg-transparent dark:hover:text-white active:dark:!bg-transparent"
                        onClick={handleReturnToChat}
                        aria-label="Return to chat"
                        {...returnToChatTooltipHandlers}
                      >
                        <IoMdArrowRoundBack />
                        <span className="hidden @[46rem]:block">
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
                          <span className="hidden @[46rem]:block">New</span>
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
                              <span className="hidden @[46rem]:block">
                                Hide Threads
                              </span>
                            </>
                          ) : (
                            <>
                              <RiChatHistoryLine size={15} />
                              <span className="hidden @[46rem]:block">
                                Threads
                              </span>
                            </>
                          )}
                        </button>
                      </>
                    )}
                  </div>
                  {showAuxTabs ? (
                    <div
                      className="min-w-0 overflow-hidden @[16.25rem]:col-start-2"
                      data-testid="project-chat-aux-tabs"
                    >
                      <div className="flex min-w-0 flex-wrap items-center gap-1">
                        {auxTabs.map((tab) => (
                          <button
                            key={tab.id}
                            type="button"
                            data-testid={tab.testId}
                            aria-current={tab.active ? "page" : undefined}
                            className={`rounded-md px-2 py-1 text-[11px] font-semibold transition-colors ${
                              tab.active
                                ? "bg-setta-100 text-setta-900 dark:bg-setta-800 dark:text-setta-100"
                                : "text-setta-500 hover:bg-setta-100 hover:text-setta-800 dark:text-setta-400 dark:hover:bg-setta-800 dark:hover:text-setta-100"
                            }`}
                            onClick={tab.onClick}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {!isAuxView ? (
                    <div className="flex items-center justify-self-end @[16.25rem]:col-start-3">
                      {showPlanModeBadge ? <PlanModeBadge /> : null}
                      <ProjectAISettingsPopover
                        engineGroups={engineGroups}
                        transcriptionProfileGroups={transcriptionProfileGroups}
                        availableConfigGroups={availableConfigGroups}
                        selectedEngineId={effectiveEngineId}
                        selectedLLMConfigId={selectedLLMConfigId}
                        llmSelectionUnavailableReason={
                          llmSelectionUnavailableReason
                        }
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
                        onOpenSkillsView={handleOpenSkillsAuxView}
                        onOpenMcpView={handleOpenMcpAuxView}
                        onOpenSlashCommandsView={handleOpenSlashCommandsAuxView}
                        onOpenProjectSettingsView={
                          handleOpenProjectSettingsAuxView
                        }
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
                      className="nodrag relative col-span-2 row-start-2 flex min-w-0 items-center @[16.25rem]:col-span-1 @[16.25rem]:col-start-2 @[16.25rem]:row-start-1 @[44rem]:min-w-[11rem]"
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
                          if (event.key === "Enter") {
                            event.preventDefault();
                            handleStepConversationSearch(
                              event.shiftKey ? "previous" : "next",
                            );
                            return;
                          }
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
        {engineSwitchContinuationBannerText ? (
          <div className="sticky top-0 z-10 border-b border-amber-300 bg-amber-50/95 px-2 py-2 text-xs text-amber-900 backdrop-blur dark:border-amber-600/70 dark:bg-amber-950/60 dark:text-amber-200">
            <div
              className={`${PROJECT_CHAT_CONTENT_SHELL_CLASS} flex items-center justify-between gap-2`}
            >
              <p
                data-testid="project-chat-engine-switch-banner"
                className="min-w-0 flex-1"
              >
                {engineSwitchContinuationBannerText}
              </p>
              <button
                type="button"
                data-testid="project-chat-engine-switch-continue-button"
                onClick={handleContinueInNewThread}
                className="shrink-0 rounded-md border border-amber-400/90 bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-900 transition-colors hover:bg-amber-200 dark:border-amber-500/80 dark:bg-amber-900/60 dark:text-amber-100 dark:hover:bg-amber-900"
              >
                Continue in new thread
              </button>
            </div>
          </div>
        ) : null}

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
                  draftWaitingForResponse={selectedChatWaitingForResponse}
                  selectedGroupId={selectedThreadGroupId}
                  onSelectedGroupChange={setSelectedThreadGroupId}
                  onStartNewThread={handleNewChatClick}
                  onStartNewThreadInGroup={handleNewChatInThreadGroup}
                  onCloseThreadsView={() => {
                    setViewThreads(false);
                  }}
                  headerPortalTarget={inlineThreadsHeaderPortalTarget}
                />
              </div>
            </Resizable>
            <div className="flex min-h-0 min-w-0 flex-1 flex-col pl-2">
              {auxViewContent ? (
                <div
                  className={`${PROJECT_CHAT_CONTENT_SHELL_CLASS} flex min-h-0 flex-1 flex-col`}
                  data-chat-width-shell="true"
                >
                  {auxViewContent}
                </div>
              ) : (
                <ProjectChatCore
                  surfaceId={resolvedSurfaceId}
                  chatId={chatId}
                  draftMessage={draftMessage}
                  setDraftMessage={setDraftMessage}
                  placeholderText={placeholderText}
                  conversationFilterText={conversationFilterText}
                  requiresNewThreadContinuation={
                    requiresNewThreadForEngineSwitch
                  }
                  newThreadContinuationRequiredReason={
                    newThreadContinuationRequiredReason
                  }
                  newThreadSeedChatId={
                    draftThreadState.phase === "none"
                      ? null
                      : draftThreadContinuationSourceChatId
                  }
                  hydrationAuthority={selectedChatHydrationAuthority}
                  hydrationMetadataRevision={
                    selectedChatHydrationMetadataRevision
                  }
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
                  setChatId={setChatId}
                  onStartNewChat={handleNewChatStartForSubmit}
                  onDraftThreadStart={handleDraftThreadStart}
                  onDraftThreadSettled={handleDraftThreadSettled}
                  onThinkingChange={setThinking}
                  onPermissionModeChange={setRuntimePermissionMode}
                  onBlockedErrorCodeChange={onBlockedErrorCodeChange}
                  activeConversationSearchMatchMessageId={
                    activeConversationSearchMatchMessageId
                  }
                />
              )}
            </div>
          </div>
        ) : auxViewContent ? (
          <div
            className={`${PROJECT_CHAT_CONTENT_SHELL_CLASS} flex min-h-0 flex-1 flex-col`}
            data-chat-width-shell="true"
          >
            {auxViewContent}
          </div>
        ) : viewThreads ? (
          <ProjectChatHistory
            chatId={chatId}
            setChatId={setChatId}
            runType={projectHistoryRunType}
            engineConfigId={effectiveEngineId}
            closeOnSelect={true}
            draftThread={draftThreadHint}
            draftWaitingForResponse={selectedChatWaitingForResponse}
            selectedGroupId={selectedThreadGroupId}
            onSelectedGroupChange={setSelectedThreadGroupId}
            onStartNewThread={handleNewChatClick}
            onStartNewThreadInGroup={handleNewChatInThreadGroup}
            onCloseThreadsView={() => {
              setViewThreads(false);
            }}
          />
        ) : (
          <>
            <ProjectChatCore
              surfaceId={resolvedSurfaceId}
              chatId={chatId}
              draftMessage={draftMessage}
              setDraftMessage={setDraftMessage}
              placeholderText={placeholderText}
              conversationFilterText={conversationFilterText}
              requiresNewThreadContinuation={requiresNewThreadForEngineSwitch}
              newThreadContinuationRequiredReason={
                newThreadContinuationRequiredReason
              }
              newThreadSeedChatId={
                draftThreadState.phase === "none"
                  ? null
                  : draftThreadContinuationSourceChatId
              }
              hydrationAuthority={selectedChatHydrationAuthority}
              hydrationMetadataRevision={selectedChatHydrationMetadataRevision}
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
              setChatId={setChatId}
              onStartNewChat={handleNewChatStartForSubmit}
              onDraftThreadStart={handleDraftThreadStart}
              onDraftThreadSettled={handleDraftThreadSettled}
              onThinkingChange={setThinking}
              onPermissionModeChange={setRuntimePermissionMode}
              onBlockedErrorCodeChange={onBlockedErrorCodeChange}
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

function ProjectAISettingsContent({
  engineGroups,
  transcriptionProfileGroups,
  availableConfigGroups,
  selectedEngineId,
  selectedLLMConfigId,
  llmSelectionUnavailableReason,
  selectedTranscriptionProfileId,
  defaultLLMConfigId,
  engineType,
  noConfigsAvailable,
  dictationMode,
  activityAccordionOpenByDefault,
  activityChildrenOpenByDefault,
  providerDictationLikelySupported,
  providerDictationUnavailableReason,
  onOpenSkillsView,
  onOpenMcpView,
  onOpenSlashCommandsView,
  onOpenProjectSettingsView,
  onEngineChange,
  onLLMConfigChange,
  onTranscriptionProfileChange,
  onPinDefaultModel,
  onDictationModeChange,
  onActivityAccordionOpenByDefaultChange,
  onActivityChildrenOpenByDefaultChange,
}: ProjectAISettingsPopoverProps) {
  const showLLMConfig = engineType === EngineTypeEnum.setta_llm;
  const showLlmUnavailableWarning = llmSelectionUnavailableReason !== null;
  const llmPlaceholder = noConfigsAvailable
    ? "Add an LLM config or API key"
    : "Select an LLM";
  const llmBg =
    selectedLLMConfigId && !showLlmUnavailableWarning
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
            name: getProjectDictationModeOptionLabel({
              mode: "auto",
              providerModeAvailable,
            }),
          },
          {
            id: "provider",
            name: getProjectDictationModeOptionLabel({
              mode: "provider",
              providerModeAvailable,
            }),
          },
          {
            id: "browser",
            name: getProjectDictationModeOptionLabel({
              mode: "browser",
              providerModeAvailable,
            }),
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
  const openSkillsTooltipHandlers = useMemo(
    () =>
      getFloatingBoxHandlers({
        title: "Skills",
        content: "Open the Skills view.",
      }),
    [],
  );
  const openMcpTooltipHandlers = useMemo(
    () =>
      getFloatingBoxHandlers({
        title: "MCP",
        content: "Open the MCP view.",
      }),
    [],
  );
  const openSlashCommandsTooltipHandlers = useMemo(
    () =>
      getFloatingBoxHandlers({
        title: "Slash Commands",
        content: "Open the Slash Commands view.",
      }),
    [],
  );
  const openProjectSettingsViewTooltipHandlers = useMemo(
    () =>
      getFloatingBoxHandlers({
        title: "Project AI Settings",
        content: "Open the Project AI Settings pane.",
      }),
    [],
  );

  return (
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
            {showLlmUnavailableWarning ? (
              <p className="text-[10px] text-red-600 dark:text-red-300">
                {llmSelectionUnavailableReason}
              </p>
            ) : null}
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
              onClick={onOpenSkillsView}
              data-testid="project-chat-settings-open-skills"
              className="box-border h-8 w-full min-w-0 rounded-md border border-setta-200 bg-white px-2 text-center text-[11px] font-semibold text-setta-600 transition-colors hover:bg-setta-50 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-200 dark:hover:bg-setta-800/70"
              {...openSkillsTooltipHandlers}
            >
              Skills
            </button>
            <button
              type="button"
              onClick={onOpenMcpView}
              data-testid="project-chat-settings-open-mcp"
              className="box-border h-8 w-full min-w-0 rounded-md border border-setta-200 bg-white px-2 text-center text-[11px] font-semibold text-setta-600 transition-colors hover:bg-setta-50 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-200 dark:hover:bg-setta-800/70"
              {...openMcpTooltipHandlers}
            >
              MCP
            </button>
            <button
              type="button"
              onClick={onOpenSlashCommandsView}
              data-testid="project-chat-settings-open-slash-commands"
              className="box-border h-8 w-full min-w-0 rounded-md border border-setta-200 bg-white px-2 text-center text-[11px] font-semibold text-setta-600 transition-colors hover:bg-setta-50 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-200 dark:hover:bg-setta-800/70"
              {...openSlashCommandsTooltipHandlers}
            >
              Slash Commands
            </button>
            <button
              type="button"
              onClick={onOpenProjectSettingsView}
              data-testid="project-chat-settings-open-project-settings"
              className="box-border inline-flex h-8 w-full min-w-0 items-center justify-center gap-1 rounded-md border border-setta-200 bg-white px-2 text-[11px] font-semibold text-setta-600 transition-colors hover:bg-setta-50 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-200 dark:hover:bg-setta-800/70"
              {...openProjectSettingsViewTooltipHandlers}
            >
              <MdOutlineSmartToy size={14} aria-hidden />
              <span>AI Settings</span>
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
          <label
            data-testid="project-chat-settings-activity-accordion-default"
            className="flex w-full items-center justify-between gap-2 rounded-md bg-white px-2 py-1.5 text-[11px] text-setta-600 dark:bg-setta-900 dark:text-setta-200"
          >
            <span>Open activity accordions by default</span>
            <SwitchInput
              value={activityAccordionOpenByDefault}
              onChange={onActivityAccordionOpenByDefaultChange}
            />
          </label>
          <label
            data-testid="project-chat-settings-activity-children-default"
            className="flex w-full items-center justify-between gap-2 rounded-md bg-white px-2 py-1.5 text-[11px] text-setta-600 dark:bg-setta-900 dark:text-setta-200"
          >
            <span>Open child accordions by default</span>
            <SwitchInput
              value={activityChildrenOpenByDefault}
              onChange={onActivityChildrenOpenByDefaultChange}
            />
          </label>
        </div>
      </div>
    </div>
  );
}

function ProjectAISettingsPopover(props: ProjectAISettingsPopoverProps) {
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
          <span className="hidden @[46rem]:block">Settings</span>
        </button>
      }
      contentClasses="z-50 w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-setta-200/80 bg-white/95 p-3 shadow-xl backdrop-blur relative overflow-visible dark:border-setta-700/70 dark:bg-setta-900/95 data-[state=open]:animate-fade-in"
      arrowClasses="fill-white/95 stroke-[1px] stroke-setta-200/80 dark:fill-setta-900/95 dark:stroke-setta-700/70"
      contentProps={{ onOpenAutoFocus: handleSettingsPopoverOpenAutoFocus }}
    >
      <ProjectAISettingsContent {...props} />
    </StandardPopover>
  );
}
