import {
  OutputStateType,
  OutputZustandType,
} from "abcde-utils/src/types/output";
import { immer } from "zustand/middleware/immer";
import { create } from "../utils";

const initialState: OutputStateType = { x: {} };

export const useOutputs = create(
  immer<OutputZustandType>((set, get) => ({
    ...initialState,
    resetAndSetAll: (payload) => {
      const s = get();
      s.reset();
      s.setAll({ x: payload });
    },
    appendValue: ({ id, value }) =>
      set((state) => {
        state.x[id].values.push(value);
      }),
    setAll: (payload) => set(payload),
    reset: () => set(initialState),
  }))
);
