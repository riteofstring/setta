import {
  UITypeStateType,
  UITypeZustandType,
} from "abcde-utils/src/types/uiType";
import { immer } from "zustand/middleware/immer";
import { createProjectState } from "../utils";

const initialState: UITypeStateType = { x: {} };

export const useUITypes = createProjectState(
  immer<UITypeZustandType>((set, get) => ({
    ...initialState,
    resetAndSetAll: (payload) => {
      const s = get();
      s.reset();
      s.setAll({ x: payload });
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
  }))
);
