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
