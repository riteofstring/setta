import { temporal } from "zundo";
import { immer } from "zustand/middleware/immer";
import { UITypeStateType, UITypeZustandType } from "z_utils/types/uiType";
import { createProjectState } from "./utils";

const initialState: UITypeStateType = { x: {}, version: 0 };

export const useUITypes = createProjectState(
  temporal(
    immer<UITypeZustandType>((set) => ({
      ...initialState,
      resetAndSetAll: (payload) => {
        set((state) => ({ ...state, x: payload }), true);
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
      update: (payload) =>
        set((state) => {
          state.x = { ...state.x, ...payload };
        }),
    })),
  ),
);

useUITypes.temporal.getState().pause();
