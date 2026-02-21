import { ModalInfoType } from "components/Modals/types";
import { HandlePosition, HandleType, Node } from "forks/xyflow/core/types";
import type { AIFollowMode } from "state/types/aiFollow";
import type { AppGenerationMode } from "state/types/appGenerationMode";
import {
  CLOSED_PANE_WIDTH,
  INITIAL_OVERVIEW_WIDTH,
  INITIAL_UI_EDITOR_WIDTH,
  isOverviewTabKey,
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
  createProjectConfig,
  createSingletonSections,
  DrawAreaLayerItemTransformMapping,
  EngineConfig,
  ExternalAgentConfig,
  ExternalAgentPreflightStatus,
  ImageMapping,
  ListenerCoverageSnapshot,
  LLMConfig,
  ProjectStateSingleConfig,
  PromptTemplate,
  RenameRefactorBroadcastContent,
  SettaBackendLogEvent,
  SettaLspDiagnostic,
  SettaNotification,
  SettaProjectNameValidationErrors,
  SettingsState,
  SharePolicy,
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

export type ZustandProjectState = ProjectStateSingleConfig & {
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
          sectionVariants: {},
          codeObjs: {},
          codeObjImpls: {},
          codeObjVariants: {},
          artifactGroups: {},
          singletonSections: createSingletonSections(),
          parentSectionMap: {},
          shownParamIds: {},
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
  mode: "ide" | "share" | "app" | null;
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

const useArtifacts = withProjectState(
  createWithEqualityFn(
    subscribeWithSelector(withResetFn(() => ({ x: {}, namePathTypeToId: {} }))),
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

export const useSettings = createWithEqualityFn<SettingsState>(() => ({}));

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
      })),
    ),
  ),
);

export type ChatDetails = {
  messages: Array<BaseChatMessageUnion>;
  toolCallArguments: Record<string, string>;
  waitingForResponse: boolean;
  llmConfig: LLMConfig | null;
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
  apiKeysInitialLoadComplete: boolean;
  apiKeysLoadError: string | null;
  activeChatId: string | null | undefined;
  projectChatSelectedEngineId: string | null;
  chatDetails: Record<string, ChatDetails>;
  pendingChatDetails: ChatDetails | null;
  viewHistory: boolean;
  allLLMConfigs: AllLLMConfigs | null;
  allLLMConfigsInitialLoadComplete: boolean;
  allLLMConfigsLoadError: string | null;
  agentProfiles: Array<AgentProfile>;
  agentProfilesInitialLoadComplete: boolean;
  agentProfilesLoadError: string | null;
  agentProfilesLoading: boolean;
  agentRuns: Array<AgentRun>;
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
  pendingProjectChatPrompt: string | null;
  projectChatDictationMode: "auto" | "browser" | "provider";
};

export const useAIStore = createWithEqualityFn<ZustandAIStore>()(
  // @ts-expect-error Zustand's persist function doesn't work well with types
  subscribeWithSelector(
    persist(
      () => ({
        // State
        apiKeys: {},
        apiKeysInitialLoadComplete: false,
        apiKeysLoadError: null,
        activeChatId: undefined,
        projectChatSelectedEngineId: null,
        chatDetails: {},
        pendingChatDetails: null,
        viewHistory: false,
        allLLMConfigs: null,
        allLLMConfigsInitialLoadComplete: false,
        allLLMConfigsLoadError: null,
        agentProfiles: [],
        agentProfilesInitialLoadComplete: false,
        agentProfilesLoadError: null,
        agentProfilesLoading: false,
        agentRuns: [],
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
        pendingProjectChatPrompt: null,
        projectChatDictationMode: "auto",
      }),
      {
        name: "setta_ai_data",
        partialize: (state) => ({
          viewHistory: state.viewHistory,
          projectChatDictationMode: state.projectChatDictationMode,
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
        mode: "off",
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

type ZustandLocalStorage = {
  snapToGrid: boolean;
  showAgenticEdges: boolean;
  showArgEdges: boolean;
  darkMode: boolean;
  colorMode: ColorModePreference;
  showMinimap: boolean;
  projectConfigPreviewEnabled: boolean;
  appSpecStreamingEnabled: boolean;
  homeProjectGalleryViewMode: HomeProjectGalleryViewMode;
  favoriteProjectConfigIds: string[];
  overviewProjectConfigOrder: string[];
  homePageLeftColumnWidth: number;
  homePageRightColumnWidth: number;
  appGenerationMode: AppGenerationMode;
  appGenerationPrompt: string;
  appGenerationReferenceImageUrl: string;
  appGenerationReferenceImageNotes: string;
  overviewVis: boolean;
  overviewWidth: number;
  overviewTrueWidth: number;
  overviewTab: OverviewTabKey;
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
  runSnapshotModeByProjectConfigId: Record<string, RunSnapshotMode>;
  runInstructionsAccordionOpenValuesByProjectConfigId: Record<
    string,
    Array<string>
  >;
  projectAiSettingsAccordionOpenValuesByProjectConfigId: Record<
    string,
    Array<string>
  >;
};

export const useLocalStorage = createWithEqualityFn(
  persist<ZustandLocalStorage>(
    () => ({
      snapToGrid: true,
      showAgenticEdges: true,
      showArgEdges: true,
      darkMode: true,
      colorMode: "dark",
      showMinimap: true,
      projectConfigPreviewEnabled: true,
      appSpecStreamingEnabled: false,
      homeProjectGalleryViewMode: "thumbnails",
      favoriteProjectConfigIds: [],
      overviewProjectConfigOrder: [],
      homePageLeftColumnWidth: 320,
      homePageRightColumnWidth: 280,
      appGenerationMode: "json_render",
      appGenerationPrompt: "",
      appGenerationReferenceImageUrl: "",
      appGenerationReferenceImageNotes: "",
      overviewVis: true,
      overviewWidth: INITIAL_OVERVIEW_WIDTH,
      overviewTrueWidth: INITIAL_OVERVIEW_WIDTH,
      overviewTab: OverviewTabNameEnum.Overview,
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
      runSnapshotModeByProjectConfigId: {},
      runInstructionsAccordionOpenValuesByProjectConfigId: {},
      projectAiSettingsAccordionOpenValuesByProjectConfigId: {},
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
        if (!Array.isArray(merged.favoriteProjectConfigIds)) {
          merged.favoriteProjectConfigIds = [];
        }
        if (!Array.isArray(merged.overviewProjectConfigOrder)) {
          merged.overviewProjectConfigOrder = [];
        }
        if (typeof merged.homePageLeftColumnWidth !== "number") {
          merged.homePageLeftColumnWidth = 320;
        }
        if (typeof merged.homePageRightColumnWidth !== "number") {
          merged.homePageRightColumnWidth = 280;
        }
        if (!isOverviewTabKey(merged.overviewTab)) {
          merged.overviewTab = OverviewTabNameEnum.Overview;
        }

        return merged;
      },
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
