import { HandlePosition, HandleType } from "forks/xyflow/core/types";
import type { AIFollowMode } from "state/types/aiFollow";
import {
  ProjectSearchMode,
  ProjectSearchModeEnum,
} from "utils/constants/projectSearch";
import {
  AgenticEdgeKindEnum,
  BaseDependencyKeyUnion,
  BrushStrokeMapping,
  ChartDataMapping,
  DrawAreaLayerItemTransformMapping,
  ImageMapping,
  ListenerCoverageSnapshot,
  RenameRefactorBroadcastContent,
  SettaBackendLogEvent,
  SettingsState,
} from "utils/generatedTypes";
import { subscribeWithSelector } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import { createWithEqualityFn } from "zustand/traditional";
import type { CustomRunItem } from "./stores/localStorageStore";
import { withProjectState, withResetFn } from "./utils";

export {
  runWithAtomicallyPublishedProjectStores,
  useActiveSectionUI,
  useNodeInternals,
} from "./stores/activeSectionStores";
export type {
  ActiveSectionUIState,
  ZustandNodeInternalsState,
} from "./stores/activeSectionStores";
export { useAIStore } from "./stores/aiStore";
export type { ChatBranchInfo, ChatDetails } from "./stores/aiStore";
export {
  useLspDiagnostics,
  useNameValidationErrors,
  useTypeErrors,
} from "./stores/diagnosticsStores";
export {
  useMisc,
  useProjectLoading,
  useTemporaryMiscState,
  useWebsocketConnectionList,
} from "./stores/ephemeralUiStores";
export {
  useBrowserSectionFileBrowserState,
  useDropzoneFileBrowserState,
  useFileBrowserState,
  useHomeFileBrowserState,
} from "./stores/fileBrowserStores";
export { useLocalStorage } from "./stores/localStorageStore";
export type {
  ColorModePreference,
  CustomRunAction,
  CustomRunItem,
  HomeProjectGalleryViewMode,
  ProjectChatAuxView,
  ProjectChatCustomSlashCommand,
} from "./stores/localStorageStore";
export {
  NULL_PROJECT_CONFIG_ID,
  useAllProjectMetadata,
  useAppConfigs,
  useAppDefinition,
  useAppPreview,
  usePendingOperations,
  useProjectState,
} from "./stores/projectStores";
export type {
  PendingOperation,
  ZustandProjectState,
} from "./stores/projectStores";
export { useServerMode, useShareSession } from "./stores/sessionStores";
export {
  useContextMenus,
  useHomePageSearch,
  useModal,
  useNotifications,
  useResizeEvent,
} from "./stores/uiStores";

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

type ZustandRunControl = {
  runMode: CustomRunItem["runMode"];
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
