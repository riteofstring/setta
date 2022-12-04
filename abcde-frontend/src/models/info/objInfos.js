import create from "zustand";
import { immer } from "zustand/middleware/immer";
import { setToDefault } from "./utils";

const initialState = { x: {} };

export const useObjInfos = create(
  immer((set, get) => ({
    ...initialState,
    resetAndSetAll: (payload) => {
      const s = get();
      s.reset();
      s.setAll({ x: payload });
    },
    setKwargIds: ({ collectionId, objInfoId, newStateFn }) =>
      set((state) => {
        const currState = setToDefault(state.x, collectionId);
        if (!(objInfoId in currState)) {
          currState[objInfoId] = [];
        }
        currState[objInfoId] = newStateFn(currState[objInfoId]);
      }),
    setAll: (payload) => set(payload),
    reset: () => set(initialState),
    getAll: () => get().x,
  }))
);
