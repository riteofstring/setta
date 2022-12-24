import { newEVInfo } from "classes/mutableInfo";
import _ from "lodash";
import { immer } from "zustand/middleware/immer";
import { create } from "../utils";

function getEVInfo(state, evId) {
  if (!(evId in state.x)) {
    state.x[evId] = newEVInfo({ id: evId });
  }
  return state.x[evId];
}

const initialState = { x: {} };

export const useEnteredValues = create(
  immer((set, get) => ({
    ...initialState,
    resetAndSetAll: (payload) => {
      const evs = _.mapValues(payload, (v, k) => newEVInfo({ id: k, ...v }));
      const s = get();
      s.reset();
      s.setAll({ x: evs });
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
    getAll: () => get().x,
  }))
);
