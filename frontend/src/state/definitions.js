import C from "constants/constants.json";
import { temporal } from "zundo";
import { subscribeWithSelector } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import { create, createProjectState, withResetFn, withVersion } from "./utils";

export const useActiveSection = createProjectState(
  temporal(
    withResetFn(() =>
      withVersion({
        ids: [],
      }),
    ),
  ),
);

export const useContextMenus = createProjectState(
  withResetFn(() => ({
    pane: { isOpen: false, x: 0, y: 0 },
    deck: { isOpen: false, x: 0, y: 0, sectionId: null },
    selection: { isOpen: false, x: 0, y: 0, nodeIds: [] },
  })),
);

export const useSectionInfos = createProjectState(
  subscribeWithSelector(
    temporal(
      immer(
        withResetFn(() =>
          withVersion({
            x: {},
            variants: {},
            uiTypeCols: {},
            uiTypes: {},
            codeInfoCols: {},
            codeInfo: {},
            singletonSections: {
              [C.GLOBAL_VARIABLES]: null,
              [C.GLOBAL_PARAM_SWEEP]: null,
            },
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

export const useInteractive = create(
  withResetFn(() => ({
    taskMetadata: [],
  })),
);

export const useKeywordRegex = create(
  withResetFn(() => ({
    pattern: "",
    codeAreaPattern: "",
    fullNameToInfo: {},
  })),
);

// keys for textFields are of the form:
// {sectionId}-null for the main section combobox
// {sectionId}-{paramInfoId} for section parameter fields
export const useWaitingForLSPResult = createProjectState(
  immer(
    withResetFn(() => ({
      textFields: {},
      parametersRequest: {},
    })),
  ),
);

export const useModal = createProjectState(
  withResetFn(() => ({
    open: false,
    modalType: null,
    modalData: null,
  })),
);

export const useNodeInternals = createProjectState(
  temporal(
    withResetFn(() =>
      withVersion({
        x: new Map(),
      }),
    ),
  ),
);

export const useNotification = create(
  withResetFn(() => ({
    message: "",
    timeoutId: null,
  })),
);

export const useAllProjectConfigs = createProjectState(
  withResetFn(() => ({
    x: {},
    names: [],
  })),
);

export const useArtifacts = createProjectState(
  immer(
    withResetFn(() => ({
      x: {},
    })),
  ),
);

export const useProjectConfig = createProjectState(
  temporal(
    immer(
      withResetFn(() =>
        withVersion({
          id: "",
          name: "",
        }),
      ),
    ),
  ),
);

export const useProjectSearch = createProjectState(
  withResetFn(() => ({
    sections: [],
    codeInfo: [],
    focused: {},
    lookup: new Set(),
  })),
);

export const useSectionRefs = createProjectState(
  immer(
    withResetFn(() => ({
      withNested: {},
      selfOnly: {},
    })),
  ),
);

export const useSettings = create(withResetFn(() => ({})));

export const useStateVersion = createProjectState(
  temporal(withResetFn(() => withVersion({}))),
);

export const useTypeErrors = createProjectState(
  immer(
    withResetFn(() => ({
      userRequested: false,
      errors: {},
    })),
  ),
);

export const useWebsocketConnectionList = create(
  withResetFn(() => ({
    connectedTo: null,
    connections: [],
  })),
);

export const useTemporaryMiscState = createProjectState(
  subscribeWithSelector(withResetFn(() => ({}))),
);

export const useMisc = create(
  subscribeWithSelector(
    withResetFn(() => ({
      projectIsLoading: false,
      projectIs404: false,
      mouseDownDrawArea: false,
      mouseDownDraggingSection: false,
      lastPaneClickLocation: { x: 0, y: 0 },
      undoOrRedoWasTriggered: false,
      isSelectingParams: false,
    })),
  ),
);

export const useYamlValue = createProjectState(withResetFn(() => {}));

export const useYamlValueIsInitialized = createProjectState(
  withResetFn(() => {}),
);

export const useOriginalYamlObj = createProjectState(withResetFn(() => {}));
