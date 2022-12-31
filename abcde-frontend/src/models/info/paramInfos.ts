import {
  ParamInfoStateType,
  ParamInfoZustandType,
} from "abcde-utils/src/types/paramInfo";
import _ from "lodash";
import { immer } from "zustand/middleware/immer";
import { create } from "../utils";
import { setToDefault } from "./utils";

const initialState: ParamInfoStateType = { x: {}, y: {} };

export const useParamInfos = create(
  immer<ParamInfoZustandType>((set, get) => ({
    ...initialState,
    resetAndSetAll: ({ evCols, uiTypeCols }) => {
      const s = get();
      s.reset();
      s.setAll({ x: evCols, y: uiTypeCols });
    },
    initManyEvColIds: ({ collectionIds }) =>
      set((state) => {
        _.forEach(collectionIds, (id) => (state.x[id] = {}));
      }),
    setEnteredValueId: ({ collectionId, paramInfoId, enteredValueId }) =>
      set((state) => {
        setToDefault(state.x, collectionId)[paramInfoId] = enteredValueId;
      }),
    setUITypeId: ({ collectionId, paramInfoId, uiTypeId }) =>
      set((state) => {
        setToDefault(state.y, collectionId)[paramInfoId] = uiTypeId;
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
