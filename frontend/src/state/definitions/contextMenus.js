import { createProjectState, stateWithResetFn } from "./utils";

export const useContextMenus = createProjectState(
  stateWithResetFn({
    pane: { isOpen: false, x: 0, y: 0 },
    deck: { isOpen: false, x: 0, y: 0, sectionId: null },
    selection: { isOpen: false, x: 0, y: 0, nodeIds: [] },
  }),
);
