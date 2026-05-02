import { ModalInfoType } from "components/Modals/types";

import type { HandlePosition, HandleType, Node } from "gpuFlow/flowTypes";

import type {
  HttpapiExternalAgentPreflightStatus,
  HttpapiLlmapiKeysSnapshot,
} from "openapi/http";

import type { ChatSharedEdgeMode } from "state/actions/chatSharedHandleIds";

import {
  parseAppGenerationMode,
  type AppGenerationMode,
} from "state/types/appGenerationMode";

import type { AppNotification } from "state/types/notifications";

import {
  isOverviewTabKey,
  OverviewNotificationsPaneTab,
  OverviewNotificationsPaneTabEnum,
  OverviewTabKey,
  ProjectSearchMode,
  ProjectSearchModeEnum,
} from "utils/constants";

import {
  DEFAULT_FILE_BROWSER_TYPE_FILTERS,
  type FileBrowserSearchScope,
  type FileBrowserTypeFilter,
} from "utils/fileBrowserTypes";

import {
  AllProjectMetadata,
  BaseDependencyKeyUnion,
  createProjectChatWindowingState,
  createProjectConfig,
  createSettingsState,
  createSingletonSections,
  ListenerCoverageSnapshot,
  Policy,
  RenameRefactorBroadcastContent,
  SettingsState,
  SingleConfig,
  type BackendLogEvent,
} from "utils/generatedTypes";

import type { ServerModeValue } from "utils/serverModeTypes";

import { createJSONStorage, subscribeWithSelector } from "zustand/middleware";

import { immer } from "zustand/middleware/immer";

import { createWithEqualityFn } from "zustand/traditional";

import { withProjectState, withResetFn } from "./utils";

import {
  ColorModePreference,
  HomeProjectGalleryViewMode,
  ZustandLocalStorage,
} from "./storesLocalState";

export const createInMemoryStorage = () => {
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

export const getPersistStorage = <S>() =>
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

export type APIKeys = HttpapiLlmapiKeysSnapshot["apiKeys"];

export type ExternalAgentHealthStatus = HttpapiExternalAgentPreflightStatus;

export const useResizeEvent = withProjectState(
  createWithEqualityFn(
    immer(
      withResetFn(() => ({
        resizeEvent: {},
      })),
    ),
  ),
);

export type ZustandContextMenu = {
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

export type ShareSessionState = {
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

export type ServerModeState = {
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

export type ZustandPendingOperations = {
  pending: Array<PendingOperation>;
};

export const usePendingOperations = withProjectState(
  createWithEqualityFn(
    withResetFn<ZustandPendingOperations>(() => ({ pending: [] })),
  ),
);

export type ActiveSectionUIState = {
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

export type ListenerCoverageState = {
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

export type ZustandRenameRefactors = {
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

export type ZustandWaitingForLSPResult = {
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

export type ZustandModalState = {
  open: boolean;
  modalInfo: ModalInfoType | null;
};

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

export type AtomicallyPublishedProjectStoreState = {
  projectState: ZustandProjectState;
  nodeInternals: ZustandNodeInternalsState;
  activeSectionUI: ActiveSectionUIState;
};

export let stagedProjectStorePublication: AtomicallyPublishedProjectStoreState | null =
  null;

export function patchPublishedProjectStoreGetState<TState>(
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

export const readRawProjectState =
  useProjectState.getState.bind(useProjectState);

export const readRawActiveSectionUIState =
  useActiveSectionUI.getState.bind(useActiveSectionUI);

export const readRawNodeInternalsState =
  useNodeInternals.getState.bind(useNodeInternals);

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

export type ZustandNotificationState = {
  notifications: Array<AppNotification>;
};

export const useNotifications = createWithEqualityFn(
  withResetFn<ZustandNotificationState>(() => ({
    notifications: [],
  })),
);

export type FileBrowserState = {
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

export type RunMode = "once" | "continuous";

export type RunSnapshotMode = SettingsState["backend"]["runSnapshotMode"];

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

export function isPersistedRecord(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeTrimmedPersistedString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized ? normalized : null;
}

export function normalizePersistedProjectChatSlashCommand(
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

export function normalizePersistedCustomProjectChatSlashCommandsByProjectConfigId(
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

export function normalizePersistedProjectChatDraftMessageByProjectConfigId(
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

export function normalizePersistedStringArray(
  value: unknown,
  fallback: string[],
): string[] {
  return Array.isArray(value) ? value : fallback;
}

export function normalizePersistedBoolean(
  value: unknown,
  fallback: boolean,
): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function normalizePersistedNumber(
  value: unknown,
  fallback: number,
): number {
  return typeof value === "number" ? value : fallback;
}

export function normalizePersistedObjectMap<T extends Record<string, unknown>>(
  value: unknown,
  fallback: T,
): T {
  return isPersistedRecord(value) ? (value as T) : fallback;
}

export function normalizePersistedHomeProjectGalleryViewMode(
  value: unknown,
  fallback: HomeProjectGalleryViewMode,
): HomeProjectGalleryViewMode {
  return value === "thumbnails" || value === "list" ? value : fallback;
}

export function normalizePersistedChatSharedEdgeMode(
  value: unknown,
  fallback: ChatSharedEdgeMode,
): ChatSharedEdgeMode {
  return value === "agentic" || value === "workflow" ? value : fallback;
}

export function normalizePersistedOverviewTab(
  value: unknown,
  fallback: OverviewTabKey,
): OverviewTabKey {
  return isOverviewTabKey(value) ? value : fallback;
}

export function normalizePersistedOverviewNotificationsPaneTab(
  value: unknown,
  fallback: OverviewNotificationsPaneTab,
): OverviewNotificationsPaneTab {
  return value === OverviewNotificationsPaneTabEnum.Notifications ||
    value === OverviewNotificationsPaneTabEnum.BackendLogs
    ? value
    : fallback;
}

export function resolvePersistedColorMode(
  value: unknown,
  darkMode: boolean,
  hasPersistedValue: boolean,
): ColorModePreference {
  if (!hasPersistedValue) {
    return darkMode ? "dark" : "light";
  }
  return value as ColorModePreference;
}

export function normalizePersistedProjectChatThreadState(
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

export function normalizePersistedLocalStorageState(
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

export type ZustandRunControl = {
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

export type BackendLogSeverity = BackendLogEvent["severity"];

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

export type BackendLogEventsState = {
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
  isConnectableEnd?: boolean;
};

export type EdgeHandlePosition = {
  sectionId: string;
  portId: string;
  type: HandleType;
  side: HandlePosition;
  x: number;
  y: number;
};

export type ZustandEdgeHandleRegistry = {
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

export type ZustandTypeErrors = {
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
