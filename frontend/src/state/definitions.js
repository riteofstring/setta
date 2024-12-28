import C from "constants/constants.json";
import { temporal } from "zundo";
import { subscribeWithSelector } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import {
  create,
  withProjectState,
  withManualReset,
  withResetFn,
  withVersion,
} from "./utils";

export const useActiveSection = withProjectState(
  create(
    temporal(
      withResetFn(() =>
        withVersion({
          ids: [],
        }),
      ),
    ),
  ),
);

export const useContextMenus = withProjectState(
  create(
    withResetFn(() => ({
      pane: { isOpen: false, x: 0, y: 0 },
      group: { isOpen: false, x: 0, y: 0, sectionId: null },
      selection: { isOpen: false, x: 0, y: 0, nodeIds: [] },
    })),
  ),
);

export const useSectionInfos = withProjectState(
  create(
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
              artifactGroups: {},
              singletonSections: {
                [C.GLOBAL_VARIABLES]: null,
                [C.GLOBAL_PARAM_SWEEP]: null,
              },
              shouldRenameReferences: false,
            }),
          ),
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
export const useWaitingForLSPResult = withProjectState(
  create(
    immer(
      withResetFn(() => ({
        textFields: {},
        parametersRequest: {},
      })),
    ),
  ),
);

export const useModal = withProjectState(
  create(
    withResetFn(() => ({
      open: false,
      modalType: null,
      modalData: null,
    })),
  ),
);

export const useNodeInternals = withProjectState(
  create(
    temporal(
      withResetFn(() =>
        withVersion({
          x: new Map(),
        }),
      ),
    ),
  ),
);

export const useNotification = create(
  withResetFn(() => ({
    message: "",
    timeoutId: null,
  })),
);

export const useAllProjectConfigs = create(
  withResetFn(() => ({
    x: {},
    names: [],
  })),
);

export const useArtifacts = withManualReset(
  withProjectState(create(() => ({}))),
);

export const useProjectConfig = withProjectState(
  create(
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
  ),
);

export const useProjectSearch = withProjectState(
  create(
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
  create(
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

export const useSettings = create(() => ({}));

export const useStateVersion = withProjectState(
  create(temporal(withResetFn(() => withVersion({})))),
);

export const useTypeErrors = withProjectState(
  create(
    immer(
      withResetFn(() => ({
        userRequested: false,
        errors: {},
      })),
    ),
  ),
);

export const useWebsocketConnectionList = create(
  withResetFn(() => ({
    connectedTo: null,
    connections: [],
  })),
);

export const useTemporaryMiscState = withManualReset(
  withProjectState(create(subscribeWithSelector(() => ({})))),
);

export const useProjectLoading = create(
  withResetFn(() => ({ projectIsLoading: false, projectIs404: false })),
);

export const useMisc = withProjectState(
  create(
    subscribeWithSelector(
      withResetFn(() => ({
        mouseDownDrawArea: false,
        mouseDownDraggingSection: false,
        lastPaneClickLocation: { x: 0, y: 0 },
        undoOrRedoWasTriggered: false,
        isSelectingParams: false,
        numDisplayedCodeAreas: 0,
        numInitializedCodeAreas: 0,
        requestUpdateNodeDimensions: false,
      })),
    ),
  ),
);

export const useYamlValue = withManualReset(
  withProjectState(create(() => {})),
);

export const useOriginalYamlObj = withManualReset(
  withProjectState(create(() => {})),
);

export const useSectionColumnWidth = withManualReset(
  withProjectState(create(subscribeWithSelector(() => {}))),
);

export const useResizerStore = withProjectState(
  create(
    withResetFn(() => ({
      activeResizer: null, // { sectionId, ref, startX, startWidth, containerWidth, maxNestedDepth }
      globalEventListenersInitialized: false,
    })),
  ),
);

export const useInfoToEVReferrer = withManualReset(
  withProjectState(create(() => ({}))),
);
