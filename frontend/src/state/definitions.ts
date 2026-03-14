import { HandlePosition, HandleType, Node } from "forks/xyflow/core/types";
import type { ChatSharedEdgeMode } from "state/actions/chatSharedHandleIds";
import { parseAppGenerationMode } from "state/types/appGenerationMode";
import {
  CLOSED_PANE_WIDTH,
  INITIAL_OVERVIEW_WIDTH,
  INITIAL_UI_EDITOR_WIDTH,
  isOverviewTabKey,
  OverviewNotificationsPaneTab,
  OverviewNotificationsPaneTabEnum,
  OverviewTabKey,
  OverviewTabNameEnum,
  UIEditorTabLocalStorage,
} from "utils/constants";
import {
  BaseDependencyKeyUnion,
  BrushStrokeMapping,
  ChartDataMapping,
  createProjectChatWindowingState,
  createProjectConfig,
  createSingletonSections,
  DrawAreaLayerItemTransformMapping,
  ImageMapping,
  ListenerCoverageSnapshot,
  ProjectStateSingleConfig,
  RenameRefactorBroadcastContent,
  SettaLspDiagnostic,
  SettaProjectNameValidationErrors,
  SettingsState,
  WebsocketConnectionInfo,
} from "utils/generatedTypes";
import {
  DEFAULT_GIT_GRAPH_AUTHOR_WIDTH_PX,
  DEFAULT_GIT_GRAPH_COL_WIDTH_PX,
  DEFAULT_GIT_GRAPH_DATE_WIDTH_PX,
  DEFAULT_GIT_GRAPH_HASH_WIDTH_PX,
  DEFAULT_GIT_GRAPH_SPLIT_PCT,
} from "utils/gitGraphLayoutDefaults";
import { persist, subscribeWithSelector } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import { createWithEqualityFn } from "zustand/traditional";
import { getPersistStorage } from "./storePersistStorage";
export {
  useAppConfigs,
  useAppDefinition,
  useAppPreview,
} from "./stores/appStores";
export {
  useAllProjectMetadata,
  useServerMode,
  useShareSession,
} from "./stores/sessionStores";
export {
  useBackendLogEvents,
  useModal,
  useNotifications,
} from "./stores/feedbackStores";
export {
  useBrowserSectionFileBrowserState,
  useDropzoneFileBrowserState,
  useFileBrowserState,
  useHomeFileBrowserState,
} from "./stores/fileBrowserStores";
export {
  useProjectLoading,
  useRunControl,
} from "./stores/projectStatusStores";
export { useHomePageSearch, useProjectSearch } from "./stores/searchStores";
import type {
  ProjectChatAuxView,
  ProjectChatCustomSlashCommand,
} from "./stores/aiStores";
import type { CustomRunItem } from "./stores/projectStatusStores";
import { withProjectState, withResetFn } from "./utils";

export {
  useAgenticScopeHighlights,
  useAIFollow,
  useAIStore,
  useToolArgumentPreview,
} from "./stores/aiStores";
export type {
  AgenticScopeViolationEdge,
  ChatBranchInfo,
  ChatDetails,
  ProjectChatAuxView,
  ProjectChatCustomSlashCommand,
  ToolArgumentPreviewEntry,
  ToolArgumentPreviewProjectState,
} from "./stores/aiStores";
export type { BackendLogEventsFilter } from "./stores/feedbackStores";
export type { FileBrowserState } from "./stores/fileBrowserStores";
export type {
  CustomRunAction,
  CustomRunItem,
} from "./stores/projectStatusStores";
export type { ZustandProjectSearch } from "./stores/searchStores";

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
          projectChatWindowing: createProjectChatWindowingState(),
          previewSectionVariantMap: {},
          requiredDecodedImages: [],
        })),
      ),
    ),
  ),
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

type RunSnapshotMode = SettingsState["backend"]["runSnapshotMode"];

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

const useArtifacts = withProjectState(
  createWithEqualityFn(
    subscribeWithSelector(withResetFn(() => ({ x: {}, namePathTypeToId: {} }))),
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
