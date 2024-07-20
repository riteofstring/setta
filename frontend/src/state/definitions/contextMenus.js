import { createProjectState } from "./utils";

const initialInnerState = { isOpen: false, x: 0, y: 0 };
const initialState = {
  pane: { ...initialInnerState },
  deck: { ...initialInnerState, sectionId: null },
  selection: { ...initialInnerState, nodeIds: [] },
};

export const useContextMenus = createProjectState((set) => ({
  ...initialState,
  reset: () => {
    set(initialState);
  },
}));
