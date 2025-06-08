import {
  CLOSED_PANE_WIDTH,
  INITIAL_OVERVIEW_WIDTH,
  INITIAL_UI_EDITOR_WIDTH,
} from "utils/constants";
import {
  APIKeys,
  ChatMetadata,
  createProjectConfig,
  IDToUUIDForLLM,
  ProjectStateSingleConfig,
  SettaNotification,
  SettingsState,
  UITypeNameSchema,
} from "utils/generatedTypes";
import { temporal } from "zundo";
import { persist, subscribeWithSelector } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import { createWithEqualityFn } from "zustand/traditional";
import {
  withProjectState,
  withResetFn,
  withVersion,
  ZUNDO_TEMPORAL_OPTIONS,
} from "./utils";

export const useResizeEvent = withProjectState(
  createWithEqualityFn(
    immer(
      withResetFn(() => ({
        resizeEvent: {},
      })),
    ),
  ),
);

export const useContextMenus = withProjectState(
  createWithEqualityFn(
    withResetFn(() => ({
      pane: { isOpen: false, x: 0, y: 0 },
      selection: { isOpen: false, x: 0, y: 0, nodeIds: [] },
      typeError: { isOpen: false, x: 0, y: 0, paramInfoId: null },
    })),
  ),
);

export type ZustandProjectState = {
  projectConfig: ProjectStateSingleConfig["projectConfig"];
  sections: ProjectStateSingleConfig["sections"];
  variants: ProjectStateSingleConfig["variants"];
  uiTypeCols: ProjectStateSingleConfig["uiTypeCols"];
  uiTypes: ProjectStateSingleConfig["uiTypes"];
  codeInfoCols: ProjectStateSingleConfig["codeInfoCols"];
  codeInfo: ProjectStateSingleConfig["codeInfo"];
  activeIds: Array<string>;
};

export const useProjectState = withProjectState(
  createWithEqualityFn(
    subscribeWithSelector(
      temporal(
        immer(
          withResetFn(() =>
            withVersion<ZustandProjectState>({
              projectConfig: createProjectConfig(),
              sections: {},
              variants: {},
              uiTypeCols: {},
              uiTypes: {},
              codeInfoCols: {},
              codeInfo: {},
              artifactGroups: {},
              singletonSections: {
                [UITypeNameSchema.enum.GLOBAL_VARIABLES]: null,
                [UITypeNameSchema.enum.GEN_PYTHON_CODE]: null,
                temporaryTerminalGroup: null,
              },
              requestRenameRefactor: false,
              activeIds: [],
            }),
          ),
        ),
        ZUNDO_TEMPORAL_OPTIONS,
      ),
    ),
  ),
);

export const useHomePageSearch = createWithEqualityFn(
  withResetFn(() => ({
    value: "",
  })),
);

// keys for textFields are of the form:
// {sectionId}-null for the main section combobox
// {sectionId}-{paramInfoId} for section parameter fields
export const useWaitingForLSPResult = withProjectState(
  createWithEqualityFn(
    immer(
      withResetFn(() => ({
        textFields: {},
        parametersRequest: {},
      })),
    ),
  ),
);

export const useModal = withProjectState(
  createWithEqualityFn(
    withResetFn(() => ({
      open: false,
      modalType: null,
      modalData: null,
    })),
  ),
);

export const useNodeInternals = withProjectState(
  createWithEqualityFn(
    temporal(
      withResetFn(() =>
        withVersion({
          x: new Map(),
        }),
      ),
      ZUNDO_TEMPORAL_OPTIONS,
    ),
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
    subscribeWithSelector(
      temporal(
        withResetFn(() => withVersion({ x: {}, namePathTypeToId: {} })),
        ZUNDO_TEMPORAL_OPTIONS,
      ),
    ),
  ),
);

export const useInteractiveDependencies = withProjectState(
  createWithEqualityFn(withResetFn(() => ({ dependencies: new Set() }))),
);

export const useProjectSearch = withProjectState(
  createWithEqualityFn(
    withResetFn(() => ({
      sections: [],
      codeInfo: [],
      focused: {},
      lookup: new Set(),
      mode: "find",
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

export const useStateVersion = withProjectState(
  createWithEqualityFn(
    temporal(
      withResetFn(() => withVersion({})),
      ZUNDO_TEMPORAL_OPTIONS,
    ),
  ),
);

export const useTypeErrors = withProjectState(
  createWithEqualityFn(
    immer(
      withResetFn(() => ({
        userRequested: false,
        errors: {},
      })),
    ),
  ),
);

export const useWebsocketConnectionList = createWithEqualityFn(
  withResetFn(() => ({
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
        chartDisplayedSeriesNames: {}, //sectionId to series names
      })),
    ),
  ),
);

// maps from variantId to yaml
export const useYamlValue = withProjectState(
  createWithEqualityFn(withResetFn(() => {})),
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

type ZustandAIStore = {
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
  // @ts-ignore
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

export const useLocalStorage = createWithEqualityFn(
  persist(
    () => ({
      snapToGrid: true,
      darkMode: true,
      showMinimap: true,
      projectConfigPreviewEnabled: true,
      overviewVis: true,
      overviewWidth: INITIAL_OVERVIEW_WIDTH,
      overviewTrueWidth: INITIAL_OVERVIEW_WIDTH,
      overviewTab: "tab1",
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
