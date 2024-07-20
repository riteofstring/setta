import _ from "lodash";
import { temporal } from "zundo";
import { immer } from "zustand/middleware/immer";
import { createProjectState, initValue } from "./utils";

const initialState = { y: {}, version: 0 };

export const useUITypeCols = createProjectState(
  temporal(
    immer((set) => ({
      ...initialState,
      resetAndSetAll: ({ uiTypeCols }) => {
        set((state) => ({ ...state, y: uiTypeCols }), true);
      },
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
          state.y[collectionId][paramInfoId].uiTypeId = uiTypeId;
        }),
      setNonPresetUITypeIds: ({ collectionId, paramInfoId, newValueFn }) =>
        set((state) => {
          state.y[collectionId][paramInfoId].nonPresetUITypeIds = newValueFn(
            state.y[collectionId][paramInfoId].nonPresetUITypeIds,
          );
        }),
      deleteParamInfo: ({ uiTypeColId, ids }) =>
        set((state) => {
          state.y[uiTypeColId] = _.omit(state.y[uiTypeColId], ids);
        }),
      update: ({ evCols, uiTypeCols }) =>
        set((state) => {
          state.y = { ...state.y, ...uiTypeCols };
        }),
    })),
  ),
);
