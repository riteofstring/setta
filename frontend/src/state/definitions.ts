import { ModalInfoType } from "components/Modals/types";
import { Node } from "forks/xyflow/core/types";
import {
  CLOSED_PANE_WIDTH,
  INITIAL_OVERVIEW_WIDTH,
  INITIAL_UI_EDITOR_WIDTH,
  OverviewTabName,
  OverviewTabNameEnum,
  ProjectSearchMode,
  ProjectSearchModeEnum,
  UIEditorTabLocalStorage,
} from "utils/constants";
import {
  AllProjectMetadata,
  APIKeys,
  BrushStrokeMapping,
  ChartDataMapping,
  ChatMetadata,
  createProjectConfig,
  createSingletonSections,
  DrawAreaTransformMapping,
  IDToUUIDForLLM,
  ImageMapping,
  ProjectStateSingleConfig,
  SettaNotification,
  SettingsState,
  WebsocketConnectionInfo,
} from "utils/generatedTypes";
import { persist, subscribeWithSelector } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import { createWithEqualityFn } from "zustand/traditional";
import { withProjectState, withResetFn } from "./utils";

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
          yamlValues: {},
          shownParamIds: {},
          previewSectionVariantMap: {},
        })),
      ),
    ),
  ),
);

export const useAllProjectMetadata = createWithEqualityFn(
  withResetFn<AllProjectMetadata>(() => ({
    defaultProjectConfigId: null,
    projectMetadata: [],
  })),
);

type ZustandPendingOperations = {
  pending: Array<{ opId: string; op: (x: ZustandProjectState) => void }>;
};

export const usePendingOperations = withProjectState(
  createWithEqualityFn(
    withResetFn<ZustandPendingOperations>(() => ({ pending: [] })),
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

export const useArtifacts = withProjectState(
  createWithEqualityFn(
    subscribeWithSelector(withResetFn(() => ({ x: {}, namePathTypeToId: {} }))),
  ),
);

export const useInteractiveDependencies = withProjectState(
  createWithEqualityFn(withResetFn(() => ({ dependencies: new Set() }))),
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

export const useSettings = createWithEqualityFn<SettingsState>(() => ({}));

type ZustandTypeErrors = {
  userRequested: boolean;
  errors: Record<string, Record<string, string>>;
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

// maps from variantId to yaml metadata
export const useOriginalYamlObj = withProjectState(
  createWithEqualityFn(withResetFn(() => {})),
);

export const useSectionColumnWidth = withProjectState(
  createWithEqualityFn(subscribeWithSelector(withResetFn(() => {}))),
);

export const useResizerStore = withProjectState(
  createWithEqualityFn(
    withResetFn(() => ({
      activeResizer: null, // { sectionId, ref, startX, startWidth, containerWidth, maxNestedDepth }
      globalEventListenersInitialized: false,
    })),
  ),
);

export type ZustandAIStore = {
  apiKeys: APIKeys;
  apiKeysFilepath: string;
  apiKeysInitialLoadComplete: boolean;
  allChatMetadata: Array<ChatMetadata>;
  currentChatId: string | null;
  viewHistory: boolean;
  userSelectedLLM: string;
  idToUUIDForLLM: IDToUUIDForLLM;
};

export const useAIStore = createWithEqualityFn<ZustandAIStore>()(
  // @ts-expect-error Zustand's persist function doesn't work well with types
  subscribeWithSelector(
    persist(
      () => ({
        // State
        apiKeys: {},
        apiKeysFilepath: ".env",
        apiKeysInitialLoadComplete: false,
        chatDetails: {}, // chatId to {messages, toolResults, waitingForResponse, streamTarget}
        allChatMetadata: [],
        currentChatId: null, // id of currently viewed chat
        viewHistory: false,
        userSelectedLLM: "",
        idToUUIDForLLM: {},
      }),
      {
        name: "setta_ai_data",
        partialize: (state) => ({
          apiKeysFilepath: state.apiKeysFilepath,
          currentChatId: state.currentChatId,
          userSelectedLLM: state.userSelectedLLM,
          viewHistory: state.viewHistory,
        }),
      },
    ),
  ),
);

type ZustandLocalStorage = {
  snapToGrid: boolean;
  darkMode: boolean;
  showMinimap: boolean;
  projectConfigPreviewEnabled: boolean;
  overviewVis: boolean;
  overviewWidth: number;
  overviewTrueWidth: number;
  overviewTab: OverviewTabName;
  uiEditorVis: boolean;
  uiEditorWidth: number;
  uiEditorTrueWidth: number;
  uiEditorTab: UIEditorTabLocalStorage;
  showNavBarHelpMessage: boolean;
  tooltipWidth: number;
};

export const useLocalStorage = createWithEqualityFn(
  persist<ZustandLocalStorage>(
    () => ({
      snapToGrid: true,
      darkMode: true,
      showMinimap: true,
      projectConfigPreviewEnabled: true,
      overviewVis: true,
      overviewWidth: INITIAL_OVERVIEW_WIDTH,
      overviewTrueWidth: INITIAL_OVERVIEW_WIDTH,
      overviewTab: OverviewTabNameEnum.Overview,
      uiEditorVis: false,
      uiEditorWidth: INITIAL_UI_EDITOR_WIDTH,
      uiEditorTrueWidth: CLOSED_PANE_WIDTH,
      uiEditorTab: {},
      showNavBarHelpMessage: true,
      tooltipWidth: 256,
    }),
    {
      name: "setta_data", // Same prefix as in your custom implementation
    },
  ),
);

type ZustandImages = { x: ImageMapping };

export const useImages = createWithEqualityFn(
  withResetFn<ZustandImages>(() => ({
    x: {},
  })),
);

type ZustandChartData = { x: ChartDataMapping };

export const useChartData = createWithEqualityFn(
  withResetFn<ZustandChartData>(() => ({
    x: {},
  })),
);

export type ZustandDecodedImages = { x: Record<string, HTMLImageElement> };

export const useDecodedImages = createWithEqualityFn(
  withResetFn<ZustandDecodedImages>(() => ({
    x: {},
  })),
);

export type ZustandBrushStrokes = { x: BrushStrokeMapping };

export const useBrushStrokes = createWithEqualityFn(
  withResetFn<ZustandBrushStrokes>(() => ({
    x: {},
  })),
);

export type ZustandArtifactTransform = {
  x: DrawAreaTransformMapping;
};

export const useArtifactTransform = createWithEqualityFn(
  immer(
    withResetFn<ZustandArtifactTransform>(() => ({
      x: {},
    })),
  ),
);
