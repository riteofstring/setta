import { createNewId } from "utils/idNameCreation";
import { temporal } from "zundo";
import { immer } from "zustand/middleware/immer";
import {
  create,
  createProjectState,
  stateWithResetFn,
} from "./definitions/utils";

export const useActiveSection = createProjectState(
  temporal(() => ({
    ids: [],
    version: 0,
  })),
);

export const useCodeInfo = createProjectState(
  temporal(
    immer(() => ({
      x: {},
      version: 0,
    })),
  ),
);

export const useContextMenus = createProjectState(
  stateWithResetFn({
    pane: { isOpen: false, x: 0, y: 0 },
    deck: { isOpen: false, x: 0, y: 0, sectionId: null },
    selection: { isOpen: false, x: 0, y: 0, nodeIds: [] },
  }),
);

export const useEVCols = createProjectState(
  temporal(
    immer(() => ({
      x: {},
      version: 0,
    })),
  ),
);

export const useHomePageSearch = create(() => ({
  value: "",
}));

export const useInfoView = createProjectState(() => ({
  currValue: "",
}));

export const useInteractive = create(() => ({
  id: createNewId(),
  projects: new Set(),
  currProjectIsInteractive: false,
  data: null,
}));

export const useKeywordRegex = create(() => ({
  pattern: "",
  fullNameToInfo: {},
}));

// map from key to true or false
// keys are of the form:
// {sectionId}-null for the main section combobox
// {sectionId}-{paramInfoId} for section parameter fields
export const useWaitingForLSPResult = createProjectState(() => ({}));

export const useModal = createProjectState(() => ({
  open: false,
  modalType: null,
  modalData: null,
}));

export const useNodeInternals = createProjectState(
  temporal(() => ({
    x: new Map(),
    version: 0,
  })),
);

export const useNotification = create(() => ({
  message: "",
  timeoutId: null,
}));

export const useOtherProjectConfigs = createProjectState(
  immer(() => ({
    x: [],
  })),
);

export const useOutputGroups = createProjectState(
  immer(() => ({
    x: {},
  })),
);
