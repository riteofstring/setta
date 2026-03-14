import { Node } from "forks/xyflow/core/types";
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
  WebsocketConnectionInfo,
} from "utils/generatedTypes";
import { subscribeWithSelector } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import { createWithEqualityFn } from "zustand/traditional";
import { withProjectState, withResetFn } from "./utils";
export {
  useAppConfigs,
  useAppDefinition,
  useAppPreview,
} from "./stores/appStores";
export {
  useLspDiagnostics,
  useNameValidationErrors,
  useTypeErrors,
  useWaitingForLSPResult,
} from "./stores/editorDiagnosticsStores";
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
  useEdgeHandleRegistry,
  useMisc,
  useSectionRefs,
  useTemporaryMiscState,
} from "./stores/layoutInteractionStores";
export { useProjectLoading, useRunControl } from "./stores/projectStatusStores";
export { useHomePageSearch, useProjectSearch } from "./stores/searchStores";
export {
  useAllProjectMetadata,
  useServerMode,
  useShareSession,
} from "./stores/sessionStores";
export { useLocalStorage, useSettings } from "./stores/uiPreferenceStores";

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
export type { EdgeHandleRecord } from "./stores/layoutInteractionStores";
export type {
  CustomRunAction,
  CustomRunItem,
} from "./stores/projectStatusStores";
export type { ZustandProjectSearch } from "./stores/searchStores";
export type {
  ColorModePreference,
  HomeProjectGalleryViewMode,
} from "./stores/uiPreferenceStores";

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

const useArtifacts = withProjectState(
  createWithEqualityFn(
    subscribeWithSelector(withResetFn(() => ({ x: {}, namePathTypeToId: {} }))),
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
