import { ModalInfoType } from "components/Modals/types";
import { HandlePosition, HandleType, Node } from "forks/xyflow/core/types";
import type { ChatSharedEdgeMode } from "state/actions/chatSharedHandleIds";
import type { AIFollowMode } from "state/types/aiFollow";
import {
  parseAppGenerationMode,
  type AppGenerationMode,
} from "state/types/appGenerationMode";
import type { SettaProjectNameValidationErrors } from "state/types/nameValidation";
import type { ChatAppGenerationDetails } from "state/utils/chatAppGeneration";
import {
  CLOSED_PANE_WIDTH,
  INITIAL_OVERVIEW_WIDTH,
  INITIAL_UI_EDITOR_WIDTH,
  isOverviewTabKey,
  OverviewNotificationsPaneTab,
  OverviewNotificationsPaneTabEnum,
  OverviewTabKey,
  OverviewTabNameEnum,
  ProjectSearchMode,
  ProjectSearchModeEnum,
  UIEditorTabLocalStorage,
} from "utils/constants";
import {
  DEFAULT_FILE_BROWSER_TYPE_FILTERS,
  type FileBrowserSearchScope,
  type FileBrowserTypeFilter,
} from "utils/fileBrowserTypes";
import {
  AgenticEdgeKindEnum,
  AgentProfile,
  AgentRun,
  AllLLMConfigs,
  AllProjectMetadata,
  APIKeys,
  AppDefinition,
  BaseChatMessageUnion,
  BaseDependencyKeyUnion,
  BrushStrokeMapping,
  ChartDataMapping,
  createProjectChatWindowingState,
  createProjectConfig,
  createSettingsState,
  createSingletonSections,
  DrawAreaLayerItemTransformMapping,
  EngineConfig,
  ExternalAgentConfig,
  ExternalAgentPreflightStatus,
  ImageMapping,
  ListenerCoverageSnapshot,
  LLMConfig,
  PromptTemplate,
  RenameRefactorBroadcastContent,
  SettaBackendLogEvent,
  SettaLspDiagnostic,
  SettaNotification,
  SettingsState,
  SharePolicy,
  SingleConfig,
  TranscriptionProfile,
  WebsocketConnectionInfo,
} from "utils/generatedTypes";
import {
  DEFAULT_GIT_GRAPH_AUTHOR_WIDTH_PX,
  DEFAULT_GIT_GRAPH_COL_WIDTH_PX,
  DEFAULT_GIT_GRAPH_DATE_WIDTH_PX,
  DEFAULT_GIT_GRAPH_HASH_WIDTH_PX,
  DEFAULT_GIT_GRAPH_SPLIT_PCT,
} from "utils/gitGraphLayoutDefaults";
import {
  createJSONStorage,
  persist,
  subscribeWithSelector,
} from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import { createWithEqualityFn } from "zustand/traditional";
import { withProjectState, withResetFn } from "./utils";

const createInMemoryStorage = () => {
  const storage = new Map<string, string>();
  return {
    getItem: (name: string) => storage.get(name) ?? null,
    setItem: (name: string, value: string) => {
      storage.set(name, value);
    },
    removeItem: (name: string) => {
      storage.delete(name);
    },
  };
};

const getPersistStorage = <S>() =>
  createJSONStorage<S>(() => {
    if (typeof localStorage === "undefined") {
      return createInMemoryStorage();
    }
    if (
      typeof localStorage.getItem !== "function" ||
      typeof localStorage.setItem !== "function" ||
      typeof localStorage.removeItem !== "function"
    ) {
      return createInMemoryStorage();
    }
    return localStorage;
  });

export const useResizeEvent = withProjectState(
  createWithEqualityFn(
    immer(
      withResetFn(() => ({
        resizeEvent: {},
      })),
    ),
  ),
);

type ZustandContextMenu = {
  pane: { isOpen: boolean; x: number; y: number };
  selection: { isOpen: boolean; x: number; y: number; nodeIds: Array<string> };
  typeError: {
    isOpen: boolean;
    x: number;
    y: number;
    sectionId: string | null;
    paramInfoId: string | null;
  };
};

export const useContextMenus = withProjectState(
  createWithEqualityFn(
    withResetFn<ZustandContextMenu>(() => ({
      pane: { isOpen: false, x: 0, y: 0 },
      selection: { isOpen: false, x: 0, y: 0, nodeIds: [] },
      typeError: {
        isOpen: false,
        x: 0,
        y: 0,
        sectionId: null,
        paramInfoId: null,
      },
    })),
  ),
);

// useContextMenus.getState().

export type ZustandProjectState = SingleConfig & {
  previewSectionVariantMap: Record<string, string>;
};

export const NULL_PROJECT_CONFIG_ID = "null";

export const useProjectState = withProjectState(
  createWithEqualityFn(
    subscribeWithSelector(
      immer(
        withResetFn<ZustandProjectState>(() => ({
          projectConfig: createProjectConfig({ id: NULL_PROJECT_CONFIG_ID }),
          sections: {},
          sectionImpls: {},
          sectionCapabilities: {},
          sectionVariants: {},
          codeObjs: {},
          codeObjImpls: {},
          codeObjVariants: {},
          artifactGroups: {},
          singletonSections: createSingletonSections(),
          parentSectionMap: {},
          shownParamIds: {},
          projectChatWindowing: createProjectChatWindowingState(),
          previewSectionVariantMap: {},
          requiredDecodedImages: [],
        })),
      ),
    ),
  ),
);

type AppDefinitionState = {
  appDefinition: AppDefinition | null;
  appSpec: unknown | null;
};

export const useAppDefinition = withProjectState(
  createWithEqualityFn(
    withResetFn<AppDefinitionState>(() => ({
      appDefinition: null,
      appSpec: null,
    })),
  ),
);

type AppConfigState = ZustandProjectState;

type AppConfigsState = {
  configs: Record<string, AppConfigState>;
};

export const useAppConfigs = withProjectState(
  createWithEqualityFn(
    withResetFn<AppConfigsState>(() => ({
      configs: {},
    })),
  ),
);

type ShareSessionState = {
  isDeploymentMode: boolean;
  shareSessionId: string | null;
  sessionRunCount: number;
  sharePolicy: SharePolicy | null;
  shareDeploymentName: string | null;
  shareDeploymentVersion: string | null;
  deploymentMode: "share" | "app" | null;
};

export const useShareSession = withProjectState(
  createWithEqualityFn(
    withResetFn<ShareSessionState>(() => ({
      isDeploymentMode: false,
      shareSessionId: null,
      sessionRunCount: 0,
      sharePolicy: null,
      shareDeploymentName: null,
      shareDeploymentVersion: null,
      deploymentMode: null,
    })),
  ),
);

type ServerModeState = {
  mode: "ide" | "share" | "app" | "launcher" | null;
  modeResolved: boolean;
  modeError: string | null;
};

export const useServerMode = createWithEqualityFn<ServerModeState>(() => ({
  mode: null,
  modeResolved: false,
  modeError: null,
}));

type AppPreviewState = {
  isPreviewEnabled: boolean;
  previewConfigId: string | null;
  // Draft-only overrides used for live preview while editing App Config.
  // `undefined` means "no override"; `null` means "explicitly cleared".
  previewSpecOverride?: unknown | null;
  // AI-streaming override used while `setta__stream_app_definition` is streaming patches.
  aiPreviewSpecOverride?: unknown | null;
  previewThemeOverride?: unknown | null;
  previewAssetsOverride?: unknown[] | null;
};

export const useAppPreview = withProjectState(
  createWithEqualityFn(
    withResetFn<AppPreviewState>(() => ({
      isPreviewEnabled: false,
      previewConfigId: null,
      previewSpecOverride: undefined,
      aiPreviewSpecOverride: undefined,
      previewThemeOverride: undefined,
      previewAssetsOverride: undefined,
    })),
  ),
);

export const useAllProjectMetadata = createWithEqualityFn(
  withResetFn<AllProjectMetadata>(() => ({
    defaultProjectConfigId: null,
    projectMetadata: [],
  })),
);

export type PendingOperation = {
  opId: string;
  apply: (x: ZustandProjectState) => void;
  acknowledged: boolean;
};

type ZustandPendingOperations = {
  pending: Array<PendingOperation>;
};

export const usePendingOperations = withProjectState(
  createWithEqualityFn(
    withResetFn<ZustandPendingOperations>(() => ({ pending: [] })),
  ),
);

type ActiveSectionUIState = {
  activeIds: Array<string>;
  selectionGeneration: number;
  backendGeneration: number;
  backendHydrationEnabled: boolean;
  pendingBackendSyncOpIds: Array<string>;
  pendingBackendSyncGenerationByOpId: Record<string, number>;
  scheduledBackendSync: {
    projectConfigId: string;
    activeIds: Array<string>;
    generation: number;
  } | null;
};

export const useActiveSectionUI = withProjectState(
  createWithEqualityFn(
    subscribeWithSelector(
      withResetFn<ActiveSectionUIState>(() => ({
        activeIds: [],
        selectionGeneration: 0,
        backendGeneration: 0,
        backendHydrationEnabled: true,
        pendingBackendSyncOpIds: [],
        pendingBackendSyncGenerationByOpId: {},
        scheduledBackendSync: null,
      })),
    ),
  ),
);

export type ListenerCoverageRecord = {
  hasRealtimeWildcard: ListenerCoverageSnapshot["hasRealtimeWildcard"];
  dependenciesByKey: Record<string, BaseDependencyKeyUnion>;
};

type ListenerCoverageState = {
  byProjectId: Record<string, ListenerCoverageRecord>;
};

export const useListenerCoverage = withProjectState(
  createWithEqualityFn(
    immer(
      withResetFn<ListenerCoverageState>(() => ({
        byProjectId: {},
      })),
    ),
  ),
);

type ZustandRenameRefactors = {
  byOpId: Record<string, RenameRefactorBroadcastContent>;
  queue: Array<string>;
  readyOpIds: Record<string, boolean>;
};

export const useRenameRefactors = withProjectState(
  createWithEqualityFn(
    withResetFn<ZustandRenameRefactors>(() => ({
      byOpId: {},
      queue: [],
      readyOpIds: {},
    })),
  ),
);

export const useHomePageSearch = createWithEqualityFn(
  withResetFn(() => ({
    value: "",
  })),
);

type ZustandWaitingForLSPResult = {
  textFields: Record<string, boolean>;
  parametersRequest: Record<string, boolean>;
};

// keys for textFields are of the form:
// {sectionId}-null for the main section combobox
// {sectionId}-{paramInfoId} for section parameter fields
export const useWaitingForLSPResult = withProjectState(
  createWithEqualityFn(
    immer(
      withResetFn<ZustandWaitingForLSPResult>(() => ({
        textFields: {},
        parametersRequest: {},
      })),
    ),
  ),
);

type ZustandModalState = { open: boolean; modalInfo: ModalInfoType | null };

export const useModal = withProjectState(
  createWithEqualityFn(
    withResetFn<ZustandModalState>(() => ({
      open: false,
      modalInfo: null,
    })),
  ),
);

export type ZustandNodeInternalsState = { x: Map<string, Node> };

export const useNodeInternals = withProjectState(
  createWithEqualityFn(
    withResetFn<ZustandNodeInternalsState>(() => ({
      x: new Map(),
    })),
  ),
);

type AtomicallyPublishedProjectStoreState = {
  projectState: ZustandProjectState;
  nodeInternals: ZustandNodeInternalsState;
  activeSectionUI: ActiveSectionUIState;
};

let stagedProjectStorePublication: AtomicallyPublishedProjectStoreState | null =
  null;

function patchPublishedProjectStoreGetState<TState>(
  store: {
    getState: () => TState;
  },
  readRawState: () => TState,
  getPublishedState: (
    publication: AtomicallyPublishedProjectStoreState,
  ) => TState,
) {
  store.getState = (() => {
    const publication = stagedProjectStorePublication;
    if (publication !== null) {
      return getPublishedState(publication);
    }
    return readRawState();
  }) as typeof store.getState;
}

const readRawProjectState = useProjectState.getState.bind(useProjectState);
const readRawActiveSectionUIState =
  useActiveSectionUI.getState.bind(useActiveSectionUI);
const readRawNodeInternalsState =
  useNodeInternals.getState.bind(useNodeInternals);

patchPublishedProjectStoreGetState(
  useProjectState,
  readRawProjectState,
  (publication) => publication.projectState,
);
patchPublishedProjectStoreGetState(
  useActiveSectionUI,
  readRawActiveSectionUIState,
  (publication) => publication.activeSectionUI,
);
patchPublishedProjectStoreGetState(
  useNodeInternals,
  readRawNodeInternalsState,
  (publication) => publication.nodeInternals,
);

export function runWithAtomicallyPublishedProjectStores(
  nextState: {
    projectState: ZustandProjectState;
    nodeInternals: ZustandNodeInternalsState;
    activeSectionUI?: Partial<ActiveSectionUIState> | null;
  },
  fn: () => void,
) {
  const previousPublication = stagedProjectStorePublication;
  stagedProjectStorePublication = {
    projectState: nextState.projectState,
    nodeInternals: nextState.nodeInternals,
    activeSectionUI:
      nextState.activeSectionUI === null ||
      typeof nextState.activeSectionUI === "undefined"
        ? readRawActiveSectionUIState()
        : {
            ...readRawActiveSectionUIState(),
            ...nextState.activeSectionUI,
          },
  };
  try {
    fn();
  } finally {
    stagedProjectStorePublication = previousPublication;
  }
}

type ZustandNotificationState = { notifications: Array<SettaNotification> };

export const useNotifications = createWithEqualityFn(
  withResetFn<ZustandNotificationState>(() => ({
    notifications: [],
  })),
);

type FileBrowserState = {
  rootPath: string | null;
  selectedPath: string | null;
  expandedPaths: Record<string, boolean>;
  filterText: string;
  pathSeparator: string;
  ignorePatterns: string[];
  typeFilters: Record<FileBrowserTypeFilter, boolean>;
  searchScope: FileBrowserSearchScope;
};

export const useFileBrowserState = createWithEqualityFn(
  withResetFn<FileBrowserState>(() => ({
    rootPath: null,
    selectedPath: null,
    expandedPaths: {},
    filterText: "",
    pathSeparator: "/",
    ignorePatterns: [],
    typeFilters: { ...DEFAULT_FILE_BROWSER_TYPE_FILTERS },
    searchScope: "recursive",
  })),
);

export const useHomeFileBrowserState = createWithEqualityFn(
  withResetFn<FileBrowserState>(() => ({
    rootPath: null,
    selectedPath: null,
    expandedPaths: {},
    filterText: "",
    pathSeparator: "/",
    ignorePatterns: [],
    typeFilters: { ...DEFAULT_FILE_BROWSER_TYPE_FILTERS },
    searchScope: "recursive",
  })),
);

export const useBrowserSectionFileBrowserState = createWithEqualityFn(
  withResetFn<FileBrowserState>(() => ({
    rootPath: null,
    selectedPath: null,
    expandedPaths: {},
    filterText: "",
    pathSeparator: "/",
    ignorePatterns: [],
    typeFilters: { ...DEFAULT_FILE_BROWSER_TYPE_FILTERS },
    searchScope: "recursive",
  })),
);

export const useDropzoneFileBrowserState = createWithEqualityFn(
  withResetFn<FileBrowserState>(() => ({
    rootPath: null,
    selectedPath: null,
    expandedPaths: {},
    filterText: "",
    pathSeparator: "/",
    ignorePatterns: [],
    typeFilters: { ...DEFAULT_FILE_BROWSER_TYPE_FILTERS },
    searchScope: "recursive",
  })),
);

type RunMode = "once" | "continuous";
type RunSnapshotMode = SettingsState["backend"]["runSnapshotMode"];

export type CustomRunAction =
  | { type: "runCodeBlock"; sectionId: string | null }
  | { type: "triggerListenerForceRefresh" };

export type CustomRunItem = {
  id: string;
  name: string;
  includeInRunDropdown: boolean;
  runMode: RunMode;
  action: CustomRunAction;
};

export type ProjectChatCustomSlashCommand = {
  command: string;
  prompt: string;
  appGenerationMode: AppGenerationMode | null;
};

export type ProjectChatAuxView =
  | "none"
  | "skills"
  | "mcp"
  | "slash_commands"
  | "ai_settings";

function isPersistedRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizePersistedCustomProjectChatSlashCommandsByProjectConfigId(
  value: unknown,
): Record<string, Array<ProjectChatCustomSlashCommand>> {
  if (!isPersistedRecord(value)) {
    return {};
  }
  const normalized: Record<string, Array<ProjectChatCustomSlashCommand>> = {};
  for (const [projectConfigId, rawCommands] of Object.entries(value)) {
    const normalizedProjectConfigId = projectConfigId.trim();
    if (!normalizedProjectConfigId || !Array.isArray(rawCommands)) {
      continue;
    }
    const normalizedCommands: Array<ProjectChatCustomSlashCommand> = [];
    for (const rawCommand of rawCommands) {
      if (!isPersistedRecord(rawCommand)) {
        continue;
      }
      const commandValue = rawCommand.command;
      const promptValue = rawCommand.prompt;
      const appGenerationModeValue = rawCommand.appGenerationMode;
      if (typeof commandValue !== "string" || typeof promptValue !== "string") {
        continue;
      }
      const command = commandValue.trim();
      const prompt = promptValue.trim();
      if (!command || !prompt) {
        continue;
      }
      const appGenerationMode = parseAppGenerationMode(appGenerationModeValue);
      normalizedCommands.push({
        command,
        prompt,
        appGenerationMode,
      });
    }
    if (normalizedCommands.length === 0) {
      continue;
    }
    normalized[normalizedProjectConfigId] = normalizedCommands;
  }
  return normalized;
}

function normalizePersistedProjectChatDraftMessageByProjectConfigId(
  value: unknown,
): Record<string, string> {
  if (!isPersistedRecord(value)) {
    return {};
  }
  const normalized: Record<string, string> = {};
  for (const [projectConfigId, rawDraftMessage] of Object.entries(value)) {
    const normalizedProjectConfigId = projectConfigId.trim();
    if (!normalizedProjectConfigId || typeof rawDraftMessage !== "string") {
      continue;
    }
    if (rawDraftMessage === "") {
      continue;
    }
    normalized[normalizedProjectConfigId] = rawDraftMessage;
  }
  return normalized;
}

type ZustandRunControl = {
  runMode: RunMode;
  continuousRunStarted: boolean;
  continuousRunCustomRunId: string | null;
};

export const useRunControl = withProjectState(
  createWithEqualityFn(
    withResetFn<ZustandRunControl>(() => ({
      runMode: "once",
      continuousRunStarted: false,
      continuousRunCustomRunId: null,
    })),
  ),
);

type BackendLogSeverity = SettaBackendLogEvent["severity"];

export type BackendLogEventsFilter = {
  projectConfigId: string | null;
  minSeverity: BackendLogSeverity;
  query: string;
};

export const DEFAULT_BACKEND_LOG_EVENTS_FILTER: BackendLogEventsFilter = {
  projectConfigId: null,
  minSeverity: "info",
  query: "",
};

type BackendLogEventsState = {
  events: Array<SettaBackendLogEvent>;
  filter: BackendLogEventsFilter;
  unreadHighSeverityCount: number;
};

export const useBackendLogEvents = withProjectState(
  createWithEqualityFn(
    withResetFn<BackendLogEventsState>(() => ({
      events: [],
      filter: { ...DEFAULT_BACKEND_LOG_EVENTS_FILTER },
      unreadHighSeverityCount: 0,
    })),
  ),
);

export type ZustandProjectSearch = {
  codeInfo: Array<{
    sectionId: string;
    paramInfoId: string;
    name: string;
  }>;
  focused: {
    sectionId: string;
    paramInfoId: string;
    name: string;
  } | null;
  lookup: Set<string>;
  mode: ProjectSearchMode;
};

export const useProjectSearch = withProjectState(
  createWithEqualityFn(
    withResetFn<ZustandProjectSearch>(() => ({
      codeInfo: [],
      focused: null,
      lookup: new Set(),
      mode: ProjectSearchModeEnum.find,
    })),
  ),
);

export const useSectionRefs = withProjectState(
  createWithEqualityFn(
    subscribeWithSelector(
      immer(
        withResetFn(() => ({
          withNested: {},
          selfOnly: {},
        })),
      ),
    ),
  ),
);

export type EdgeHandleRecord = {
  sectionId: string;
  portId: string;
  type: HandleType;
  side: HandlePosition;
  element: HTMLElement | null;
};

type EdgeHandlePosition = {
  sectionId: string;
  portId: string;
  type: HandleType;
  side: HandlePosition;
  x: number;
  y: number;
};

type ZustandEdgeHandleRegistry = {
  handles: Record<string, EdgeHandleRecord>;
  positions: Record<string, EdgeHandlePosition>;
};

export const useEdgeHandleRegistry = withProjectState(
  createWithEqualityFn(
    immer(
      withResetFn<ZustandEdgeHandleRegistry>(() => ({
        handles: {},
        positions: {},
      })),
    ),
  ),
);

export const useSettings = createWithEqualityFn<SettingsState>(() =>
  createSettingsState(),
);

type ZustandTypeErrors = {
  userRequested: boolean;
  errors: Record<
    string,
    {
      callable: Array<string>;
      params: Record<string, Array<string>>;
    }
  >;
};

export const useTypeErrors = withProjectState(
  createWithEqualityFn(
    immer(
      withResetFn<ZustandTypeErrors>(() => ({
        userRequested: false,
        errors: {},
      })),
    ),
  ),
);

type ZustandLspDiagnostics = {
  codeSections: Record<string, Array<SettaLspDiagnostic>>;
  unmappedGenCode: Array<SettaLspDiagnostic>;
};

export const useLspDiagnostics = withProjectState(
  createWithEqualityFn(
    immer(
      withResetFn<ZustandLspDiagnostics>(() => ({
        codeSections: {},
        unmappedGenCode: [],
      })),
    ),
  ),
);

type ZustandNameValidationErrors = {
  pendingByProjectId: Record<string, SettaProjectNameValidationErrors>;
  projectErrors: Array<string>;
  sectionErrors: Record<string, Array<string>>;
  paramErrors: Record<string, Array<string>>;
};

export const useNameValidationErrors = withProjectState(
  createWithEqualityFn(
    immer(
      withResetFn<ZustandNameValidationErrors>(() => ({
        pendingByProjectId: {},
        projectErrors: [],
        sectionErrors: {},
        paramErrors: {},
      })),
    ),
  ),
);

type ZustandWebsocketConnectionList = {
  connections: Array<WebsocketConnectionInfo>;
};

export const useWebsocketConnectionList = createWithEqualityFn(
  withResetFn<ZustandWebsocketConnectionList>(() => ({
    connections: [],
  })),
);

export const useTemporaryMiscState = withProjectState(
  createWithEqualityFn(subscribeWithSelector(withResetFn(() => ({})))),
);

export const useProjectLoading = createWithEqualityFn(
  withResetFn(() => ({ projectIsLoading: false, projectIs404: false })),
);

export const useMisc = withProjectState(
  createWithEqualityFn(
    subscribeWithSelector(
      withResetFn(() => ({
        isPanScrolling: false,
        lastMouseDownLocation: null,
        lastMouseUpLocation: null,
        mouseDownDrawArea: false,
        mouseDownDraggingSection: false,
        lastPaneClickLocation: { x: 0, y: 0 },
        undoOrRedoWasTriggered: false,
        isSelectingParams: false,
        numDisplayedCodeAreas: 0,
        numInitializedCodeAreas: 0,
        requestUpdateNodeDimensions: false,
        updateAllDrawAreas: 0,
        updateDrawArea: {}, // sectionId to number that increments every time we want to update
        projectChatTrackedGitPaneGraphWindowInstanceId: null as string | null,
        projectChatGitGraphEmbeddedPaneVisibleByInstanceId: {} as Record<
          string,
          true
        >,
      })),
    ),
  ),
);

export type ChatDetails = {
  messages: Array<BaseChatMessageUnion>;
  toolCallArguments: Record<string, string>;
  waitingForResponse: boolean;
  llmConfig: LLMConfig | null;
  contextUsage: {
    contextWindowTokens: number | null;
    contextUsedTokens: number | null;
    estimated: boolean;
  } | null;
};

export type ChatBranchInfo = {
  chatId: string;
  branchParentChatId: string | null;
  branchFromMessageId: string | null;
  branchRootChatId: string | null;
  branchCreatedAt: number | null;
};

type ZustandAIStore = {
  apiKeys: APIKeys;
  apiKeysRevision: number;
  apiKeysAuthoritative: boolean;
  apiKeysInitialLoadComplete: boolean;
  apiKeysLoadError: string | null;
  activeChatId: string | null | undefined;
  projectChatSelectedEngineId: string | null;
  chatDetails: Record<string, ChatDetails>;
  pendingChatDetailsBySurfaceId: Record<string, ChatDetails>;
  chatAppGenerationDetailsByChatId: Record<string, ChatAppGenerationDetails>;
  pendingChatAppGenerationDetailsBySurfaceId: Record<
    string,
    ChatAppGenerationDetails
  >;
  interruptedAssistantMessageIdsByChatId: Record<string, Record<string, true>>;
  viewThreads: boolean;
  projectChatThreadsExplicitlyClosedAtLargeWidth: boolean;
  projectChatActivityAccordionOpenByDefault: boolean;
  projectChatActivityChildrenOpenByDefault: boolean;
  allLLMConfigs: AllLLMConfigs | null;
  allLLMConfigsInitialLoadComplete: boolean;
  allLLMConfigsLoadError: string | null;
  agentProfiles: Array<AgentProfile>;
  agentProfilesInitialLoadComplete: boolean;
  agentProfilesLoadError: string | null;
  agentProfilesLoading: boolean;
  agentRuns: Array<AgentRun>;
  agentRunsAuthorityState:
    | "loading"
    | "ready"
    | "transient_error"
    | "terminal_error";
  agentRunsInitialLoadComplete: boolean;
  agentRunsLoadError: string | null;
  promptTemplates: Array<PromptTemplate>;
  promptTemplatesInitialLoadComplete: boolean;
  promptTemplatesLoadError: string | null;
  promptTemplatesLoading: boolean;
  externalAgentConfigs: Array<ExternalAgentConfig>;
  externalAgentConfigsInitialLoadComplete: boolean;
  externalAgentConfigsLoadError: string | null;
  externalAgentConfigsLoading: boolean;
  externalAgentHealth: Array<ExternalAgentPreflightStatus>;
  externalAgentHealthInitialLoadComplete: boolean;
  externalAgentHealthLoadError: string | null;
  externalAgentHealthLoading: boolean;
  engineConfigs: Array<EngineConfig>;
  engineConfigsInitialLoadComplete: boolean;
  engineConfigsLoadError: string | null;
  engineConfigsLoading: boolean;
  transcriptionProfiles: Array<TranscriptionProfile>;
  transcriptionProfilesInitialLoadComplete: boolean;
  transcriptionProfilesLoadError: string | null;
  transcriptionProfilesLoading: boolean;
  pendingProjectChatPrompt: string | null;
  projectChatDictationMode: "auto" | "browser" | "provider";
  projectChatTranscriptionProfileId: string | null;
};

export const useAIStore = createWithEqualityFn<ZustandAIStore>()(
  // @ts-expect-error Zustand's persist function doesn't work well with types
  subscribeWithSelector(
    persist(
      () => ({
        // State
        apiKeys: {},
        apiKeysRevision: 0,
        apiKeysAuthoritative: false,
        apiKeysInitialLoadComplete: false,
        apiKeysLoadError: null,
        activeChatId: undefined,
        projectChatSelectedEngineId: null,
        chatDetails: {},
        pendingChatDetailsBySurfaceId: {},
        chatAppGenerationDetailsByChatId: {},
        pendingChatAppGenerationDetailsBySurfaceId: {},
        interruptedAssistantMessageIdsByChatId: {},
        viewThreads: false,
        projectChatThreadsExplicitlyClosedAtLargeWidth: false,
        projectChatActivityAccordionOpenByDefault: false,
        projectChatActivityChildrenOpenByDefault: false,
        allLLMConfigs: null,
        allLLMConfigsInitialLoadComplete: false,
        allLLMConfigsLoadError: null,
        agentProfiles: [],
        agentProfilesInitialLoadComplete: false,
        agentProfilesLoadError: null,
        agentProfilesLoading: false,
        agentRuns: [],
        agentRunsAuthorityState: "loading",
        agentRunsInitialLoadComplete: false,
        agentRunsLoadError: null,
        promptTemplates: [],
        promptTemplatesInitialLoadComplete: false,
        promptTemplatesLoadError: null,
        promptTemplatesLoading: false,
        externalAgentConfigs: [],
        externalAgentConfigsInitialLoadComplete: false,
        externalAgentConfigsLoadError: null,
        externalAgentConfigsLoading: false,
        externalAgentHealth: [],
        externalAgentHealthInitialLoadComplete: false,
        externalAgentHealthLoadError: null,
        externalAgentHealthLoading: false,
        engineConfigs: [],
        engineConfigsInitialLoadComplete: false,
        engineConfigsLoadError: null,
        engineConfigsLoading: false,
        transcriptionProfiles: [],
        transcriptionProfilesInitialLoadComplete: false,
        transcriptionProfilesLoadError: null,
        transcriptionProfilesLoading: false,
        pendingProjectChatPrompt: null,
        projectChatDictationMode: "auto",
        projectChatTranscriptionProfileId: null,
      }),
      {
        name: "setta_ai_data",
        merge: (persistedState, currentState) => {
          const persisted =
            (persistedState as Partial<ZustandAIStore> | null) ?? {};
          return {
            ...currentState,
            ...persisted,
          };
        },
        partialize: (state) => ({
          viewThreads: state.viewThreads,
          projectChatThreadsExplicitlyClosedAtLargeWidth:
            state.projectChatThreadsExplicitlyClosedAtLargeWidth,
          projectChatActivityAccordionOpenByDefault:
            state.projectChatActivityAccordionOpenByDefault,
          projectChatActivityChildrenOpenByDefault:
            state.projectChatActivityChildrenOpenByDefault,
          projectChatDictationMode: state.projectChatDictationMode,
          projectChatTranscriptionProfileId:
            state.projectChatTranscriptionProfileId,
          projectChatSelectedEngineId: state.projectChatSelectedEngineId,
        }),
        storage: getPersistStorage(),
      },
    ),
  ),
);

type AIFollowState = {
  mode: AIFollowMode;
  isFollowTransitioning: boolean;
  toolArgumentsIdsByProjectConfigId: Record<
    string,
    Record<string, Record<string, Array<string>>>
  >;
  toolResultIdsByProjectConfigId: Record<
    string,
    Record<string, Record<string, Array<string>>>
  >;
  selectedChatIdsByProjectConfigId: Record<string, Array<string>>;
  selectedSectionIdsByProjectConfigId: Record<string, Array<string>>;
  scopeViolationEdgesByProjectConfigId: Record<
    string,
    Array<AgenticScopeViolationEdge>
  >;
};

export const useAIFollow = withProjectState(
  createWithEqualityFn(
    immer(
      withResetFn<AIFollowState>(() => ({
        mode: "all",
        isFollowTransitioning: false,
        toolArgumentsIdsByProjectConfigId: {},
        toolResultIdsByProjectConfigId: {},
        selectedChatIdsByProjectConfigId: {},
        selectedSectionIdsByProjectConfigId: {},
        scopeViolationEdgesByProjectConfigId: {},
      })),
    ),
  ),
);

export type AgenticScopeViolationEdge = {
  sourceSectionId: string;
  targetSectionId: string;
  kind: AgenticEdgeKindEnum;
};

type AgenticScopeHighlightsState = {
  readSectionIdsByProjectConfigId: Record<string, Record<string, true>>;
  writeSectionIdsByProjectConfigId: Record<string, Record<string, true>>;
};

export const useAgenticScopeHighlights = withProjectState(
  createWithEqualityFn(
    immer(
      withResetFn<AgenticScopeHighlightsState>(() => ({
        readSectionIdsByProjectConfigId: {},
        writeSectionIdsByProjectConfigId: {},
      })),
    ),
  ),
);

export type ToolArgumentPreviewEntry = {
  value: string;
  toolCallId: string;
};

export type ToolArgumentPreviewProjectState = {
  previewCodeBySectionId: Record<string, ToolArgumentPreviewEntry>;
  previewParamValueBySectionAndParamId: Record<
    string,
    Record<string, ToolArgumentPreviewEntry>
  >;
  previewCallableNameBySectionId: Record<string, ToolArgumentPreviewEntry>;
};

type ToolArgumentPreviewState = {
  byProjectConfigId: Record<string, ToolArgumentPreviewProjectState>;
};

export const useToolArgumentPreview = withProjectState(
  createWithEqualityFn(
    immer(
      withResetFn<ToolArgumentPreviewState>(() => ({
        byProjectConfigId: {},
      })),
    ),
  ),
);

export type ColorModePreference = "dark" | "light" | "auto";
export type HomeProjectGalleryViewMode = "thumbnails" | "list";
type MiniMapSide = "left" | "right";

type ZustandLocalStorage = {
  snapToGrid: boolean;
  showAgenticEdges: boolean;
  showArgEdges: boolean;
  chatSharedEdgeMode: ChatSharedEdgeMode;
  darkMode: boolean;
  colorMode: ColorModePreference;
  showMinimap: boolean;
  minimapSide: MiniMapSide;
  projectConfigPreviewEnabled: boolean;
  homeProjectGalleryViewMode: HomeProjectGalleryViewMode;
  favoriteProjectConfigIds: string[];
  overviewProjectConfigOrder: string[];
  homeWorkspacePaneVis: boolean;
  homeWorkspacePaneWidth: number;
  homeWorkspacePaneTrueWidth: number;
  homeSelectedProjectPaneVis: boolean;
  homeSelectedProjectPaneWidth: number;
  homeSelectedProjectPaneTrueWidth: number;
  overviewVis: boolean;
  overviewWidth: number;
  overviewTrueWidth: number;
  overviewTab: OverviewTabKey;
  overviewNotificationsPaneTab: OverviewNotificationsPaneTab;
  watchCodePortalOpen: boolean;
  gitGraphSplitPct: number;
  gitGraphColWidthPx: number;
  gitGraphAuthorWidthPx: number;
  gitGraphDateWidthPx: number;
  gitGraphHashWidthPx: number;
  uiEditorVis: boolean;
  uiEditorWidth: number;
  uiEditorTrueWidth: number;
  uiEditorTab: UIEditorTabLocalStorage;
  showNavBarHelpMessage: boolean;
  tooltipWidth: number;
  customRunsByProjectConfigId: Record<string, Array<CustomRunItem>>;
  customProjectChatSlashCommandsByProjectConfigId: Record<
    string,
    Array<ProjectChatCustomSlashCommand>
  >;
  projectChatDraftMessageByProjectConfigId: Record<string, string>;
  projectChatAuxViewByProjectConfigId: Record<string, ProjectChatAuxView>;
  runSnapshotModeByProjectConfigId: Record<string, RunSnapshotMode>;
  runInstructionsAccordionOpenValuesByProjectConfigId: Record<
    string,
    Array<string>
  >;
  projectAiSettingsAccordionOpenValuesByProjectConfigId: Record<
    string,
    Array<string>
  >;
  viewedProjectChatThreadIdsByProjectConfigId: Record<string, Array<string>>;
  projectChatThreadGroupsByProjectConfigId: Record<
    string,
    Array<{
      id: string;
      name: string;
      collapsed: boolean;
      pinned?: boolean;
    }>
  >;
  projectChatThreadAssignmentsByProjectConfigId: Record<
    string,
    Record<string, string>
  >;
  projectChatThreadOrderByProjectConfigId: Record<string, Array<string>>;
  pinnedProjectChatThreadIdsByProjectConfigId: Record<string, Array<string>>;
  trashedProjectChatThreadIdsByProjectConfigId: Record<string, Array<string>>;
};

export const useLocalStorage = createWithEqualityFn(
  persist<ZustandLocalStorage>(
    () => ({
      snapToGrid: true,
      showAgenticEdges: true,
      showArgEdges: true,
      chatSharedEdgeMode: "agentic",
      darkMode: true,
      colorMode: "dark",
      showMinimap: true,
      minimapSide: "left",
      projectConfigPreviewEnabled: true,
      homeProjectGalleryViewMode: "thumbnails",
      favoriteProjectConfigIds: [],
      overviewProjectConfigOrder: [],
      homeWorkspacePaneVis: true,
      homeWorkspacePaneWidth: 320,
      homeWorkspacePaneTrueWidth: 320,
      homeSelectedProjectPaneVis: true,
      homeSelectedProjectPaneWidth: 280,
      homeSelectedProjectPaneTrueWidth: 280,
      overviewVis: true,
      overviewWidth: INITIAL_OVERVIEW_WIDTH,
      overviewTrueWidth: INITIAL_OVERVIEW_WIDTH,
      overviewTab: OverviewTabNameEnum.Overview,
      overviewNotificationsPaneTab:
        OverviewNotificationsPaneTabEnum.Notifications,
      watchCodePortalOpen: false,
      gitGraphSplitPct: DEFAULT_GIT_GRAPH_SPLIT_PCT,
      gitGraphColWidthPx: DEFAULT_GIT_GRAPH_COL_WIDTH_PX,
      gitGraphAuthorWidthPx: DEFAULT_GIT_GRAPH_AUTHOR_WIDTH_PX,
      gitGraphDateWidthPx: DEFAULT_GIT_GRAPH_DATE_WIDTH_PX,
      gitGraphHashWidthPx: DEFAULT_GIT_GRAPH_HASH_WIDTH_PX,
      uiEditorVis: false,
      uiEditorWidth: INITIAL_UI_EDITOR_WIDTH,
      uiEditorTrueWidth: CLOSED_PANE_WIDTH,
      uiEditorTab: {},
      showNavBarHelpMessage: true,
      tooltipWidth: 256,
      customRunsByProjectConfigId: {},
      customProjectChatSlashCommandsByProjectConfigId: {},
      projectChatDraftMessageByProjectConfigId: {},
      projectChatAuxViewByProjectConfigId: {},
      runSnapshotModeByProjectConfigId: {},
      runInstructionsAccordionOpenValuesByProjectConfigId: {},
      projectAiSettingsAccordionOpenValuesByProjectConfigId: {},
      viewedProjectChatThreadIdsByProjectConfigId: {},
      projectChatThreadGroupsByProjectConfigId: {},
      projectChatThreadAssignmentsByProjectConfigId: {},
      projectChatThreadOrderByProjectConfigId: {},
      pinnedProjectChatThreadIdsByProjectConfigId: {},
      trashedProjectChatThreadIdsByProjectConfigId: {},
    }),
    {
      name: "setta_data", // Same prefix as in your custom implementation
      merge: (persistedState, currentState) => {
        const persisted =
          (persistedState as Partial<ZustandLocalStorage> | null) ?? {};
        const merged = {
          ...currentState,
          ...persisted,
        };

        if (persisted.colorMode === undefined) {
          merged.colorMode = merged.darkMode ? "dark" : "light";
        }
        if (
          merged.homeProjectGalleryViewMode !== "thumbnails" &&
          merged.homeProjectGalleryViewMode !== "list"
        ) {
          merged.homeProjectGalleryViewMode = "thumbnails";
        }
        if (
          merged.chatSharedEdgeMode !== "agentic" &&
          merged.chatSharedEdgeMode !== "workflow"
        ) {
          merged.chatSharedEdgeMode = "agentic";
        }
        if (!Array.isArray(merged.favoriteProjectConfigIds)) {
          merged.favoriteProjectConfigIds = [];
        }
        if (!Array.isArray(merged.overviewProjectConfigOrder)) {
          merged.overviewProjectConfigOrder = [];
        }
        if (typeof merged.homeWorkspacePaneVis !== "boolean") {
          merged.homeWorkspacePaneVis = true;
        }
        if (typeof merged.homeWorkspacePaneWidth !== "number") {
          merged.homeWorkspacePaneWidth = 320;
        }
        if (typeof merged.homeWorkspacePaneTrueWidth !== "number") {
          merged.homeWorkspacePaneTrueWidth = 320;
        }
        if (typeof merged.homeSelectedProjectPaneVis !== "boolean") {
          merged.homeSelectedProjectPaneVis = true;
        }
        if (typeof merged.homeSelectedProjectPaneWidth !== "number") {
          merged.homeSelectedProjectPaneWidth = 280;
        }
        if (typeof merged.homeSelectedProjectPaneTrueWidth !== "number") {
          merged.homeSelectedProjectPaneTrueWidth = 280;
        }
        if (!isOverviewTabKey(merged.overviewTab)) {
          merged.overviewTab = OverviewTabNameEnum.Overview;
        }
        if (
          merged.overviewNotificationsPaneTab !==
            OverviewNotificationsPaneTabEnum.Notifications &&
          merged.overviewNotificationsPaneTab !==
            OverviewNotificationsPaneTabEnum.BackendLogs
        ) {
          merged.overviewNotificationsPaneTab =
            OverviewNotificationsPaneTabEnum.Notifications;
        }
        // Keep transient visibility session-local even though the store itself
        // is persisted for durable preferences.
        merged.watchCodePortalOpen = false;
        merged.customProjectChatSlashCommandsByProjectConfigId =
          normalizePersistedCustomProjectChatSlashCommandsByProjectConfigId(
            merged.customProjectChatSlashCommandsByProjectConfigId,
          );
        merged.projectChatDraftMessageByProjectConfigId =
          normalizePersistedProjectChatDraftMessageByProjectConfigId(
            merged.projectChatDraftMessageByProjectConfigId,
          );
        merged.projectChatAuxViewByProjectConfigId = {};
        if (
          !merged.viewedProjectChatThreadIdsByProjectConfigId ||
          typeof merged.viewedProjectChatThreadIdsByProjectConfigId !==
            "object" ||
          Array.isArray(merged.viewedProjectChatThreadIdsByProjectConfigId)
        ) {
          merged.viewedProjectChatThreadIdsByProjectConfigId = {};
        }
        if (
          !merged.projectChatThreadGroupsByProjectConfigId ||
          typeof merged.projectChatThreadGroupsByProjectConfigId !== "object" ||
          Array.isArray(merged.projectChatThreadGroupsByProjectConfigId)
        ) {
          merged.projectChatThreadGroupsByProjectConfigId = {};
        }
        if (
          !merged.projectChatThreadAssignmentsByProjectConfigId ||
          typeof merged.projectChatThreadAssignmentsByProjectConfigId !==
            "object" ||
          Array.isArray(merged.projectChatThreadAssignmentsByProjectConfigId)
        ) {
          merged.projectChatThreadAssignmentsByProjectConfigId = {};
        }
        if (
          !merged.projectChatThreadOrderByProjectConfigId ||
          typeof merged.projectChatThreadOrderByProjectConfigId !== "object" ||
          Array.isArray(merged.projectChatThreadOrderByProjectConfigId)
        ) {
          merged.projectChatThreadOrderByProjectConfigId = {};
        }
        if (
          !merged.pinnedProjectChatThreadIdsByProjectConfigId ||
          typeof merged.pinnedProjectChatThreadIdsByProjectConfigId !==
            "object" ||
          Array.isArray(merged.pinnedProjectChatThreadIdsByProjectConfigId)
        ) {
          merged.pinnedProjectChatThreadIdsByProjectConfigId = {};
        }
        if (
          !merged.trashedProjectChatThreadIdsByProjectConfigId ||
          typeof merged.trashedProjectChatThreadIdsByProjectConfigId !==
            "object" ||
          Array.isArray(merged.trashedProjectChatThreadIdsByProjectConfigId)
        ) {
          merged.trashedProjectChatThreadIdsByProjectConfigId = {};
        }
        return merged;
      },
      partialize: (state) => ({
        snapToGrid: state.snapToGrid,
        showAgenticEdges: state.showAgenticEdges,
        showArgEdges: state.showArgEdges,
        chatSharedEdgeMode: state.chatSharedEdgeMode,
        darkMode: state.darkMode,
        colorMode: state.colorMode,
        showMinimap: state.showMinimap,
        projectConfigPreviewEnabled: state.projectConfigPreviewEnabled,
        homeProjectGalleryViewMode: state.homeProjectGalleryViewMode,
        favoriteProjectConfigIds: state.favoriteProjectConfigIds,
        overviewProjectConfigOrder: state.overviewProjectConfigOrder,
        homeWorkspacePaneVis: state.homeWorkspacePaneVis,
        homeWorkspacePaneWidth: state.homeWorkspacePaneWidth,
        homeWorkspacePaneTrueWidth: state.homeWorkspacePaneTrueWidth,
        homeSelectedProjectPaneVis: state.homeSelectedProjectPaneVis,
        homeSelectedProjectPaneWidth: state.homeSelectedProjectPaneWidth,
        homeSelectedProjectPaneTrueWidth:
          state.homeSelectedProjectPaneTrueWidth,
        overviewVis: state.overviewVis,
        overviewWidth: state.overviewWidth,
        overviewTrueWidth: state.overviewTrueWidth,
        overviewTab: state.overviewTab,
        overviewNotificationsPaneTab: state.overviewNotificationsPaneTab,
        gitGraphSplitPct: state.gitGraphSplitPct,
        gitGraphColWidthPx: state.gitGraphColWidthPx,
        gitGraphAuthorWidthPx: state.gitGraphAuthorWidthPx,
        gitGraphDateWidthPx: state.gitGraphDateWidthPx,
        gitGraphHashWidthPx: state.gitGraphHashWidthPx,
        uiEditorVis: state.uiEditorVis,
        uiEditorWidth: state.uiEditorWidth,
        uiEditorTrueWidth: state.uiEditorTrueWidth,
        uiEditorTab: state.uiEditorTab,
        showNavBarHelpMessage: state.showNavBarHelpMessage,
        tooltipWidth: state.tooltipWidth,
        customRunsByProjectConfigId: state.customRunsByProjectConfigId,
        customProjectChatSlashCommandsByProjectConfigId:
          state.customProjectChatSlashCommandsByProjectConfigId,
        projectChatDraftMessageByProjectConfigId:
          state.projectChatDraftMessageByProjectConfigId,
        runSnapshotModeByProjectConfigId:
          state.runSnapshotModeByProjectConfigId,
        runInstructionsAccordionOpenValuesByProjectConfigId:
          state.runInstructionsAccordionOpenValuesByProjectConfigId,
        projectAiSettingsAccordionOpenValuesByProjectConfigId:
          state.projectAiSettingsAccordionOpenValuesByProjectConfigId,
        viewedProjectChatThreadIdsByProjectConfigId:
          state.viewedProjectChatThreadIdsByProjectConfigId,
        projectChatThreadGroupsByProjectConfigId:
          state.projectChatThreadGroupsByProjectConfigId,
        projectChatThreadAssignmentsByProjectConfigId:
          state.projectChatThreadAssignmentsByProjectConfigId,
        projectChatThreadOrderByProjectConfigId:
          state.projectChatThreadOrderByProjectConfigId,
        pinnedProjectChatThreadIdsByProjectConfigId:
          state.pinnedProjectChatThreadIdsByProjectConfigId,
        trashedProjectChatThreadIdsByProjectConfigId:
          state.trashedProjectChatThreadIdsByProjectConfigId,
      }),
      storage: getPersistStorage(),
    },
  ),
);

export type RevisionedArtifacts<T> = {
  x: T;
  revisionById: Record<string, number>;
  localRevisionById: Record<string, Record<string, number>>;
};

export type ZustandImages = RevisionedArtifacts<ImageMapping>;

export const useImages = createWithEqualityFn(
  subscribeWithSelector(
    withResetFn<ZustandImages>(() => ({
      x: {},
      revisionById: {},
      localRevisionById: {},
    })),
  ),
);

type ZustandChartData = RevisionedArtifacts<ChartDataMapping>;

export const useChartData = createWithEqualityFn(
  withResetFn<ZustandChartData>(() => ({
    x: {},
    revisionById: {},
    localRevisionById: {},
  })),
);

export type ZustandDecodedImages = RevisionedArtifacts<
  Record<string, HTMLImageElement>
>;

export const useDecodedImages = createWithEqualityFn(
  withResetFn<ZustandDecodedImages>(() => ({
    x: {},
    revisionById: {},
    localRevisionById: {},
  })),
);

type ZustandBrushStrokes = RevisionedArtifacts<BrushStrokeMapping>;

export const useBrushStrokes = createWithEqualityFn(
  withResetFn<ZustandBrushStrokes>(() => ({
    x: {},
    revisionById: {},
    localRevisionById: {},
  })),
);

type ZustandDrawAreaLayerItemTransform = {
  x: DrawAreaLayerItemTransformMapping;
  revisionById: Record<string, number>;
  localRevisionById: Record<string, Record<string, number>>;
};

export const useDrawAreaLayerItemTransform = createWithEqualityFn(
  immer(
    withResetFn<ZustandDrawAreaLayerItemTransform>(() => ({
      x: {},
      revisionById: {},
      localRevisionById: {},
    })),
  ),
);
