import C from "constants/constants.json";
import { temporal } from "zundo";
import { subscribeWithSelector } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import { create, createProjectState, withVersion } from "./utils";

export const useActiveSection = createProjectState(
  temporal(() =>
    withVersion({
      ids: [],
    }),
  ),
);

export const useContextMenus = createProjectState(() => ({
  pane: { isOpen: false, x: 0, y: 0 },
  deck: { isOpen: false, x: 0, y: 0, sectionId: null },
  selection: { isOpen: false, x: 0, y: 0, nodeIds: [] },
}));

export const useSectionInfos = createProjectState(
  temporal(
    subscribeWithSelector(
      immer(() =>
        withVersion({
          x: {},
          variants: {},
          uiTypeCols: {},
          uiTypes: {},
          codeInfoCols: {},
          codeInfo: {},
        }),
      ),
    ),
  ),
);

export const useHomePageSearch = create(() => ({
  value: "",
}));

export const useInteractive = create(() => ({
  taskMetadata: [],
}));

export const useKeywordRegex = create(() => ({
  pattern: "",
  codeAreaPattern: "",
  fullNameToInfo: {},
}));

// keys for textFields are of the form:
// {sectionId}-null for the main section combobox
// {sectionId}-{paramInfoId} for section parameter fields
export const useWaitingForLSPResult = createProjectState(
  immer(() => ({
    textFields: {},
    parametersRequest: {},
  })),
);

export const useModal = createProjectState(() => ({
  open: false,
  modalType: null,
  modalData: null,
}));

export const useNodeInternals = createProjectState(
  temporal(() =>
    withVersion({
      x: new Map(),
    }),
  ),
);

export const useNotification = create(() => ({
  message: "",
  timeoutId: null,
}));

export const useAllProjectConfigs = createProjectState(() => ({
  x: {},
  names: [],
}));

export const useArtifacts = createProjectState(
  immer(() => ({
    x: {},
  })),
);

export const useProjectConfig = createProjectState(
  temporal(
    immer(() =>
      withVersion({
        id: "",
        name: "",
        isDefault: false,
      }),
    ),
  ),
);

export const useProjectSearch = createProjectState(() => ({
  sections: [],
  codeInfo: [],
  focused: {},
}));

export const useSectionRefs = createProjectState(
  immer(() => ({
    withNested: {},
    selfOnly: {},
  })),
);

export const useSettings = create(() => ({}));

export const useStateVersion = createProjectState(
  temporal(() => withVersion({})),
);

export const useTypeErrors = createProjectState(
  immer(() => ({
    userRequested: false,
    errors: {},
  })),
);

export const useJSONSourceMissing = createProjectState(() => ({}));

export const useWebsocketConnectionList = create(() => ({
  connectedTo: null,
  connections: [],
}));

export const useTemporaryMiscState = createProjectState(
  subscribeWithSelector(() => ({})),
);

export const useParamShortcuts = create(() => ({
  isSelectingParams: false,
}));

export const useMisc = create(
  subscribeWithSelector(
    immer(() => ({
      projectIsLoading: false,
      projectIs404: false,
      mouseDownDrawArea: false,
      mouseDownDraggingSection: false,
      lastPaneClickLocation: { x: 0, y: 0 },
      singletonSections: {
        [C.GLOBAL_VARIABLES]: null,
        [C.GLOBAL_PARAM_SWEEP]: null,
      },
    })),
  ),
);

export const useYamlValue = createProjectState(() => {});

export const useOriginalYamlObj = createProjectState(() => {});
