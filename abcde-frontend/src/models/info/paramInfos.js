import _ from "lodash";
import create from "zustand";
import { immer } from "zustand/middleware/immer";
import { setToDefault } from "./utils";

const initialState = { x: {}, y: {} };

export const useParamInfos = create(
  immer((set, get) => ({
    ...initialState,
    resetAndSetAll: ({ evCols, uiTypeCols }) => {
      const s = get();
      s.reset();
      s.setAll({ x: evCols, y: uiTypeCols });
    },
    setUITypeId: ({ collectionId, paramInfoId, uiTypeId }) =>
      set((state) => {
        setToDefault(state.y, collectionId)[paramInfoId] = uiTypeId;
      }),
    setEnteredValueId: ({ collectionId, paramInfoId, enteredValueId }) =>
      set((state) => {
        setToDefault(state.x, collectionId)[paramInfoId] = enteredValueId;
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
