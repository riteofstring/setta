import type { ChatSharedEdgeMode } from "state/actions/chatSharedHandleIds";

import type { AIFollowMode } from "state/types/aiFollow";

import type { SettaProjectNameValidationErrors } from "state/types/nameValidation";

import type { ChatAppGenerationDetails } from "state/utils/chatAppGeneration";

import {
  CLOSED_PANE_WIDTH,
  INITIAL_OVERVIEW_WIDTH,
  INITIAL_UI_EDITOR_WIDTH,
  OverviewNotificationsPaneTab,
  OverviewNotificationsPaneTabEnum,
  OverviewTabKey,
  UIEditorTabLocalStorage,
} from "utils/constants";

import {
  AgenticEdgeKindEnum,
  AgentProfile,
  AgentRun,
  AllConfigs,
  BaseChatMessageUnion,
  ChatDictationModeEnum,
  Connection,
  EngineConfig,
  ExternalAgentConfig,
  LLMConfig,
  LSPDiagnostic,
  OverviewTabUIConfig,
  Template,
  TranscriptionProfile,
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

import { persist, subscribeWithSelector } from "zustand/middleware";

import { immer } from "zustand/middleware/immer";

import { createWithEqualityFn } from "zustand/traditional";

import { withProjectState, withResetFn } from "../utils";

import {
  APIKeys,
  CustomRunItem,
  ExternalAgentHealthStatus,
  getPersistStorage,
  normalizePersistedLocalStorageState,
  ProjectChatAuxView,
  ProjectChatCustomSlashCommand,
  RunSnapshotMode,
} from "./storesCore";

export type ZustandLspDiagnostics = {
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

export type ZustandNameValidationErrors = {
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

export type ZustandWebsocketConnectionList = {
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

export type ZustandAIStore = {
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

export type AIFollowState = {
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

export type AgenticScopeHighlightsState = {
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

export type ToolArgumentPreviewState = {
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

export type MiniMapSide = "left" | "right";

export type ZustandLocalStorage = {
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

export type ZustandChartData = RevisionedArtifacts<ChartDataMapping>;

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

export type ZustandBrushStrokes = RevisionedArtifacts<BrushStrokeMapping>;

export const useBrushStrokes = createWithEqualityFn(
  withResetFn<ZustandBrushStrokes>(() => ({
    x: {},
    revisionById: {},
    localRevisionById: {},
  })),
);

export type ZustandDrawAreaLayerItemTransform = {
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
