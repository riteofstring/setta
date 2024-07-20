import { immer } from "zustand/middleware/immer";
import {
  OutputGroupStateType,
  OutputGroupZustandType,
} from "z_utils/types/outputGroup";
import { createProjectState } from "./utils";

const initialState: OutputGroupStateType = { x: {} };

export const useOutputGroups = createProjectState(
  immer<OutputGroupZustandType>((set, get) => ({
    ...initialState,
    resetAndSetAll: (payload) => {
      const s = get();
      s.reset();
      s.setAll({ x: payload });
    },
    addChildren: ({ id, name, children }) =>
      set((state) => {
        if (!(id in state.x)) {
          state.x[id] = { id, name, children };
        } else {
          const currChildren = state.x[id].children;
          for (const c of children) {
            if (!currChildren.includes(c)) {
              currChildren.push(c);
            }
          }
        }
      }),
    setAll: (payload) => set(payload),
    reset: () => set(initialState),
  })),
);
