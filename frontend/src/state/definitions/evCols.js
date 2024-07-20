import _ from "lodash";
import { temporal } from "zundo";
import { immer } from "zustand/middleware/immer";
import { newEV } from "z_utils/objs/ev";
import { createRandomName } from "z_utils/utils";
import { createProjectState, initValue } from "./utils";

const initialState = { x: {}, version: 0 };

export const useEVCols = createProjectState(
  temporal(
    immer((set) => ({
      ...initialState,
      resetAndSetAll: ({ evCols }) => {
        set((state) => ({ ...state, x: evCols }), true);
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
      deleteParamInfo: ({ dbSource, evColId, ids }) =>
        set((state) => {
          state.x[dbSource][evColId].values = _.omit(
            state.x[dbSource][evColId].values,
            ids,
          );
        }),
      update: ({ evCols }) =>
        set((state) => {
          state.x = { ...state.x, ...evCols };
        }),
    })),
  ),
);
