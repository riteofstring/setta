import {
  KwargColStateType,
  KwargColZustandType,
} from "abcde-utils/src/types/kwargCol";
import _ from "lodash";
import { immer } from "zustand/middleware/immer";
import { create } from "../utils";
import { setToDefault } from "./utils";

const initialState: KwargColStateType = { x: {} };

export const useKwargCols = create(
  immer<KwargColZustandType>((set, get) => ({
    ...initialState,
    resetAndSetAll: (payload) => {
      const s = get();
      s.reset();
      s.setAll({ x: payload });
    },
    initManyKwargColIds: ({ collectionIds }) =>
      set((state) => {
        _.forEach(collectionIds, (id) => (state.x[id] = {}));
      }),
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
  }))
);
