import _ from "lodash";
import { temporal } from "zundo";
import { immer } from "zustand/middleware/immer";
import { newEV } from "z_utils/objs/ev";
import {
  ParamInfoStateType,
  ParamInfoZustandType,
} from "z_utils/types/paramInfo";
import { createProjectState } from "../utils";
import { initValue } from "./utils";

const initialState: ParamInfoStateType = { x: {}, y: {}, version: 0 };

export const useParamInfos = createProjectState(
  temporal(
    immer<ParamInfoZustandType>((set) => ({
      ...initialState,
      resetAndSetAll: ({ evCols, uiTypeCols }) => {
        set((state) => ({ ...state, x: evCols, y: uiTypeCols }), true);
      },
      initManyEvColIds: ({ collectionIds }) =>
        set((state) => {
          _.forEach(collectionIds, (id) => initValue(state.x, id, {}));
        }),
      initManyEnteredValues: ({ collectionId, paramIdsToUITypes }) =>
        set((state) => {
          _.forEach(paramIdsToUITypes, (uiType, id) => {
            state.x[collectionId][id] = newEV(uiType);
          });
        }),
      setEnteredValue: ({ collectionId, paramInfoId, value }) =>
        set((state) => {
          state.x[collectionId][paramInfoId] = value;
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
          state.y[collectionId][paramInfoId].uiTypeId = uiTypeId;
        }),
      setNonPresetUITypeIds: ({ collectionId, paramInfoId, newValueFn }) =>
        set((state) => {
          state.y[collectionId][paramInfoId].nonPresetUITypeIds = newValueFn(
            state.y[collectionId][paramInfoId].nonPresetUITypeIds
          );
        }),
      deleteParamInfo: ({ evColId, uiTypeColId, ids }) =>
        set((state) => {
          state.x[evColId] = _.omit(state.x[evColId], ids);
          state.y[uiTypeColId] = _.omit(state.y[uiTypeColId], ids);
        }),
      update: ({ evCols, uiTypeCols }) =>
        set((state) => {
          state.x = { ...state.x, ...evCols };
          state.y = { ...state.y, ...uiTypeCols };
        }),
    }))
  )
);

useParamInfos.temporal.getState().pause();
