import {
  ParamInfoStateType,
  ParamInfoZustandType,
} from "abcde-utils/src/types/paramInfo";
import _ from "lodash";
import { immer } from "zustand/middleware/immer";
import { createProjectState } from "../utils";
import { initValue } from "./utils";

const initialState: ParamInfoStateType = { x: {}, y: {} };

export const useParamInfos = createProjectState(
  immer<ParamInfoZustandType>((set, get) => ({
    ...initialState,
    resetAndSetAll: ({ evCols, uiTypeCols }) => {
      const s = get();
      s.reset();
      s.setAll({ x: evCols, y: uiTypeCols });
    },
    initManyEvColIds: ({ collectionIds }) =>
      set((state) => {
        _.forEach(collectionIds, (id) => initValue(state.x, id, {}));
      }),
    setManyEnteredValueIds: ({ collectionId, paramIdToEvId }) =>
      set((state) => {
        state.x[collectionId] = { ...state.x[collectionId], ...paramIdToEvId };
      }),
    setEnteredValueId: ({ collectionId, paramInfoId, enteredValueId }) =>
      set((state) => {
        state.x[collectionId][paramInfoId] = enteredValueId;
      }),
    initManyUITypeColIds: ({ collectionIds }) =>
      set((state) => {
        _.forEach(collectionIds, (id) => initValue(state.y, id, {}));
      }),
    setManyUITypeIds: ({ collectionId, paramIdToUITypeId }) =>
      set((state) => {
        state.y[collectionId] = {
          ...state.y[collectionId],
          ...paramIdToUITypeId,
        };
      }),
    setUITypeId: ({ collectionId, paramInfoId, uiTypeId }) =>
      set((state) => {
        state.y[collectionId][paramInfoId] = uiTypeId;
      }),
    deleteParamInfo: ({ evColId, uiTypeColId, ids }) =>
      set((state) => {
        state.x[evColId] = _.omit(state.x[evColId], ids);
        state.y[uiTypeColId] = _.omit(state.y[uiTypeColId], ids);
      }),
    setAll: (payload) => set(payload),
    reset: () => set(initialState),
  }))
);
