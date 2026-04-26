import { ModalInfoType } from "components/Modals/types";
import { HandlePosition, HandleType, Node } from "forks/xyflow/core/types";
import type {
  HttpapiExternalAgentPreflightStatus,
  HttpapiLlmapiKeysSnapshot,
} from "openapi/http";
import type { ChatSharedEdgeMode } from "state/actions/chatSharedHandleIds";
import type { AIFollowMode } from "state/types/aiFollow";
import {
  parseAppGenerationMode,
  type AppGenerationMode,
} from "state/types/appGenerationMode";
import type { SettaProjectNameValidationErrors } from "state/types/nameValidation";
import type { AppNotification } from "state/types/notifications";
import type { ChatAppGenerationDetails } from "state/utils/chatAppGeneration";
import {
  CLOSED_PANE_WIDTH,
  INITIAL_OVERVIEW_WIDTH,
  INITIAL_UI_EDITOR_WIDTH,
  isOverviewTabKey,
  OverviewNotificationsPaneTab,
  OverviewNotificationsPaneTabEnum,
  OverviewTabKey,
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
  AllConfigs,
  AllProjectMetadata,
  BaseChatMessageUnion,
  BaseDependencyKeyUnion,
  ChatDictationModeEnum,
  Connection,
  createProjectChatWindowingState,
  createProjectConfig,
  createSettingsState,
  createSingletonSections,
  EngineConfig,
  ExternalAgentConfig,
  ListenerCoverageSnapshot,
  LLMConfig,
  LSPDiagnostic,
  OverviewTabUIConfig,
  Policy,
  RenameRefactorBroadcastContent,
  SettingsState,
  SingleConfig,
  Template,
  TranscriptionProfile,
  type BackendLogEvent,
  type BrushStrokeMapping,
  type ChartDataMapping,
  type ChatDictationMode,
  type DrawAreaLayerItemTransformMapping,
  type ImageMapping,
} from "utils/generatedTypes";
import {
  DEFAULT_GIT_GRAPH_AUTHOR_WIDTH_PX,
  DEFAULT_GIT_GRAPH_COL_WIDTH_PX,
  DEFAULT_GIT_GRAPH_DATE_WIDTH_PX,
  DEFAULT_GIT_GRAPH_HASH_WIDTH_PX,
  DEFAULT_GIT_GRAPH_SPLIT_PCT,
} from "utils/gitGraphLayoutDefaults";
import type { ServerModeValue } from "utils/serverModeTypes";
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

type APIKeys = HttpapiLlmapiKeysSnapshot["apiKeys"];
type ExternalAgentHealthStatus = HttpapiExternalAgentPreflightStatus;

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
          pluginData: {},
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

type ShareSessionState = {
  isDeploymentMode: boolean;
  shareSessionId: string | null;
  sessionRunCount: number;
  sharePolicy: Policy | null;
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
  mode: ServerModeValue;
  modeResolved: boolean;
  modeError: string | null;
};

export const useServerMode = createWithEqualityFn<ServerModeState>(() => ({
  mode: null,
  modeResolved: false,
  modeError: null,
}));

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

type ZustandNotificationState = { notifications: Array<AppNotification> };

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

function normalizeTrimmedPersistedString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function normalizePersistedProjectChatSlashCommand(
  value: unknown,
): ProjectChatCustomSlashCommand | null {
  if (!isPersistedRecord(value)) {
    return null;
  }
  const command = normalizeTrimmedPersistedString(value.command);
  const prompt = normalizeTrimmedPersistedString(value.prompt);
  if (!command || !prompt) {
    return null;
  }
  return {
    command,
    prompt,
    appGenerationMode: parseAppGenerationMode(value.appGenerationMode),
  };
}

function normalizePersistedCustomProjectChatSlashCommandsByProjectConfigId(
  value: unknown,
): Record<string, Array<ProjectChatCustomSlashCommand>> {
  if (!isPersistedRecord(value)) {
    return {};
  }
  const normalized: Record<string, Array<ProjectChatCustomSlashCommand>> = {};
  for (const [projectConfigId, rawCommands] of Object.entries(value)) {
    const normalizedProjectConfigId =
      normalizeTrimmedPersistedString(projectConfigId);
    if (!normalizedProjectConfigId || !Array.isArray(rawCommands)) {
      continue;
    }
    const normalizedCommands: Array<ProjectChatCustomSlashCommand> = [];
    for (const rawCommand of rawCommands) {
      const normalizedCommand =
        normalizePersistedProjectChatSlashCommand(rawCommand);
      if (!normalizedCommand) {
        continue;
      }
      normalizedCommands.push(normalizedCommand);
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

function normalizePersistedStringArray(
  value: unknown,
  fallback: string[],
): string[] {
  return Array.isArray(value) ? value : fallback;
}

function normalizePersistedBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function normalizePersistedNumber(value: unknown, fallback: number): number {
  return typeof value === "number" ? value : fallback;
}

function normalizePersistedObjectMap<T extends Record<string, unknown>>(
  value: unknown,
  fallback: T,
): T {
  return isPersistedRecord(value) ? (value as T) : fallback;
}

function normalizePersistedHomeProjectGalleryViewMode(
  value: unknown,
  fallback: HomeProjectGalleryViewMode,
): HomeProjectGalleryViewMode {
  return value === "thumbnails" || value === "list" ? value : fallback;
}

function normalizePersistedChatSharedEdgeMode(
  value: unknown,
  fallback: ChatSharedEdgeMode,
): ChatSharedEdgeMode {
  return value === "agentic" || value === "workflow" ? value : fallback;
}

function normalizePersistedOverviewTab(
  value: unknown,
  fallback: OverviewTabKey,
): OverviewTabKey {
  return isOverviewTabKey(value) ? value : fallback;
}

function normalizePersistedOverviewNotificationsPaneTab(
  value: unknown,
  fallback: OverviewNotificationsPaneTab,
): OverviewNotificationsPaneTab {
  return value === OverviewNotificationsPaneTabEnum.Notifications ||
    value === OverviewNotificationsPaneTabEnum.BackendLogs
    ? value
    : fallback;
}

function resolvePersistedColorMode(
  value: unknown,
  darkMode: boolean,
  hasPersistedValue: boolean,
): ColorModePreference {
  if (!hasPersistedValue) {
    return darkMode ? "dark" : "light";
  }
  return value as ColorModePreference;
}

function normalizePersistedProjectChatThreadState(
  merged: ZustandLocalStorage,
  defaults: ZustandLocalStorage,
): void {
  merged.viewedProjectChatThreadIdsByProjectConfigId =
    normalizePersistedObjectMap(
      merged.viewedProjectChatThreadIdsByProjectConfigId,
      defaults.viewedProjectChatThreadIdsByProjectConfigId,
    );
  merged.projectChatThreadGroupsByProjectConfigId = normalizePersistedObjectMap(
    merged.projectChatThreadGroupsByProjectConfigId,
    defaults.projectChatThreadGroupsByProjectConfigId,
  );
  merged.projectChatThreadAssignmentsByProjectConfigId =
    normalizePersistedObjectMap(
      merged.projectChatThreadAssignmentsByProjectConfigId,
      defaults.projectChatThreadAssignmentsByProjectConfigId,
    );
  merged.projectChatThreadOrderByProjectConfigId = normalizePersistedObjectMap(
    merged.projectChatThreadOrderByProjectConfigId,
    defaults.projectChatThreadOrderByProjectConfigId,
  );
  merged.pinnedProjectChatThreadIdsByProjectConfigId =
    normalizePersistedObjectMap(
      merged.pinnedProjectChatThreadIdsByProjectConfigId,
      defaults.pinnedProjectChatThreadIdsByProjectConfigId,
    );
  merged.trashedProjectChatThreadIdsByProjectConfigId =
    normalizePersistedObjectMap(
      merged.trashedProjectChatThreadIdsByProjectConfigId,
      defaults.trashedProjectChatThreadIdsByProjectConfigId,
    );
}

function normalizePersistedLocalStorageState(
  merged: ZustandLocalStorage,
  defaults: ZustandLocalStorage,
  persisted: Partial<ZustandLocalStorage>,
): ZustandLocalStorage {
  merged.colorMode = resolvePersistedColorMode(
    merged.colorMode,
    merged.darkMode,
    persisted.colorMode !== undefined,
  );
  merged.homeProjectGalleryViewMode =
    normalizePersistedHomeProjectGalleryViewMode(
      merged.homeProjectGalleryViewMode,
      defaults.homeProjectGalleryViewMode,
    );
  merged.chatSharedEdgeMode = normalizePersistedChatSharedEdgeMode(
    merged.chatSharedEdgeMode,
    defaults.chatSharedEdgeMode,
  );
  merged.favoriteProjectConfigIds = normalizePersistedStringArray(
    merged.favoriteProjectConfigIds,
    defaults.favoriteProjectConfigIds,
  );
  merged.overviewProjectConfigOrder = normalizePersistedStringArray(
    merged.overviewProjectConfigOrder,
    defaults.overviewProjectConfigOrder,
  );
  merged.homeWorkspacePaneVis = normalizePersistedBoolean(
    merged.homeWorkspacePaneVis,
    defaults.homeWorkspacePaneVis,
  );
  merged.homeWorkspacePaneWidth = normalizePersistedNumber(
    merged.homeWorkspacePaneWidth,
    defaults.homeWorkspacePaneWidth,
  );
  merged.homeWorkspacePaneTrueWidth = normalizePersistedNumber(
    merged.homeWorkspacePaneTrueWidth,
    defaults.homeWorkspacePaneTrueWidth,
  );
  merged.homeSelectedProjectPaneVis = normalizePersistedBoolean(
    merged.homeSelectedProjectPaneVis,
    defaults.homeSelectedProjectPaneVis,
  );
  merged.homeSelectedProjectPaneWidth = normalizePersistedNumber(
    merged.homeSelectedProjectPaneWidth,
    defaults.homeSelectedProjectPaneWidth,
  );
  merged.homeSelectedProjectPaneTrueWidth = normalizePersistedNumber(
    merged.homeSelectedProjectPaneTrueWidth,
    defaults.homeSelectedProjectPaneTrueWidth,
  );
  merged.overviewTab = normalizePersistedOverviewTab(
    merged.overviewTab,
    defaults.overviewTab,
  );
  merged.overviewNotificationsPaneTab =
    normalizePersistedOverviewNotificationsPaneTab(
      merged.overviewNotificationsPaneTab,
      defaults.overviewNotificationsPaneTab,
    );
  merged.customProjectChatSlashCommandsByProjectConfigId =
    normalizePersistedCustomProjectChatSlashCommandsByProjectConfigId(
      merged.customProjectChatSlashCommandsByProjectConfigId,
    );
  merged.projectChatDraftMessageByProjectConfigId =
    normalizePersistedProjectChatDraftMessageByProjectConfigId(
      merged.projectChatDraftMessageByProjectConfigId,
    );
  merged.projectChatAuxViewByProjectConfigId =
    defaults.projectChatAuxViewByProjectConfigId;
  normalizePersistedProjectChatThreadState(merged, defaults);
  return merged;
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

type BackendLogSeverity = BackendLogEvent["severity"];

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
  events: Array<BackendLogEvent>;
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
  codeSections: Record<string, Array<LSPDiagnostic>>;
  unmappedGenCode: Array<LSPDiagnostic>;
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
  connections: Array<Connection>;
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
  allLLMConfigs: AllConfigs | null;
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
  promptTemplates: Array<Template>;
  promptTemplatesInitialLoadComplete: boolean;
  promptTemplatesLoadError: string | null;
  promptTemplatesLoading: boolean;
  externalAgentConfigs: Array<ExternalAgentConfig>;
  externalAgentConfigsInitialLoadComplete: boolean;
  externalAgentConfigsLoadError: string | null;
  externalAgentConfigsLoading: boolean;
  externalAgentHealth: Array<ExternalAgentHealthStatus>;
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
  projectChatDictationMode: ChatDictationMode;
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
        projectChatDictationMode: ChatDictationModeEnum.auto,
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
      overviewTab: OverviewTabUIConfig.names.Overview,
      overviewNotificationsPaneTab:
        OverviewNotificationsPaneTabEnum.Notifications,
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
        return normalizePersistedLocalStorageState(
          {
            ...currentState,
            ...persisted,
          },
          currentState,
          persisted,
        );
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
