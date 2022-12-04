import { newUIType } from "classes/uiType";
import _ from "lodash";
import create from "zustand";
import { immer } from "zustand/middleware/immer";

const initialState = { x: {} };

export const useUITypes = create(
  immer((set, get) => ({
    ...initialState,
    resetAndSetAll: (payload) => {
      const uiTypes = _.mapValues(payload, (v) => newUIType(v));
      const s = get();
      s.reset();
      s.setAll({ x: uiTypes });
    },
    setUIType: ({ uiType }) =>
      set((state) => {
        state.x[uiType.id] = uiType;
      }),
    setConfig: ({ uiTypeId, newStateFn }) =>
      set((state) => {
        const curr = state.x[uiTypeId];
        curr.config = newStateFn(curr.config);
      }),
    setOneConfig: ({ uiTypeId, configName, newValueFn }) =>
      set((state) => {
        const curr = state.x[uiTypeId].config;
        curr[configName] = newValueFn(curr[configName]);
      }),
    deleteUIType: ({ uiTypeId }) =>
      set((state) => {
        delete state.x[uiTypeId];
      }),
    setAll: (payload) => set(payload),
    reset: () => set(initialState),
    getAll: () => get().x,
  }))
);
