import {
  OutputStateType,
  OutputZustandType,
} from "abcde-utils/src/types/output";
import { immer } from "zustand/middleware/immer";
import { create } from "../utils";

function getOutput(state: OutputZustandType, group: string, key: string) {
  if (!(group in state.x)) {
    state.x[group] = {};
  }
  if (!(key in state.x[group])) {
    state.x[group][key] = [];
  }
  return state.x[group][key];
}

const initialState: OutputStateType = { x: {} };

export const useOutputs = create(
  immer<OutputZustandType>((set, get) => ({
    ...initialState,
    resetAndSetAll: (payload) => {
      const s = get();
      s.reset();
      s.setAll({ x: payload });
    },
    appendValue: ({ group, key, value }) =>
      set((state) => {
        getOutput(state, group, key).push(value);
      }),
    setAll: (payload) => set(payload),
    reset: () => set(initialState),
  }))
);
