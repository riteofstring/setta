import { newEV } from "abcde-utils/src/objs/ev";
import { EVStateType, EVZustandType } from "abcde-utils/src/types/ev";
import { immer } from "zustand/middleware/immer";
import { createProjectState } from "../utils";

function getEVInfo(state: EVZustandType, evId: string) {
  if (!(evId in state.x)) {
    state.x[evId] = newEV({ value: null, childId: null });
  }
  return state.x[evId];
}

const initialState: EVStateType = { x: {} };

export const useEnteredValues = createProjectState(
  immer<EVZustandType>((set, get) => ({
    ...initialState,
    resetAndSetAll: (payload) => {
      const s = get();
      s.reset();
      s.setAll({ x: payload });
    },
    initManyEnteredValues: ({ enteredValueIds }) =>
      set((state) => {
        enteredValueIds.forEach((id) => (getEVInfo(state, id).value = null));
      }),
    setEnteredValue: ({ enteredValueId, value }) =>
      set((state) => {
        getEVInfo(state, enteredValueId).value = value;
      }),
    setChildId: ({ enteredValueId, childId }) =>
      set((state) => {
        getEVInfo(state, enteredValueId).childId = childId;
      }),
    setAll: (payload) => set(payload),
    reset: () => set(initialState),
  }))
);
