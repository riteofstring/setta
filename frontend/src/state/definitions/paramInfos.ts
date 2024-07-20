import _ from "lodash";
import { temporal } from "zundo";
import { immer } from "zustand/middleware/immer";
import { newEV } from "z_utils/objs/ev";
import {
  ParamInfoStateType,
  ParamInfoZustandType,
} from "z_utils/types/paramInfo";
import { createRandomName } from "z_utils/utils";
import { createProjectState, initValue } from "./utils";

const initialState: ParamInfoStateType = { x: {}, y: {}, version: 0 };

export const useParamInfos = createProjectState(
  temporal(
    immer<ParamInfoZustandType>((set) => ({
      ...initialState,
      resetAndSetAll: ({ evCols, uiTypeCols }) => {
        set((state) => ({ ...state, x: evCols, y: uiTypeCols }), true);
      },
      duplicateEvCol: ({ dbSource, id, newId, newName }) =>
        set((state) => {
          const dbSlice = state.x[dbSource];
          dbSlice[newId] = _.cloneDeep(dbSlice[id]);
          dbSlice[newId].name = newName;
        }),
      duplicateDbSource: ({ oldDbSource, newDbSource }) =>
        set((state) => {
          if (!(newDbSource in state.x)) {
            return;
          }
          const oldDb = state.x[oldDbSource];
          const newDb = state.x[newDbSource];
          for (const evColId of Object.keys(oldDb)) {
            if (!(evColId in newDb)) {
              newDb[evColId] = _.cloneDeep(oldDb[evColId]);
            }
          }
        }),
      initManyEvColIds: ({ dbSource, collectionIds }) =>
        set((state) => {
          _.forEach(collectionIds, (id) => {
            initValue(state.x, dbSource, {});
            initValue(state.x[dbSource], id, {
              name: createRandomName(),
              values: {},
            });
          });
        }),
      initManyEnteredValues: ({ dbSource, collectionId, paramIdsToUITypes }) =>
        set((state) => {
          _.forEach(paramIdsToUITypes, (uiType, id) => {
            state.x[dbSource][collectionId].values[id] = newEV(uiType);
          });
        }),
      setEnteredValue: ({ dbSource, collectionId, paramInfoId, value }) =>
        set((state) => {
          state.x[dbSource][collectionId].values[paramInfoId] = value;
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
            state.y[collectionId][paramInfoId].nonPresetUITypeIds,
          );
        }),
      deleteParamInfo: ({ dbSource, evColId, uiTypeColId, ids }) =>
        set((state) => {
          state.x[dbSource][evColId].values = _.omit(
            state.x[dbSource][evColId].values,
            ids,
          );
          state.y[uiTypeColId] = _.omit(state.y[uiTypeColId], ids);
        }),
      update: ({ evCols, uiTypeCols }) =>
        set((state) => {
          state.x = { ...state.x, ...evCols };
          state.y = { ...state.y, ...uiTypeCols };
        }),
    })),
  ),
);
