import { immer } from "zustand/middleware/immer";
import { OutputStateType, OutputZustandType } from "z_utils/types/output";
import { createProjectState } from "../utils";

const initialState: OutputStateType = { x: {} };

export const useOutputs = createProjectState(
  immer<OutputZustandType>((set, get) => ({
    ...initialState,
    resetAndSetAll: (payload) => {
      const s = get();
      s.reset();
      s.setAll({ x: payload });
    },
    appendValues: ({ id, name, values }) =>
      set((state) => {
        if (!(id in state.x)) {
          state.x[id] = { id, name, values };
        } else {
          state.x[id].values.push(...values);
        }
      }),
    setAll: (payload) => set(payload),
    reset: () => set(initialState),
  })),
);
