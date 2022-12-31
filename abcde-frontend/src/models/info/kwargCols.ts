import {
  KwargColStateType,
  KwargColZustandType,
} from "abcde-utils/src/types/kwargCol";
import _ from "lodash";
import { immer } from "zustand/middleware/immer";
import { create } from "../utils";
import { initValue } from "./utils";

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
        _.forEach(collectionIds, (id) => {
          initValue(state.x, id, {});
        });
      }),
    initObjInfoId: ({ collectionId, objInfoId }) =>
      set((state) => {
        initValue(state.x[collectionId], objInfoId, []);
      }),
    setKwargIds: ({ collectionId, objInfoId, newStateFn }) =>
      set((state) => {
        const currState = state.x[collectionId];
        currState[objInfoId] = newStateFn(currState[objInfoId]);
      }),
    setAll: (payload) => set(payload),
    reset: () => set(initialState),
  }))
);
