import {
  BrushStrokeMapping,
  ChartDataMapping,
  DrawAreaLayerItemTransformMapping,
  ImageMapping,
} from "utils/generatedTypes";
import { subscribeWithSelector } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import { createWithEqualityFn } from "zustand/traditional";
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
export {
  useAgenticScopeHighlights,
  useAIFollow,
  useToolArgumentPreview,
} from "./stores/aiFollowStores";
export type {
  AgenticScopeViolationEdge,
  ToolArgumentPreviewEntry,
  ToolArgumentPreviewProjectState,
} from "./stores/aiFollowStores";
export { useAIStore } from "./stores/aiStore";
export type { ChatBranchInfo, ChatDetails } from "./stores/aiStore";
export {
  useEdgeHandleRegistry,
  useListenerCoverage,
  useProjectSearch,
  useRenameRefactors,
  useSectionRefs,
  useWaitingForLSPResult,
} from "./stores/authoringStores";
export type {
  EdgeHandleRecord,
  ListenerCoverageRecord,
  ZustandProjectSearch,
} from "./stores/authoringStores";
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
export {
  DEFAULT_BACKEND_LOG_EVENTS_FILTER,
  useBackendLogEvents,
  useRunControl,
} from "./stores/runtimeStores";
export type { BackendLogEventsFilter } from "./stores/runtimeStores";
export { useServerMode, useShareSession } from "./stores/sessionStores";
export { useSettings } from "./stores/settingsStore";
export {
  useContextMenus,
  useHomePageSearch,
  useModal,
  useNotifications,
  useResizeEvent,
} from "./stores/uiStores";

const useArtifacts = withProjectState(
  createWithEqualityFn(
    subscribeWithSelector(withResetFn(() => ({ x: {}, namePathTypeToId: {} }))),
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
