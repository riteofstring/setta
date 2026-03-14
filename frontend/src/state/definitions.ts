import type { AIFollowMode } from "state/types/aiFollow";
import {
  AgenticEdgeKindEnum,
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
