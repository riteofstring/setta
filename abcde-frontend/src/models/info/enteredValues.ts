import { newEV } from "abcde-utils/src/objs/ev";
import { EVStateType, EVZustandType } from "abcde-utils/src/types/ev";
import { immer } from "zustand/middleware/immer";
import { create } from "../utils";

function getEVInfo(state: EVZustandType, evId: string) {
  if (!(evId in state.x)) {
    state.x[evId] = newEV({ id: evId, value: null, childId: null });
  }
  return state.x[evId];
}

const initialState: EVStateType = { x: {} };

export const useEnteredValues = create(
  immer<EVZustandType>((set, get) => ({
    ...initialState,
    resetAndSetAll: (payload) => {
      const s = get();
      s.reset();
      s.setAll({ x: payload });
    },
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
