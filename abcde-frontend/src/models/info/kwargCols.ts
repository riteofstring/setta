import {
  KwargColStateType,
  KwargColZustandType,
} from "abcde-utils/src/types/kwargCol";
import _ from "lodash";
import { immer } from "zustand/middleware/immer";
import { createProjectState } from "../utils";
import { initValue } from "./utils";

const initialState: KwargColStateType = { x: {} };

export const useKwargCols = createProjectState(
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
    setKwargIds: ({ collectionId, objInfoId, newStateFn }) =>
      set((state) => {
        const currState = state.x[collectionId];
        const currIds = currState[objInfoId];
        currState[objInfoId] = newStateFn(currIds ? currIds : []);
      }),
    setAll: (payload) => set(payload),
    reset: () => set(initialState),
  }))
);
