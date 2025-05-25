import { C } from "utils/c";
import {
  CLOSED_PANE_WIDTH,
  INITIAL_OVERVIEW_WIDTH,
  INITIAL_UI_EDITOR_WIDTH,
} from "utils/constants";
import { persist, subscribeWithSelector } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import { create, withResetFn, withTemporal, withVersion } from "./utils";

export const useResizeEvent = create(
  withTemporal(
    immer(
      withResetFn(() =>
        withVersion({
          resizeEvent: {},
        }),
      ),
    ),
  ),
);

export const useActiveSection = create(
  withTemporal(
    withResetFn(() =>
      withVersion({
        ids: [],
      }),
    ),
  ),
);

export const useContextMenus = create(
  withResetFn(() => ({
    pane: { isOpen: false, x: 0, y: 0 },
    selection: { isOpen: false, x: 0, y: 0, nodeIds: [] },
    typeError: { isOpen: false, x: 0, y: 0, paramInfoId: null },
  })),
);

export const useProjectState = create(
  subscribeWithSelector(
    withTemporal(
      immer(
        withResetFn(() =>
          withVersion({
            projectConfigId: null,
            projectConfigs: {},
            sections: {},
            variants: {},
            uiTypeCols: {},
            uiTypes: {},
            codeInfoCols: {},
            codeInfo: {},
            artifactGroups: {},
            singletonSections: {
              [C.GLOBAL_VARIABLES]: null,
              [C.GLOBAL_PARAM_SWEEP]: null,
              [C.GEN_PYTHON_CODE]: null,
              temporaryTerminalGroup: null,
            },
            requestRenameRefactor: false,
          }),
        ),
      ),
    ),
  ),
);

export const useHomePageSearch = create(
  withResetFn(() => ({
    value: "",
  })),
);

// keys for textFields are of the form:
// {sectionId}-null for the main section combobox
// {sectionId}-{paramInfoId} for section parameter fields
export const useWaitingForLSPResult = create(
  immer(
    withResetFn(() => ({
      textFields: {},
      parametersRequest: {},
    })),
  ),
);

export const useModal = create(
  withResetFn(() => ({
    open: false,
    modalType: null,
    modalData: null,
  })),
);

export const useNodeInternals = create(
  withTemporal(
    withResetFn(() =>
      withVersion({
        x: new Map(),
      }),
    ),
  ),
);

export const useNotifications = create(
  withResetFn(() => ({
    notifications: [],
  })),
);

export const useArtifacts = create(
  subscribeWithSelector(
    withTemporal(
      withResetFn(() => withVersion({ x: {}, namePathTypeToId: {} })),
    ),
  ),
);

export const useInteractiveDependencies = create(
  withResetFn(() => ({ dependencies: new Set() })),
);

export const useProjectSearch = create(
  withResetFn(() => ({
    sections: [],
    codeInfo: [],
    focused: {},
    lookup: new Set(),
    mode: "find",
  })),
);

export const useSectionRefs = create(
  subscribeWithSelector(
    immer(
      withResetFn(() => ({
        withNested: {},
        selfOnly: {},
      })),
    ),
  ),
);

export const useSettings = create(() => ({}));

export const useStateVersion = create(
  withTemporal(withResetFn(() => withVersion({}))),
);

export const useTypeErrors = create(
  immer(
    withResetFn(() => ({
      userRequested: false,
      errors: {},
    })),
  ),
);

export const useWebsocketConnectionList = create(
  withResetFn(() => ({
    connections: [],
  })),
);

export const useTemporaryMiscState = create(
  subscribeWithSelector(withResetFn(() => ({}))),
);

export const useProjectLoading = create(
  withResetFn(() => ({ projectIsLoading: false, projectIs404: false })),
);

export const useMisc = create(
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
);

// maps from variantId to yaml
export const useYamlValue = create(withResetFn(() => {}));

// maps from variantId to yaml metadata
export const useOriginalYamlObj = create(withResetFn(() => {}));

export const useSectionColumnWidth = create(
  subscribeWithSelector(withResetFn(() => {})),
);

export const useResizerStore = create(
  withResetFn(() => ({
    activeResizer: null, // { sectionId, ref, startX, startWidth, containerWidth, maxNestedDepth }
    globalEventListenersInitialized: false,
  })),
);

export const useAIStore = create(
  subscribeWithSelector(
    persist(
      () => ({
        // State
        apiKeys: {},
        apiKeysFilepath: ".env",
        apiKeysInitialLoadComplete: false,
        chatDetails: {}, // chatId to {messages, toolResults, waitingForResponse, streamTarget}
        allChatMetadata: [], // list of {ids, names, updated}
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

export const useLocalStorage = create(
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
