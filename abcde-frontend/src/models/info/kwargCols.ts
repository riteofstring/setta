import {
  KwargColStateType,
  KwargColZustandType,
} from "abcde-utils/src/types/kwargCol";
import _ from "lodash";
import { temporal } from "zundo";
import { immer } from "zustand/middleware/immer";
import { createProjectState } from "../utils";
import { initValue } from "./utils";

const initialState: KwargColStateType = { x: {}, version: 0 };

export const useKwargCols = createProjectState(
  temporal(
    immer<KwargColZustandType>((set) => ({
      ...initialState,
      resetAndSetAll: (payload) => {
        set((state) => ({ ...state, x: payload }), true);
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
    }))
  )
);

useKwargCols.temporal.getState().pause();
