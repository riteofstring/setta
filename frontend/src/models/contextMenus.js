import { NO_CONTEXT_MENU } from "utils/constants";
import { createProjectState } from "./utils";

const initialInnerState = { isOpen: false, x: 0, y: 0 };
const initialState = {
  pane: { ...initialInnerState },
  node: { ...initialInnerState },
  selection: { ...initialInnerState, nodeIds: [] },
};

export const useContextMenus = createProjectState((set, get) => ({
  ...initialState,
  openPane: (e) => get().open(e, "pane"),
  openNode: (e) => get().open(e, "node"),
  openSelection: (e, nodeIds) => get().open(e, "selection", { nodeIds }),
  open: (e, name, props) => {
    if (NO_CONTEXT_MENU) {
      return;
    }
    e.preventDefault();
    const val = { isOpen: true, x: e.clientX, y: e.clientY, ...props };
    set((state) => ({ [name]: { ...state[name], ...val } }));
  },
  closeAll: () => set({ ...initialState }),
}));
